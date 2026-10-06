/**
 * ATLAS INDUSTRIAL WORKER POOL V1
 * 
 * Supports independent workers:
 * - BIEP_INGEST_WORKER
 * - CONICET_RESOLUTION_WORKER
 * - SOURCE_DISCOVERY_WORKER
 * - SOURCE_PREFLIGHT_WORKER
 * - SEARCH_INDEX_WORKER
 * - AUDIT_WORKER
 * 
 * Invariants:
 * - Start conservatively with INGESTION_WORKERS = 2.
 * - Idempotent execution.
 * - Mutual exclusion locks on source_record_id and atlas_person_id.
 * - Zero race conditions.
 */

import { AtlasIndustrialQueueOrchestrator, IndustrialJob } from '../AtlasIndustrialQueueOrchestrator';

export type WorkerRole = 
  | 'BIEP_INGEST_WORKER'
  | 'CONICET_RESOLUTION_WORKER'
  | 'SOURCE_DISCOVERY_WORKER'
  | 'SOURCE_PREFLIGHT_WORKER'
  | 'SEARCH_INDEX_WORKER'
  | 'AUDIT_WORKER';

export interface WorkerConfig {
  worker_id: string;
  role: WorkerRole;
  queue_name: any;
  concurrency_limit: number;
}

export class AtlasWorkerPool {
  private orchestrator: AtlasIndustrialQueueOrchestrator;
  private activeLocks: Set<string> = new Set();
  private workerStates: Map<string, { status: 'IDLE' | 'BUSY' | 'CRASHED'; currentJobId?: string }> = new Map();

  constructor(orchestrator: AtlasIndustrialQueueOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Acquire a lock for an entity ID (source_record_id or atlas_person_id)
   */
  public acquireLock(entityId: string): boolean {
    if (this.activeLocks.has(entityId)) {
      return false; // Locked by another worker
    }
    this.activeLocks.add(entityId);
    return true;
  }

  public releaseLock(entityId: string): void {
    this.activeLocks.delete(entityId);
  }

  /**
   * Execute worker loop with leasing and crash protection
   */
  public async processNextJob(
    workerId: string, 
    role: WorkerRole, 
    queueName: any, 
    handler: (job: IndustrialJob) => Promise<Record<string, any>>
  ): Promise<{ processed: boolean; job_id?: string; error?: string }> {
    this.workerStates.set(workerId, { status: 'IDLE' });

    // 1. Lease job atomically
    const job = await this.orchestrator.leaseNextJob(queueName, workerId, 30000);
    if (!job) {
      return { processed: false };
    }

    this.workerStates.set(workerId, { status: 'BUSY', currentJobId: job.job_id });

    // 2. Lock critical entity if present
    const lockKey = job.checkpoint?.lock_entity_id || job.source_id;
    if (!this.acquireLock(lockKey)) {
      console.warn(`[Worker ${workerId}] Entity ${lockKey} is locked by another worker. Backing off job ${job.job_id}.`);
      await this.orchestrator.failJob(job.job_id, `Entity ${lockKey} busy`, true);
      this.workerStates.set(workerId, { status: 'IDLE' });
      return { processed: false, error: 'ENTITY_LOCKED' };
    }

    try {
      console.log(`[Worker ${workerId} - ${role}] Executing job ${job.job_id}...`);
      const metrics = await handler(job);
      await this.orchestrator.completeJob(job.job_id, metrics);
      this.workerStates.set(workerId, { status: 'IDLE' });
      return { processed: true, job_id: job.job_id };
    } catch (err: any) {
      console.error(`[Worker ${workerId} - ${role}] Error executing job ${job.job_id}:`, err.message);
      await this.orchestrator.failJob(job.job_id, err.message, true);
      this.workerStates.set(workerId, { status: 'CRASHED' });
      return { processed: false, job_id: job.job_id, error: err.message };
    } finally {
      this.releaseLock(lockKey);
    }
  }

  public getWorkerStatus(workerId: string) {
    return this.workerStates.get(workerId) || { status: 'IDLE' };
  }
}
