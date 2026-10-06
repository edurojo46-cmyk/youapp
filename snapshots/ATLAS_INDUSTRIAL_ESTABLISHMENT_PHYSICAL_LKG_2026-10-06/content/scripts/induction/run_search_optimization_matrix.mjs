import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { execSync } from 'node:child_process';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const INDEX_NAME = 'atlas_people_discovery_gate32_delta';
const DB_DIR = path.resolve('data_discovery_delta.ms');

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(1)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(1)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(1))
  };
}

function getDirSizeBytes(dirPath) {
  let total = 0;
  try {
    for (const f of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const p = path.join(dirPath, f.name);
      if (f.isDirectory()) total += getDirSizeBytes(p);
      else total += fs.statSync(p).size;
    }
  } catch (_) {}
  return total;
}

function getMeiliMemoryMb() {
  try {
    const out = execSync('powershell -Command "Get-Process meilisearch -ErrorAction SilentlyContinue | Select-Object -ExpandProperty WorkingSet64"', { encoding: 'utf8' });
    const bytes = parseInt(out.trim(), 10);
    if (!isNaN(bytes)) return Number((bytes / 1024 / 1024).toFixed(1));
  } catch (_) {}
  return 0;
}

async function checkMeiliTask(taskUid) {
  const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
  return await res.json();
}

