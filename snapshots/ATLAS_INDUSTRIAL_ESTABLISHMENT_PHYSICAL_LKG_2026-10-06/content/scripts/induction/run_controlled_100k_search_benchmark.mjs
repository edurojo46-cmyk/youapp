import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const INDEX_NAME = 'atlas_people_discovery_gate32_delta';
const TARGET_COHORT_COUNT = 100000;
const CLAIM_BATCH_SIZE = 8000;
const MAX_INFLIGHT_TASKS = 2;

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(1)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(1))
  };
}

async function checkMeiliTask(taskUid) {
  const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
  return await res.json();
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS CONTROLLED 100K SUSTAINED SEARCH BENCHMARK V1.1');
  console.log(`TARGET COUNT: ${TARGET_COHORT_COUNT} | CLAIM_BATCH: ${CLAIM_BATCH_SIZE} | MAX_INFLIGHT: ${MAX_INFLIGHT_TASKS}`);
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: MAX_INFLIGHT_TASKS + 6 });
  const client = await pool.connect();

  let cohortIds = [];
  try {
    // 1. Discover exact 100,000 eligible outbox IDs
    console.log('1. Selecting exact 100,000 eligible outbox IDs from live queue...');
    const cohortRes = await client.query(`
      SELECT outbox_id
      FROM public.atlas_search_outbox
      WHERE status = 'PENDING'
      ORDER BY next_retry_at ASC, outbox_id ASC
      LIMIT $1
    `, [TARGET_COHORT_COUNT]);

    if (cohortRes.rows.length < TARGET_COHORT_COUNT) {
      console.error(`❌ INSUFFICIENT ELIGIBLE ROWS: Found ${cohortRes.rows.length}, required ${TARGET_COHORT_COUNT}.`);
      process.exit(1);
    }

    cohortIds = cohortRes.rows.map(r => r.outbox_id);
  } finally {
    client.release();
  }

  // Compute exact cohort hash
  const sortedIds = [...cohortIds].sort();
  const hash = crypto.createHash('sha256').update(sortedIds.join(',')).digest('hex');

  console.log(`✅ Exact 100K cohort selected.`);
  console.log(`SEARCH_BENCHMARK_COUNT: ${cohortIds.length}`);
  console.log(`SEARCH_BENCHMARK_OUTBOX_IDS_HASH: ${hash}\n`);

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync('reports/atlas/discovery/atlas_perf_search_100k_cohort_manifest_v1_1.json', JSON.stringify({
    SEARCH_BENCHMARK_COUNT: cohortIds.length,
    SEARCH_BENCHMARK_OUTBOX_IDS_HASH: hash,
    CLAIM_BATCH_SIZE,
    MAX_INFLIGHT_TASKS,
    TIMESTAMP: new Date().toISOString()
  }, null, 2));

  // Benchmark state
  const publisherId = `pub_bench_100k_v1_1_${crypto.randomBytes(4).toString('hex')}`;
  let tFirstLease = 0;
  let tLastPublished = 0;
  let totalPublishedExact = 0;
  let inFlightTasks = new Map(); // taskUid -> { ids, docsCount, submitTimeMs }
  const taskLatenciesMs = [];
  const queueWaitTimesMs = [];
  const processingTimesMs = [];

  let totalClaimMs = 0;
  let totalHttpSubmitMs = 0;
  let totalPublishedUpdateMs = 0;

  // Monitor loop
  let monitorActive = true;
  const monitorPromise = (async () => {
    while (monitorActive || inFlightTasks.size > 0) {
      if (inFlightTasks.size === 0) {
        await new Promise(r => setTimeout(r, 10));
        continue;
      }

      const currentTasks = Array.from(inFlightTasks.entries());
      for (const [taskUid, meta] of currentTasks) {
        try {
          const task = await checkMeiliTask(taskUid);
          if (task.status === 'succeeded') {
            const clientWallMs = performance.now() - meta.submitTimeMs;
            taskLatenciesMs.push(clientWallMs);

            const enq = new Date(task.enqueuedAt).getTime();
            const start = new Date(task.startedAt).getTime();
            const fin = new Date(task.finishedAt).getTime();

            const queueWaitMs = Math.max(0, start - enq);
            const actualProcMs = Math.max(0, fin - start);

            queueWaitTimesMs.push(queueWaitMs);
            processingTimesMs.push(actualProcMs);

            // Update status to PUBLISHED
            const tUpd0 = performance.now();
            const updClient = await pool.connect();
            try {
              await updClient.query(`
                UPDATE public.atlas_search_outbox
                SET status = 'PUBLISHED', published_at = NOW(), processing_worker_id = NULL
                WHERE outbox_id = ANY($1::uuid[])
              `, [meta.ids]);
            } finally {
              updClient.release();
            }
            totalPublishedUpdateMs += (performance.now() - tUpd0);

            totalPublishedExact += meta.docsCount;
            inFlightTasks.delete(taskUid);

            const now = performance.now();
            tLastPublished = now;

            const elapsedSec = (now - tFirstLease) / 1000;
            const curRate = elapsedSec > 0 ? (totalPublishedExact / elapsedSec) : 0;
            console.log(`[Search 100K V1.1] Task ${taskUid} SUCCEEDED | BatchUid: ${task.batchUid} | Docs: ${meta.docsCount} | Queue: ${queueWaitMs}ms | Proc: ${actualProcMs}ms | Total: ${totalPublishedExact}/${TARGET_COHORT_COUNT} | Elapsed: ${elapsedSec.toFixed(1)}s | Rate: ${curRate.toFixed(1)} docs/sec`);

            if (totalPublishedExact >= TARGET_COHORT_COUNT) {
              monitorActive = false;
              break;
            }

          } else if (task.status === 'failed' || task.status === 'canceled') {
            console.error(`[Search 100K V1.1] Task ${taskUid} FAILED:`, task.error);
            const updClient = await pool.connect();
            try {
              await updClient.query(`
                UPDATE public.atlas_search_outbox
                SET status = 'RETRY', last_error = $2, processing_worker_id = NULL
                WHERE outbox_id = ANY($1::uuid[])
              `, [meta.ids, JSON.stringify(task.error || task.status).substring(0, 250)]);
            } finally {
              updClient.release();
            }
            inFlightTasks.delete(taskUid);
          }
        } catch (err) {
          console.error(`[Search 100K V1.1] Polling error task ${taskUid}:`, err.message);
        }
      }
      await new Promise(r => setTimeout(r, 10));
    }
  })();

  // Main leasing & submission loop
  console.log('2. Beginning uninterrupted leasing loop...');
  const claimClient = await pool.connect();
  let totalClaimed = 0;

  try {
    while (totalClaimed < TARGET_COHORT_COUNT) {
      if (inFlightTasks.size >= MAX_INFLIGHT_TASKS) {
        await new Promise(r => setTimeout(r, 10));
        continue;
      }

      const needed = TARGET_COHORT_COUNT - totalClaimed;
      const thisBatchSize = Math.min(CLAIM_BATCH_SIZE, needed);

      const tClaim0 = performance.now();
      const leaseRes = await claimClient.query(`
        UPDATE public.atlas_search_outbox
        SET status = 'PROCESSING',
            processing_started_at = NOW(),
            processing_worker_id = $2
        WHERE outbox_id IN (
          SELECT outbox_id FROM public.atlas_search_outbox
          WHERE status = 'PENDING'
          ORDER BY next_retry_at ASC, outbox_id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING outbox_id, payload;
      `, [thisBatchSize, publisherId]);
      totalClaimMs += (performance.now() - tClaim0);

      if (leaseRes.rows.length === 0) {
        await new Promise(r => setTimeout(r, 15));
        continue;
      }

      if (tFirstLease === 0) {
        tFirstLease = performance.now();
        console.log(`⏱️ CLOCK STARTED: First exact-cohort lease confirmed at t = 0.0s`);
      }

      totalClaimed += leaseRes.rows.length;

      // Extract docs for Meilisearch
      const docs = leaseRes.rows.map(r => r.payload);
      const rowIds = leaseRes.rows.map(r => r.outbox_id);

      // Submit to Meilisearch
      const tHttp0 = performance.now();
      const submitRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });
      const submitData = await submitRes.json();
      totalHttpSubmitMs += (performance.now() - tHttp0);

      const taskUid = submitData.taskUid;
      inFlightTasks.set(taskUid, {
        ids: rowIds,
        docsCount: docs.length,
        submitTimeMs: performance.now()
      });

      console.log(`[Search 100K V1.1] Leased & Enqueued ${docs.length} docs -> Task ${taskUid} | In-flight: ${inFlightTasks.size}/${MAX_INFLIGHT_TASKS} | Total Claimed: ${totalClaimed}/${TARGET_COHORT_COUNT}`);
    }
  } finally {
    claimClient.release();
  }

  // Wait for monitor loop to finish processing remaining in-flight tasks
  await monitorPromise;

  const totalWallSec = (tLastPublished - tFirstLease) / 1000;
  const sustainedDocsSec = Number((totalPublishedExact / totalWallSec).toFixed(2));
  const taskLatencyPercentiles = calcPercentiles(taskLatenciesMs);
  const queueWaitPercentiles = calcPercentiles(queueWaitTimesMs);
  const procTimePercentiles = calcPercentiles(processingTimesMs);

  const totalQueueWaitMs = queueWaitTimesMs.reduce((a, b) => a + b, 0);
  const totalProcMs = processingTimesMs.reduce((a, b) => a + b, 0);
  const sumTaskMs = totalQueueWaitMs + totalProcMs;
  const queueWaitPct = sumTaskMs > 0 ? Number(((totalQueueWaitMs / sumTaskMs) * 100).toFixed(1)) : 0;
  const procPct = sumTaskMs > 0 ? Number(((totalProcMs / sumTaskMs) * 100).toFixed(1)) : 0;

  // 3. Final Reconciliation & Gate Checks
  console.log('\n3. Reconciling exact cohort status in database...');
  const reconClient = await pool.connect();
  let statusSummary = {};
  try {
    const reconRes = await reconClient.query(`
      SELECT status, count(*)
      FROM public.atlas_search_outbox
      WHERE outbox_id = ANY($1::uuid[])
      GROUP BY status
    `, [cohortIds]);
    statusSummary = Object.fromEntries(reconRes.rows.map(r => [r.status, parseInt(r.count, 10)]));
  } finally {
    reconClient.release();
  }

  const finalPublished = statusSummary['PUBLISHED'] || 0;
  const finalMissing = TARGET_COHORT_COUNT - finalPublished;
  const finalFailed = statusSummary['FAILED'] || statusSummary['RETRY'] || 0;
  const finalQuarantined = statusSummary['QUARANTINED'] || 0;

  console.log('\n================================================================');
  console.log('🏆 ATLAS 100K SUSTAINED SEARCH CERTIFICATION V1.1');
  console.log('================================================================');
  console.log(`SEARCH_EXPECTED                : ${TARGET_COHORT_COUNT}`);
  console.log(`SEARCH_PUBLISHED               : ${finalPublished}`);
  console.log(`SEARCH_MISSING                 : ${finalMissing}`);
  console.log(`SEARCH_FAILED                  : ${finalFailed}`);
  console.log(`SEARCH_QUARANTINED             : ${finalQuarantined}`);
  console.log(`TOTAL_WALL_TIME_SEC            : ${totalWallSec.toFixed(2)} s`);
  console.log(`SEARCH_SUSTAINED_DOCS_SEC      : ${sustainedDocsSec} docs/sec`);
  console.log(`SEARCH_P95_TASK_LATENCY_MS     : ${taskLatencyPercentiles.P95} ms`);
  console.log(`SEARCH_P50_TASK_LATENCY_MS     : ${taskLatencyPercentiles.P50} ms`);
  console.log(`AVG_QUEUE_WAIT_MS              : ${(totalQueueWaitMs / queueWaitTimesMs.length).toFixed(1)} ms`);
  console.log(`AVG_PROCESSING_MS              : ${(totalProcMs / processingTimesMs.length).toFixed(1)} ms`);
  console.log(`MEILI_QUEUE_WAIT_PERCENT       : ${queueWaitPct}%`);
  console.log(`MEILI_PROCESSING_PERCENT       : ${procPct}%`);
  console.log(`CLAIM_BATCH                    : ${CLAIM_BATCH_SIZE}`);
  console.log(`MAX_INFLIGHT                   : ${MAX_INFLIGHT_TASKS}`);
  console.log(`GATE >= 700 DOCS/SEC           : ${sustainedDocsSec >= 700 ? 'PASS' : 'FAIL'}`);
  console.log('================================================================\n');

  const report = {
    SEARCH_EXPECTED: TARGET_COHORT_COUNT,
    SEARCH_PUBLISHED: finalPublished,
    SEARCH_MISSING: finalMissing,
    SEARCH_FAILED: finalFailed,
    SEARCH_QUARANTINED: finalQuarantined,
    SEARCH_BENCHMARK_OUTBOX_IDS_HASH: hash,
    TOTAL_WALL_TIME_SEC: Number(totalWallSec.toFixed(2)),
    SEARCH_SUSTAINED_DOCS_SEC: sustainedDocsSec,
    SEARCH_P95_TASK_LATENCY: taskLatencyPercentiles.P95,
    SEARCH_P50_TASK_LATENCY: taskLatencyPercentiles.P50,
    MEILI_QUEUE_WAIT_PERCENT: queueWaitPct,
    MEILI_PROCESSING_PERCENT: procPct,
    AVG_QUEUE_WAIT_MS: Number((totalQueueWaitMs / queueWaitTimesMs.length).toFixed(1)),
    AVG_PROCESSING_MS: Number((totalProcMs / processingTimesMs.length).toFixed(1)),
    BEST_SEARCH_BATCH: CLAIM_BATCH_SIZE,
    BEST_SEARCH_INFLIGHT: MAX_INFLIGHT_TASKS,
    PROFILE_BREAKDOWN: {
      CLAIM_SEC: Number((totalClaimMs / 1000).toFixed(2)),
      HTTP_SUBMIT_SEC: Number((totalHttpSubmitMs / 1000).toFixed(2)),
      PUBLISHED_UPDATE_SEC: Number((totalPublishedUpdateMs / 1000).toFixed(2))
    },
    GATE_700_PASS: sustainedDocsSec >= 700,
    TIMESTAMP: new Date().toISOString()
  };

  fs.writeFileSync('reports/atlas/discovery/atlas_perf_search_100k_sustained_v1_1.json', JSON.stringify(report, null, 2));

  await pool.end();
  return report;
}

main().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
