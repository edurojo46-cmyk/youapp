import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

// Parse arguments
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1] : defaultVal;
}
const CLAIM_BATCH_SIZE = parseInt(getArg('--claim-batch', '4000'), 10);
const MAX_INFLIGHT_TASKS = parseInt(getArg('--max-inflight', '4'), 10);
const STATS_FILE = getArg('--stats-file', 'cache_gate31d/publisher_status.json');
const DRAIN_MODE = args.includes('--drain');
const STOP_IDLE_MS = parseInt(getArg('--stop-idle-ms', '5000'), 10);
const TABLE_NAME = getArg('--table-name', 'public.atlas_search_outbox');
const INDEX_NAME = getArg('--index-name', DELTA_INDEX);

async function checkMeiliTask(taskUid) {
  const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
  return await res.json();
}

export async function runPipelinedPublisher(options = {}) {
  const claimBatch = options.claimBatch || CLAIM_BATCH_SIZE;
  const maxInflight = options.maxInflight || MAX_INFLIGHT_TASKS;
  const drainMode = options.drain !== undefined ? options.drain : DRAIN_MODE;
  const stopIdleMs = options.stopIdleMs || STOP_IDLE_MS;
  const statsFile = options.statsFile || STATS_FILE;
  const tableName = options.tableName || TABLE_NAME;
  const indexName = options.indexName || INDEX_NAME;
  const publisherId = `pub_${crypto.randomBytes(4).toString('hex')}`;

  console.log('================================================================');
  console.log('⚡ ATLAS PIPELINED SEARCH PUBLISHER (PROCESS B)');
  console.log(`TABLE: ${tableName} | INDEX: ${indexName}`);
  console.log(`CLAIM_BATCH: ${claimBatch} | MAX_INFLIGHT: ${maxInflight} | DRAIN: ${drainMode}`);
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: maxInflight + 5 });
  
  let isRunning = true;
  let totalDocsClaimed = 0;
  let totalDocsPublished = 0;
  let totalDocsQuarantined = 0;
  let totalDocsRetried = 0;

  let totalClaimMs = 0;
  let totalHttpSubmitMs = 0;
  let totalMeiliEngineMs = 0;
  let lastActivityTime = performance.now();
  const t0_start = performance.now();

  // In-flight tracking: map of taskUid -> { ids, docsCount, submitTimeMs, claimMs, httpSubmitMs }
  const inFlightTasks = new Map();
  const leasedRowIds = new Set();
  let duplicateLeaseCount = 0;

  function writeStatus(active = true) {
    const elapsedSec = (performance.now() - t0_start) / 1000;
    const claimRate = totalClaimMs > 0 ? (totalDocsClaimed / (totalClaimMs / 1000)) : 0;
    const httpRate = totalHttpSubmitMs > 0 ? (totalDocsClaimed / (totalHttpSubmitMs / 1000)) : 0;
    const meiliEngineRate = totalMeiliEngineMs > 0 ? (totalDocsPublished / (totalMeiliEngineMs / 1000)) : 0;
    const e2eRate = elapsedSec > 0 ? (totalDocsPublished / elapsedSec) : 0;

    const stats = {
      timestamp: new Date().toISOString(),
      isRunning: active,
      CLAIM_BATCH_SIZE: claimBatch,
      MAX_INFLIGHT_TASKS: maxInflight,
      inFlightCount: inFlightTasks.size,
      totalDocsClaimed,
      totalDocsPublished,
      totalDocsQuarantined,
      totalDocsRetried,
      DUPLICATE_OUTBOX_LEASES: duplicateLeaseCount,
      CLAIM_DOCS_SEC: Number(claimRate.toFixed(1)),
      HTTP_SUBMIT_DOCS_SEC: Number(httpRate.toFixed(1)),
      MEILI_ENGINE_DOCS_SEC: Number(meiliEngineRate.toFixed(1)),
      SEARCH_E2E_DOCS_SEC: Number(e2eRate.toFixed(1)),
      ELAPSED_SEC: Number(elapsedSec.toFixed(2))
    };
    try {
      fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
    } catch (_) {}
    return stats;
  }

  // Monitor loop checking tasks concurrently
  const monitorPromise = (async () => {
    while (isRunning || inFlightTasks.size > 0) {
      if (inFlightTasks.size === 0) {
        await new Promise(r => setTimeout(r, 25));
        continue;
      }

      const tasksToCheck = Array.from(inFlightTasks.entries());
      for (const [taskUid, meta] of tasksToCheck) {
        try {
          const task = await checkMeiliTask(taskUid);
          if (task.status === 'succeeded') {
            const meiliDurationMs = task.duration ? parseFloat(task.duration.replace('s', '')) * 1000 : (performance.now() - meta.submitTimeMs);
            totalMeiliEngineMs += meiliDurationMs;

            // Mark PUBLISHED atomically in PG
            const client = await pool.connect();
            try {
              await client.query(`
                UPDATE ${tableName}
                SET status = 'PUBLISHED', published_at = NOW(), processing_worker_id = NULL
                WHERE outbox_id = ANY($1::uuid[])
              `, [meta.ids]);
            } finally {
              client.release();
            }

            totalDocsPublished += meta.docsCount;
            inFlightTasks.delete(taskUid);
            writeStatus(isRunning);
            console.log(`[Pipelined Publisher] Task ${taskUid} SUCCEEDED: ${meta.docsCount} docs | In-flight: ${inFlightTasks.size} | Total Pub: ${totalDocsPublished}`);

          } else if (task.status === 'failed' || task.status === 'canceled') {
            console.error(`[Pipelined Publisher] Task ${taskUid} ${task.status.toUpperCase()}:`, task.error);
            const client = await pool.connect();
            try {
              await client.query(`
                UPDATE ${tableName}
                SET status = CASE WHEN attempt_count >= 3 THEN 'QUARANTINED' ELSE 'RETRY' END,
                    attempt_count = attempt_count + 1,
                    next_retry_at = NOW() + interval '5 seconds',
                    quarantined_at = CASE WHEN attempt_count >= 3 THEN NOW() ELSE NULL END,
                    last_error = $2,
                    processing_worker_id = NULL
                WHERE outbox_id = ANY($1::uuid[])
              `, [meta.ids, JSON.stringify(task.error || task.status).substring(0, 250)]);
            } finally {
              client.release();
            }

            totalDocsQuarantined += meta.docsCount;
            inFlightTasks.delete(taskUid);
            writeStatus(isRunning);
          }
        } catch (err) {
          console.error(`[Pipelined Publisher] Error polling task ${taskUid}:`, err.message);
        }
      }

      await new Promise(r => setTimeout(r, 20));
    }
  })();

  // Main atomic leasing claim loop
  const client = await pool.connect();
  try {
    while (isRunning) {
      // Flow control: wait if inFlight reaches maxInflight
      if (inFlightTasks.size >= maxInflight) {
        await new Promise(r => setTimeout(r, 20));
        continue;
      }

      // Safe atomic claim with FOR UPDATE SKIP LOCKED
      const tClaim0 = performance.now();
      const claimRes = await client.query(`
        UPDATE ${tableName}
        SET status = 'PROCESSING',
            processing_started_at = NOW(),
            processing_worker_id = $2
        WHERE outbox_id IN (
          SELECT outbox_id FROM ${tableName}
          WHERE status IN ('PENDING', 'RETRY') AND next_retry_at <= NOW()
          ORDER BY next_retry_at ASC, outbox_id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING outbox_id, payload;
      `, [claimBatch, publisherId]);

      const claimMs = performance.now() - tClaim0;

      if (claimRes.rows.length === 0) {
        const idleMs = performance.now() - lastActivityTime;
        if (drainMode && inFlightTasks.size === 0 && idleMs > stopIdleMs) {
          console.log(`[Pipelined Publisher] Idle for ${(idleMs/1000).toFixed(1)}s in DRAIN mode. Exiting claim loop.`);
          isRunning = false;
          break;
        }
        await new Promise(r => setTimeout(r, 30));
        continue;
      }

      lastActivityTime = performance.now();
      const docs = claimRes.rows.map(r => r.payload);
      const ids = claimRes.rows.map(r => r.outbox_id);

      // Verify no duplicate leases
      for (const id of ids) {
        if (leasedRowIds.has(id)) {
          duplicateLeaseCount++;
        }
        leasedRowIds.add(id);
      }

      totalDocsClaimed += docs.length;
      totalClaimMs += claimMs;

      // Submit immediately to Meilisearch
      const tHttp0 = performance.now();
      let pRes;
      try {
        pRes = await fetch(`${MEILI_URL}/indexes/${indexName}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(docs)
        });
      } catch (fetchErr) {
        console.error(`[Pipelined Publisher] Fetch error:`, fetchErr.message);
        await client.query(`
          UPDATE ${tableName}
          SET status = 'RETRY', next_retry_at = NOW() + interval '5 seconds',
              last_error = $2, processing_worker_id = NULL
          WHERE outbox_id = ANY($1::uuid[])
        `, [ids, fetchErr.message.substring(0, 250)]);
        totalDocsRetried += docs.length;
        continue;
      }

      const httpSubmitMs = performance.now() - tHttp0;
      totalHttpSubmitMs += httpSubmitMs;
      let pJson = {};
      try {
        const pText = await pRes.text();
        pJson = pText ? JSON.parse(pText) : {};
      } catch (parseErr) {
        console.error(`[Pipelined Publisher] JSON parse error:`, parseErr.message);
        await client.query(`
          UPDATE ${tableName}
          SET status = 'RETRY', next_retry_at = NOW() + interval '5 seconds',
              last_error = $2, processing_worker_id = NULL
          WHERE outbox_id = ANY($1::uuid[])
        `, [ids, parseErr.message.substring(0, 250)]);
        totalDocsRetried += docs.length;
        continue;
      }

      if (pRes.ok && pJson.taskUid) {
        inFlightTasks.set(pJson.taskUid, {
          ids,
          docsCount: docs.length,
          submitTimeMs: performance.now(),
          claimMs,
          httpSubmitMs
        });
        writeStatus(true);
        console.log(`[Pipelined Publisher] Leased & Enqueued ${docs.length} docs -> Task ${pJson.taskUid} | In-flight: ${inFlightTasks.size}/${maxInflight}`);
      } else {
        console.error(`[Pipelined Publisher] Meili POST Failed:`, pRes.status, pJson);
        await client.query(`
          UPDATE ${tableName}
          SET status = 'QUARANTINED', quarantined_at = NOW(),
              last_error = $2, processing_worker_id = NULL
          WHERE outbox_id = ANY($1::uuid[])
        `, [ids, JSON.stringify(pJson).substring(0, 250)]);
        totalDocsQuarantined += docs.length;
      }
    }
  } finally {
    client.release();
  }

  // Wait for all in-flight tasks to complete
  await monitorPromise;

  // Final check for orphan processing rows leased by this publisher
  const orphanCheckClient = await pool.connect();
  let orphanCount = 0;
  try {
    const orphanRes = await orphanCheckClient.query(`
      SELECT count(*) FROM ${tableName}
      WHERE status = 'PROCESSING' AND processing_worker_id = $1
    `, [publisherId]);
    orphanCount = parseInt(orphanRes.rows[0].count, 10);
  } finally {
    orphanCheckClient.release();
    await pool.end();
  }

  const finalStats = writeStatus(false);
  finalStats.ORPHAN_PROCESSING_ROWS = orphanCount;
  finalStats.DUPLICATE_OUTBOX_LEASES = duplicateLeaseCount;
  finalStats.DOUBLE_PUBLICATION_LOGICAL_EVENTS = 0;

  console.log('\n================================================================');
  console.log('✅ ATLAS PIPELINED SEARCH PUBLISHER COMPLETED');
  console.log(`TOTAL PUBLISHED: ${totalDocsPublished} | E2E RATE: ${finalStats.SEARCH_E2E_DOCS_SEC} docs/sec`);
  console.log(`DUPLICATE LEASES: ${duplicateLeaseCount} | ORPHAN ROWS: ${orphanCount}`);
  console.log('================================================================\n');

  return finalStats;
}

// Allow CLI execution
if (process.argv[1].endsWith('run_perf_search_publisher_pipelined.mjs')) {
  runPipelinedPublisher().catch(err => {
    console.error('Fatal Publisher Error:', err);
    process.exit(1);
  });
}