async function runMatrix() {
  console.log('================================================================');
  console.log('🔬 ATLAS SEARCH MOTOR: CONTROLLED OPTIMIZATION MATRIX V1.1');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 8 });
  const client = await pool.connect();

  const requestSizes = [500, 1000, 2000, 4000, 8000];
  const inflightCounts = [1, 2, 4, 6];

  const matrixResults = [];

  try {
    for (const reqSize of requestSizes) {
      for (const inflight of inflightCounts) {
        // Choose appropriate cohort size for accurate steady-state profiling
        let cohortSize = Math.min(Math.max(reqSize * 2, 2000), 8000);
        if (reqSize === 8000) cohortSize = 8000;
        console.log(`\n----------------------------------------------------------------`);
        console.log(`▶️ RUNNING CELL: Request Size = ${reqSize} | In-flight = ${inflight} | Cohort = ${cohortSize}`);
        console.log(`----------------------------------------------------------------`);

        // 1. Lease cohort atomically
        const tLeaseStart = performance.now();
        const leaseRes = await client.query(`
          UPDATE public.atlas_search_outbox
          SET status = 'PROCESSING',
              processing_started_at = NOW(),
              processing_worker_id = 'bench_matrix'
          WHERE outbox_id IN (
            SELECT outbox_id FROM public.atlas_search_outbox
            WHERE status = 'PENDING'
            ORDER BY next_retry_at ASC, outbox_id ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING outbox_id, payload;
        `, [cohortSize]);

        const rows = leaseRes.rows;
        if (rows.length < cohortSize) {
          console.warn(`⚠️ Warning: Only leased ${rows.length} rows (requested ${cohortSize}).`);
        }
        if (rows.length === 0) {
          console.error('❌ No pending rows available to test!');
          break;
        }

        const exactCohortIds = rows.map(r => r.outbox_id);
        const actualCount = rows.length;

        let tFirstLease = performance.now();
        let tLastPublished = tFirstLease;
        let offset = 0;
        const inFlight = new Map();
        const cellTasks = [];
        let totalHttpSubmitMs = 0;
        let finalFailed = 0;

        while (offset < actualCount || inFlight.size > 0) {
          // Submit while under inflight cap
          while (offset < actualCount && inFlight.size < inflight) {
            const chunk = rows.slice(offset, offset + reqSize);
            offset += chunk.length;

            const docs = chunk.map(r => r.payload);
            const rowIds = chunk.map(r => r.outbox_id);

            const tSub0 = performance.now();
            const postRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(docs)
            });
            const postData = await postRes.json();
            const submitDuration = performance.now() - tSub0;
            totalHttpSubmitMs += submitDuration;

            inFlight.set(postData.taskUid, {
              taskUid: postData.taskUid,
              rowIds,
              docsCount: docs.length,
              clientSubmitMs: performance.now(),
              httpSubmitMs: submitDuration
            });
          }

          // Poll tasks
          for (const [taskUid, meta] of Array.from(inFlight.entries())) {
            const task = await checkMeiliTask(taskUid);
            if (task.status === 'succeeded') {
              const clientLatency = performance.now() - meta.clientSubmitMs;
              const enq = new Date(task.enqueuedAt).getTime();
              const start = new Date(task.startedAt).getTime();
              const fin = new Date(task.finishedAt).getTime();

              const queueWaitMs = Math.max(0, start - enq);
              const procMs = Math.max(0, fin - start);

              cellTasks.push({
                taskUid,
                docsCount: meta.docsCount,
                batchUid: task.batchUid,
                clientLatencyMs: clientLatency,
                queueWaitMs,
                procMs,
                httpSubmitMs: meta.httpSubmitMs
              });

              // Mark rows PUBLISHED
              await client.query(`
                UPDATE public.atlas_search_outbox
                SET status = 'PUBLISHED', published_at = NOW(), processing_worker_id = NULL
                WHERE outbox_id = ANY($1::uuid[])
              `, [meta.rowIds]);

              inFlight.delete(taskUid);
              tLastPublished = performance.now();
            } else if (task.status === 'failed' || task.status === 'canceled') {
              console.error(`Task ${taskUid} FAILED:`, task.error);
              finalFailed += meta.docsCount;
              await client.query(`
                UPDATE public.atlas_search_outbox
                SET status = 'RETRY', last_error = $2, processing_worker_id = NULL
                WHERE outbox_id = ANY($1::uuid[])
              `, [meta.rowIds, JSON.stringify(task.error || task.status).substring(0, 250)]);
              inFlight.delete(taskUid);
            }
          }

          if (inFlight.size >= inflight || (offset >= actualCount && inFlight.size > 0)) {
            await new Promise(r => setTimeout(r, 25));
          }
        }

        // Reconcile cohort
        const checkRes = await client.query(`
          SELECT status, count(*)
          FROM public.atlas_search_outbox
          WHERE outbox_id = ANY($1::uuid[])
          GROUP BY status
        `, [exactCohortIds]);

        const statusMap = Object.fromEntries(checkRes.rows.map(r => [r.status, parseInt(r.count, 10)]));
        const finalPublished = statusMap['PUBLISHED'] || 0;
        const finalMissing = actualCount - finalPublished;

        // Reset cohort rows back to PENDING to keep disposable cohort reusable
        await client.query(`
          UPDATE public.atlas_search_outbox
          SET status = 'PENDING', processing_worker_id = NULL
          WHERE outbox_id = ANY($1::uuid[])
        `, [exactCohortIds]);

        const cellWallSec = (tLastPublished - tFirstLease) / 1000;
        const docsSecSustained = cellWallSec > 0 ? Number((actualCount / cellWallSec).toFixed(2)) : 0;

        const avgHttpSubmitMs = cellTasks.length > 0 ? Number((totalHttpSubmitMs / cellTasks.length).toFixed(1)) : 0;
        const avgQueueWaitMs = cellTasks.length > 0 ? Number((cellTasks.reduce((a, b) => a + b.queueWaitMs, 0) / cellTasks.length).toFixed(1)) : 0;
        const avgProcMs = cellTasks.length > 0 ? Number((cellTasks.reduce((a, b) => a + b.procMs, 0) / cellTasks.length).toFixed(1)) : 0;

        const pLatencies = calcPercentiles(cellTasks.map(t => t.clientLatencyMs));
        const memoryMb = getMeiliMemoryMb();
        const indexSizeBytes = getDirSizeBytes(DB_DIR);
        const indexSizeMb = Number((indexSizeBytes / 1024 / 1024).toFixed(1));

        const cellSummary = {
          REQUEST_SIZE: reqSize,
          IN_FLIGHT: inflight,
          DOCS_COUNT: actualCount,
          WALL_SEC: Number(cellWallSec.toFixed(2)),
          DOCS_SEC_SUSTAINED: docsSecSustained,
          HTTP_SUBMIT_MS: avgHttpSubmitMs,
          TASK_QUEUE_WAIT_MS: avgQueueWaitMs,
          MEILI_PROCESSING_MS: avgProcMs,
          TASK_P50_MS: pLatencies.P50,
          TASK_P95_MS: pLatencies.P95,
          MEMORY_USAGE_MB: memoryMb,
          INDEX_SIZE_MB: indexSizeMb,
          FINAL_MISSING: finalMissing,
          FINAL_FAILED: finalFailed
        };

        matrixResults.push(cellSummary);
        console.log(`✅ Cell Complete: Rate = ${docsSecSustained} docs/sec | Wall = ${cellWallSec.toFixed(2)}s | QueueWait = ${avgQueueWaitMs}ms | Proc = ${avgProcMs}ms | Mem = ${memoryMb}MB`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  // Save matrix results
  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    'reports/atlas/discovery/atlas_search_optimization_matrix_v1_1.json',
    JSON.stringify(matrixResults, null, 2)
  );

  console.log('\n================================================================');
  console.log('🏁 SEARCH MOTOR OPTIMIZATION MATRIX COMPLETE');
  console.log('Results saved to reports/atlas/discovery/atlas_search_optimization_matrix_v1_1.json');
  console.log('================================================================\n');

  // Print Table
  console.table(matrixResults.map(r => ({
    'Batch': r.REQUEST_SIZE,
    'Inflight': r.IN_FLIGHT,
    'Docs/Sec': r.DOCS_SEC_SUSTAINED,
    'QueueWait(ms)': r.TASK_QUEUE_WAIT_MS,
    'Proc(ms)': r.MEILI_PROCESSING_MS,
    'P50(ms)': r.TASK_P50_MS,
    'P95(ms)': r.TASK_P95_MS,
    'Memory(MB)': r.MEMORY_USAGE_MB,
    'Missing': r.FINAL_MISSING
  })));

  return matrixResults;
}

runMatrix().catch(console.error);
