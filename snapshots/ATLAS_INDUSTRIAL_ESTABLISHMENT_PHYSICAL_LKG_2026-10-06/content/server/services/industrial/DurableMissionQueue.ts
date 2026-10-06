import type { Pool } from 'pg';
import crypto from 'crypto';

export interface PersistentWorkItem {
  work_item_id: string;
  mission_id: string;
  source_id: string;
  source_name?: string | null;
  source_url?: string | null;
  kind: 'SOURCE_PROBE' | 'SOURCE_ACQUISITION' | 'EXPANSION';
  geography_id: string;
  priority: number;
  status: 'AVAILABLE' | 'LEASED' | 'RUNNING' | 'COMPLETED' | 'RETRY' | 'FAILED';
  worker_id?: string | null;
  executor_family?: string | null;
  lease_token?: string | null;
  lease_started_at?: string | null;
  lease_expires_at?: string | null;
  heartbeat_at?: string | null;
  attempt_count: number;
  max_attempts: number;
  items_scanned: number;
  items_yielded: number;
  last_error?: string | null;
  payload: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export class DurableMissionQueue {
  private static instance: DurableMissionQueue;
  private dbPool: Pool;

  private constructor(pool: Pool) {
    this.dbPool = pool;
  }

  public static getInstance(pool: Pool): DurableMissionQueue {
    if (!this.instance) {
      this.instance = new DurableMissionQueue(pool);
    }
    return this.instance;
  }

  public async ensureSchema(): Promise<void> {
    await this.dbPool.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_mission_work_items (
        work_item_id VARCHAR(120) PRIMARY KEY,
        mission_id VARCHAR(120) NOT NULL REFERENCES public.atlas_discovery_missions(mission_id) ON DELETE CASCADE,
        source_id VARCHAR(255) NOT NULL,
        source_name VARCHAR(255),
        source_url TEXT,
        kind VARCHAR(60) NOT NULL,
        geography_id VARCHAR(100) NOT NULL,
        priority INT NOT NULL DEFAULT 50,
        status VARCHAR(60) NOT NULL DEFAULT 'AVAILABLE',
        worker_id VARCHAR(120),
        executor_family VARCHAR(80),
        lease_token VARCHAR(120),
        lease_started_at TIMESTAMPTZ,
        lease_expires_at TIMESTAMPTZ,
        heartbeat_at TIMESTAMPTZ,
        attempt_count INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        items_scanned INT NOT NULL DEFAULT 0,
        items_yielded INT NOT NULL DEFAULT 0,
        last_error TEXT,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_mission_work_items_claim 
      ON public.atlas_mission_work_items (status, lease_expires_at);
      CREATE INDEX IF NOT EXISTS idx_mission_work_items_mission 
      ON public.atlas_mission_work_items (mission_id, status);
    `);
  }

  public async enqueueWorkItem(item: {
    mission_id: string;
    source_id: string;
    source_name?: string;
    source_url?: string;
    kind: 'SOURCE_PROBE' | 'SOURCE_ACQUISITION' | 'EXPANSION';
    geography_id: string;
    priority?: number;
    payload?: Record<string, any>;
  }): Promise<PersistentWorkItem> {
    const workItemId = `WORK_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const res = await this.dbPool.query(`
      INSERT INTO public.atlas_mission_work_items (
        work_item_id, mission_id, source_id, source_name, source_url,
        kind, geography_id, priority, status, payload, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 'AVAILABLE', $9, NOW(), NOW()
      )
      RETURNING *;
    `, [
      workItemId,
      item.mission_id,
      item.source_id,
      item.source_name || item.source_id,
      item.source_url || null,
      item.kind,
      item.geography_id,
      item.priority || 50,
      JSON.stringify(item.payload || {})
    ]);
    return res.rows[0];
  }

  public async claimNextWorkItem(
    workerId: string,
    executorFamily: string,
    missionId?: string,
    leaseDurationSec: number = 45
  ): Promise<PersistentWorkItem | null> {
    const leaseToken = crypto.randomUUID();
    const res = await this.dbPool.query(`
      UPDATE public.atlas_mission_work_items
      SET 
        status = 'LEASED',
        worker_id = $1,
        executor_family = $2,
        lease_token = $3,
        lease_started_at = NOW(),
        lease_expires_at = NOW() + ($4 || ' seconds')::interval,
        heartbeat_at = NOW(),
        attempt_count = attempt_count + 1,
        updated_at = NOW()
      WHERE work_item_id = (
        SELECT work_item_id
        FROM public.atlas_mission_work_items
        WHERE 
          status IN ('AVAILABLE', 'RETRY')
          AND ($5::text IS NULL OR mission_id = $5)
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `, [workerId, executorFamily, leaseToken, leaseDurationSec, missionId || null]);

    return res.rows[0] || null;
  }

  public async markRunning(workItemId: string, leaseToken: string): Promise<boolean> {
    const res = await this.dbPool.query(`
      UPDATE public.atlas_mission_work_items
      SET status = 'RUNNING', updated_at = NOW()
      WHERE work_item_id = $1 AND lease_token = $2 AND status = 'LEASED';
    `, [workItemId, leaseToken]);
    return (res.rowCount || 0) > 0;
  }

  public async heartbeat(workItemId: string, leaseToken: string, extendSec: number = 45): Promise<boolean> {
    const res = await this.dbPool.query(`
      UPDATE public.atlas_mission_work_items
      SET 
        heartbeat_at = NOW(),
        lease_expires_at = NOW() + ($3 || ' seconds')::interval,
        updated_at = NOW()
      WHERE work_item_id = $1 AND lease_token = $2 AND status IN ('LEASED', 'RUNNING');
    `, [workItemId, leaseToken, extendSec]);
    return (res.rowCount || 0) > 0;
  }

  public async completeWorkItem(
    workItemId: string,
    leaseToken: string,
    itemsScanned: number,
    itemsYielded: number,
    lastError?: string | null
  ): Promise<boolean> {
    const res = await this.dbPool.query(`
      UPDATE public.atlas_mission_work_items
      SET 
        status = 'COMPLETED',
        items_scanned = $1,
        items_yielded = $2,
        last_error = $3,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE work_item_id = $4 AND lease_token = $5;
    `, [itemsScanned, itemsYielded, lastError || null, workItemId, leaseToken]);
    return (res.rowCount || 0) > 0;
  }

  public async failWorkItem(
    workItemId: string,
    leaseToken: string,
    error: string,
    allowRetry: boolean = true
  ): Promise<void> {
    if (allowRetry) {
      await this.dbPool.query(`
        UPDATE public.atlas_mission_work_items
        SET 
          status = CASE WHEN attempt_count < max_attempts THEN 'RETRY' ELSE 'FAILED' END,
          last_error = $1,
          worker_id = NULL,
          lease_token = NULL,
          updated_at = NOW()
        WHERE work_item_id = $2 AND lease_token = $3;
      `, [error, workItemId, leaseToken]);
    } else {
      await this.dbPool.query(`
        UPDATE public.atlas_mission_work_items
        SET 
          status = 'FAILED',
          last_error = $1,
          updated_at = NOW()
        WHERE work_item_id = $2 AND lease_token = $3;
      `, [error, workItemId, leaseToken]);
    }
  }

  public async reclaimExpiredLeases(): Promise<number> {
    const res = await this.dbPool.query(`
      UPDATE public.atlas_mission_work_items
      SET 
        status = CASE WHEN attempt_count < max_attempts THEN 'RETRY' ELSE 'FAILED' END,
        last_error = 'Lease expired without heartbeat / worker died',
        worker_id = NULL,
        lease_token = NULL,
        updated_at = NOW()
      WHERE 
        status IN ('LEASED', 'RUNNING')
        AND lease_expires_at < NOW();
    `);
    return res.rowCount || 0;
  }

  public async getMissionWorkItems(missionId: string): Promise<PersistentWorkItem[]> {
    const res = await this.dbPool.query(`
      SELECT *
      FROM public.atlas_mission_work_items
      WHERE mission_id = $1
      ORDER BY priority DESC, created_at ASC;
    `, [missionId]);
    return res.rows;
  }

  public async getPendingCount(missionId: string): Promise<number> {
    const res = await this.dbPool.query(`
      SELECT count(*) as count
      FROM public.atlas_mission_work_items
      WHERE mission_id = $1 AND status IN ('AVAILABLE', 'LEASED', 'RUNNING', 'RETRY');
    `, [missionId]);
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  public async getQueueMetrics(missionId?: string): Promise<Record<string, number>> {
    const res = await this.dbPool.query(`
      SELECT status, count(*) as count
      FROM public.atlas_mission_work_items
      WHERE ($1::text IS NULL OR mission_id = $1)
      GROUP BY status;
    `, [missionId || null]);
    const metrics: Record<string, number> = {
      AVAILABLE: 0,
      LEASED: 0,
      RUNNING: 0,
      COMPLETED: 0,
      RETRY: 0,
      FAILED: 0
    };
    for (const r of res.rows) {
      metrics[r.status] = parseInt(r.count, 10);
    }
    return metrics;
  }
}
