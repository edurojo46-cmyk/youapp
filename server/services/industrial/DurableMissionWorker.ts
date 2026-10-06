import type { Pool } from 'pg';
import crypto from 'crypto';
import { DurableMissionQueue, type PersistentWorkItem } from './DurableMissionQueue';
import { MissionOrchestrator, type MissionTerminationProof } from './MissionOrchestrator';

export class DurableMissionWorker {
  private static instance: DurableMissionWorker;
  private dbPool: Pool;
  private queue: DurableMissionQueue;
  private workerId: string;
  private buildId: string = 'ATLAS_CANONICAL_V1';
  private startedAt: string;
  private isRunning: boolean = false;
  private loopInterval?: NodeJS.Timeout;
  private static activeWorkerCount: number = 0;

  private constructor(pool: Pool) {
    this.dbPool = pool;
    this.queue = DurableMissionQueue.getInstance(pool);
    this.workerId = `WORKER_${process.pid}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    this.startedAt = new Date().toISOString();
  }

  public static getInstance(pool: Pool): DurableMissionWorker {
    if (!this.instance) {
      this.instance = new DurableMissionWorker(pool);
    }
    return this.instance;
  }

  public getWorkerMetadata() {
    return {
      worker_id: this.workerId,
      build_id: this.buildId,
      started_at: this.startedAt,
      role: 'DURABLE_MISSION_WORKER',
      pid: process.pid,
      heartbeat_at: new Date().toISOString(),
      is_running: this.isRunning
    };
  }

  public static getActiveWorkerCount(): number {
    return DurableMissionWorker.activeWorkerCount;
  }

  /**
   * Bootstraps durable queue recovery on backend boot
   * Reclaims expired leases and recovers orphan missions that were running
   */
  public async bootstrapRecovery(): Promise<{ reclaimedLeases: number; recoveredMissions: string[] }> {
    await this.queue.ensureSchema();

    // 1. Reclaim any expired leases from previous dead workers
    const reclaimed = await this.queue.reclaimExpiredLeases();
    if (reclaimed > 0) {
      console.log(`[DurableMissionWorker] Reclaimed ${reclaimed} expired work item leases from previous process.`);
    }

    // 2. Discover running or starting missions that need active worker execution
    const mRes = await this.dbPool.query(`
      SELECT mission_id, objective, target_new_records, certified_new_searchable, status
      FROM public.atlas_discovery_missions
      WHERE status IN ('RUNNING', 'STARTING')
      ORDER BY updated_at DESC;
    `);

    const recoveredMissions: string[] = [];
    for (const mRow of mRes.rows) {
      recoveredMissions.push(mRow.mission_id);
      console.log(`[DurableMissionWorker] Auto-recovering active mission ${mRow.mission_id} (${mRow.objective}) after process restart.`);
    }

    // Start background worker supervisor
    this.startWorkerSupervisor();

    return { reclaimedLeases: reclaimed, recoveredMissions };
  }

  /**
   * Starts background supervisor for lease expiration reclamation and worker heartbeats
   */
  public startWorkerSupervisor(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    DurableMissionWorker.activeWorkerCount = 1;

    this.loopInterval = setInterval(async () => {
      try {
        await this.queue.reclaimExpiredLeases();
      } catch (err: any) {
        console.warn('[DurableMissionWorker] Supervisor error during lease reclamation:', err.message);
      }
    }, 15000);
  }

  public stopWorkerSupervisor(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = undefined;
    }
    this.isRunning = false;
    DurableMissionWorker.activeWorkerCount = 0;
  }

  /**
   * Populates durable frontier work items for a mission
   */
  public async populateMissionWorkItems(
    missionId: string,
    geographyId: string,
    frontierPaths: Array<{
      source_id: string;
      resource?: string;
      connector?: string;
      priority?: number;
      role?: string;
    }>
  ): Promise<number> {
    let created = 0;
    for (const p of frontierPaths) {
      // Avoid duplicate probe work items for the same source in the same mission
      const existing = await this.dbPool.query(`
        SELECT work_item_id FROM public.atlas_mission_work_items
        WHERE mission_id = $1 AND source_id = $2;
      `, [missionId, p.source_id]);

      if (existing.rows.length === 0) {
        await this.queue.enqueueWorkItem({
          mission_id: missionId,
          source_id: p.source_id,
          source_name: p.resource || p.source_id,
          source_url: p.resource,
          kind: 'SOURCE_PROBE',
          geography_id: geographyId,
          priority: p.priority || 50,
          payload: {
            connector: p.connector,
            role: p.role
          }
        });
        created++;
      }
    }
    return created;
  }
}
