/**
 * ATLAS INDUSTRIAL FACTORY V2 — BIEP SCALING TO 150K MILESTONE
 * 
 * Advances BIEP from 86,000 unique persons (+40,000) to 126,000 unique persons,
 * bringing Atlas Argentina to 150,047 UNIQUE PERSONS.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AtlasIndustrialQueueOrchestrator } from '../src/lib/orchestrator/AtlasIndustrialQueueOrchestrator';
import { AtlasWorkerPool } from '../src/lib/orchestrator/workers/AtlasWorkerPool';
import { runContinuousIngestion } from './run_biep_continuous_ingestion';
import { runReconciliation } from './reconcile_caba_universe_v1_1';
import { invalidatePeopleScaleMetricsCache } from '../src/lib/search/AtlasPeopleScaleMetrics';

async function main() {
  console.log('================================================================');
  console.log('ATLAS INDUSTRIAL FACTORY V2 — SCALING TO 150K ATLAS UNIQUE');
  console.log('Target: 4 batches of 10,000 unique persons (Lotes 10, 11, 12, 13)');
  console.log('================================================================\n');

  const orchestrator = new AtlasIndustrialQueueOrchestrator();
  const workerPool = new AtlasWorkerPool(orchestrator);

  const jobId = `job_biep_scale_150k_${Date.now()}`;
  await orchestrator.enqueueJob({
    job_id: jobId,
    source_id: 'BIEP_APN',
    queue_name: 'INGESTION_QUEUE',
    job_type: 'BATCH_INGESTION_40K',
    priority: 95,
    checkpoint: { start_universe: 110047, target_universe: 150047, batches: 4 }
  });

  console.log(`Leasing job ${jobId} to WORKER_BIEP_1...`);
  const result = await workerPool.processNextJob('WORKER_BIEP_1', 'BIEP_INGEST_WORKER', 'INGESTION_QUEUE', async (job) => {
    const finalUniverse = await runContinuousIngestion({ maxBatches: 4 });
    return { finalUniverse, status: 'COMPLETED' };
  });

  console.log('\nRunning post-run physical CABA reconciliation audit...');
  const recon = await runReconciliation();

  invalidatePeopleScaleMetricsCache();

  console.log('\n================================================================');
  console.log('150K MILESTONE RUN FINISHED');
  console.log(`Worker Success: ${result.processed ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`CABA Universe Unique (living): ${recon.CABA_UNIVERSE_UNIQUE}`);
  console.log('================================================================\n');
}

main().catch(console.error);
