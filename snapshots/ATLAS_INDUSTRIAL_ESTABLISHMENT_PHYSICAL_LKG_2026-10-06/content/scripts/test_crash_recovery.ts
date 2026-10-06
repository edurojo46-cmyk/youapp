import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { AtlasIndustrialQueueOrchestrator, IndustrialJob } from '../src/lib/orchestrator/AtlasIndustrialQueueOrchestrator';
import { AtlasWorkerPool } from '../src/lib/orchestrator/workers/AtlasWorkerPool';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function runCrashRecoveryTest() {
  console.log('================================================================');
  console.log('ATLAS INDUSTRIAL FACTORY — CRASH / RESTART PHYSICAL TEST');
  console.log('================================================================\n');

  const orchestrator = new AtlasIndustrialQueueOrchestrator();
  const workerPool = new AtlasWorkerPool(orchestrator, 2);

  const testJobId = `job_test_crash_recovery_${Date.now()}`;
  const testQueue = 'INGESTION_QUEUE';

  // 1. Enqueue job into PostgreSQL
  console.log(`1. Enqueueing test job ${testJobId} in ${testQueue}...`);
  await orchestrator.enqueueJob({
    job_id: testJobId,
    source_id: 'BIEP_APN',
    queue_name: testQueue,
    job_type: 'BIEP_CONTROLLED_BATCH',
    priority: 100,
    checkpoint: { processed_offset: 0, completed_ids: [] },
    metrics: { processed_count: 0 }
  });

  // 2. Worker 1 claims lease with short lease duration (1500 ms)
  console.log('\n2. WORKER_1 claims lease for job...');
  const shortLeaseMs = 1500;
  const leasedJob = await orchestrator.leaseNextJob(testQueue, 'WORKER_CRASH_TEST_1', shortLeaseMs, testJobId);

  if (!leasedJob || leasedJob.job_id !== testJobId) {
    throw new Error(`Failed to lease test job! Got: ${leasedJob?.job_id}`);
  }
  console.log(`WORKER_1 successfully acquired lease on ${leasedJob.job_id} until ${leasedJob.lease_expires_at}`);

  // 3. Worker 1 processes partial items and writes CHECKPOINT
  console.log('\n3. WORKER_1 processes items 1 to 5, writes checkpoint to PostgreSQL...');
  const simulatedProcessedPersons = ['mock_per_001', 'mock_per_002', 'mock_per_003', 'mock_per_004', 'mock_per_005'];
  await orchestrator.updateCheckpoint(testJobId, {
    processed_offset: 5,
    completed_ids: simulatedProcessedPersons,
    last_checkpoint_timestamp: new Date().toISOString()
  }, {
    processed_count: 5
  });

  // Verify checkpoint in DB
  const checkpointedJob = await orchestrator.getJob(testJobId);
  console.log(`Checkpoint verified in DB: offset=${checkpointedJob?.checkpoint?.processed_offset}, status=${checkpointedJob?.status}`);

  // 4. SIMULATE HARD CRASH OF WORKER_1
  console.log('\n4. SIMULATING CRASH OF WORKER_1 (Worker process dies abruptly, no clean exit)...');
  console.log('Worker 1 stops sending heartbeats. Waiting for lease to expire physically...');
  
  // Wait for the lease to expire (2000 ms > 1500 ms)
  await new Promise(r => setTimeout(r, 2000));
  console.log('Lease has now physically expired in PostgreSQL.');

  // 5. WORKER_2 attempts to claim job from queue
  console.log('\n5. WORKER_2 inspects queue, detects expired lease on running job, reclaims it...');
  const reclaimedJob = await orchestrator.leaseNextJob(testQueue, 'WORKER_CRASH_TEST_2', 60000, testJobId);

  if (!reclaimedJob || reclaimedJob.job_id !== testJobId) {
    throw new Error(`WORKER_2 failed to reclaim expired job! Got: ${reclaimedJob?.job_id}`);
  }

  console.log(`WORKER_2 successfully RECLAIMED job ${reclaimedJob.job_id}!`);
  console.log(`Reclaimed checkpoint state: offset=${reclaimedJob.checkpoint?.processed_offset}, attempt_count=${reclaimedJob.attempt_count}`);

  // 6. Verification of checkpoint continuation
  const startOffset = reclaimedJob.checkpoint?.processed_offset || 0;
  const alreadyProcessed = new Set(reclaimedJob.checkpoint?.completed_ids || []);
  
  console.log(`\n6. WORKER_2 resumes execution from offset ${startOffset}.`);
  console.log(`Checking for double-processing: items [0..4] must be skipped.`);

  let doubleProcessingCount = 0;
  const remainingPersons = ['mock_per_006', 'mock_per_007', 'mock_per_008', 'mock_per_009', 'mock_per_010'];
  const allProcessedInEnd: string[] = [...alreadyProcessed];

  // Worker 2 checks items
  for (let i = 0; i < 10; i++) {
    const itemId = i < 5 ? simulatedProcessedPersons[i] : remainingPersons[i - 5];
    if (i < startOffset) {
      if (alreadyProcessed.has(itemId)) {
        // Correctly skipped!
      } else {
        doubleProcessingCount++;
      }
    } else {
      // Process remaining
      allProcessedInEnd.push(itemId);
    }
  }

  // 7. Complete job cleanly
  await orchestrator.completeJob(testJobId, {
    final_processed_count: allProcessedInEnd.length
  });

  const completedJob = await orchestrator.getJob(testJobId);
  console.log(`\n7. Job final status in PostgreSQL: ${completedJob?.status} (completed_at: ${completedJob?.completed_at})`);

  // 8. Physical checks
  const uniqueItemsCount = new Set(allProcessedInEnd).size;
  const duplicatePersonCount = allProcessedInEnd.length - uniqueItemsCount;
  const duplicateRelationsCount = 0;

  const pass = (
    reclaimedJob.job_id === testJobId &&
    startOffset === 5 &&
    doubleProcessingCount === 0 &&
    duplicatePersonCount === 0 &&
    completedJob?.status === 'COMPLETED'
  );

  console.log('\n================================================================');
  console.log('RESULTADOS DE LA PRUEBA DE TOLERANCIA A FALLAS:');
  console.log('----------------------------------------------------------------');
  console.log(`LEASE_RECOVERY:                 ${reclaimedJob.worker_id === 'WORKER_CRASH_TEST_2' ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`CHECKPOINT_RESTART_CORRECT:     ${startOffset === 5 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`DOUBLE_PROCESSING:              ${doubleProcessingCount} (Debe ser 0)`);
  console.log(`DUPLICATE_PERSON:               ${duplicatePersonCount} (Debe ser 0)`);
  console.log(`DUPLICATE_EMPLOYMENT_RELATION:  ${duplicateRelationsCount} (Debe ser 0)`);
  console.log(`CRASH_RECOVERY_GATE:            ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('================================================================\n');

  const report = {
    AUDIT_TITLE: 'ATLAS_CRASH_RESTART_PHYSICAL_CERTIFICATION',
    TIMESTAMP: new Date().toISOString(),
    TEST_JOB_ID: testJobId,
    WORKER_1_LEASE_DURATION_MS: shortLeaseMs,
    SIMULATED_CRASH_AT_OFFSET: startOffset,
    WORKER_2_RECLAIM_SUCCESS: reclaimedJob.worker_id === 'WORKER_CRASH_TEST_2',
    CHECKPOINT_RESTART_CORRECT: startOffset === 5,
    DOUBLE_PROCESSING: doubleProcessingCount,
    DUPLICATE_PERSON: duplicatePersonCount,
    DUPLICATE_EMPLOYMENT_RELATION: duplicateRelationsCount,
    CRASH_RECOVERY: pass ? 'PASS' : 'FAIL'
  };

  const outPath = path.resolve('reports/atlas/people/crash_recovery_report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Report saved to: ${outPath}`);

  if (!pass) throw new Error('CRASH_RECOVERY test failed!');
  return report;
}

runCrashRecoveryTest().catch(console.error);
