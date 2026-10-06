import fs from 'node:fs';
import pg from 'pg';
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
const CONCURRENCY = parseInt(getArg('--concurrency', '1'), 10);
const STATS_FILE = getArg('--stats-file', 'cache_gate31d/publisher_status.json');
const DRAIN_MODE = args.includes('--drain');
const STOP_IDLE_MS = parseInt(getArg('--stop-idle-ms', '10000'), 10);

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const data = await res.json();
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
      return data;
    }
    await new Promise(r => setTimeout(r, 25));
  }
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS SEARCH PUBLISHER (PROCESS B — INDEPENDENT)');
  console.log(`CLAIM_BATCH_SIZE: ${CLAIM_BATCH_SIZE} | CONCURRENCY: ${CONCURRENCY} | DRAIN: ${DRAIN_MODE}`);
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: Math.max(CONCURRENCY + 2, 5) });
  
  let isRunning = true;
  let totalDocsClaimed = 0;
  let totalDocsPublished = 0;
  let totalDocsQuarantined = 0;
  let totalClaimMs = 0;
  let totalEnqueueMs = 0;
  let totalMeiliMs = 0;
  let lastActivityTime = performance.now();
  const t0_start = performance.now();

  function writeStatus(active = true) {
    const elapsedSec = (performance.now() - t0_start) / 1000;
    const claimRate = totalClaimMs > 0 ? (totalDocsClaimed / (totalClaimMs / 1000)) : 0;
    const enqueueRate = totalEnqueueMs > 0 ? (totalDocsPublished / (totalEnqueueMs / 1000)) : 0;
    const meiliRate = totalMeiliMs > 0 ? (totalDocsPublished / (totalMeiliMs / 1000)) : 0;
    const e2eRate = elapsedSec > 0 ? (totalDocsPublished / elapsedSec) : 0;

    const stats = {
      timestamp: new Date().toISOString(),
      isRunning: active,
      CLAIM_BATCH_SIZE,
      CONCURRENCY,
      totalDocsClaimed,
      totalDocsPublished,
      totalDocsQuarantined,
      OUTBOX_CLAIM_DOCS_SEC: Number(claimRate.toFixed(1)),
      HTTP_ENQUEUE_DOCS_SEC: Number(enqueueRate.toFixed(1)),
      MEILI_PROCESS_DOCS_SEC: Number(meiliRate.toFixed(1)),
      SEARCH_E2E_DOCS_SEC: Number(e2eRate.toFixed(1)),
      ELAPSED_SEC: Number(elapsedSec.toFixed(2))
    };
    try {
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (_) {}
    return stats;
  }

  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT. Gracefully draining current tasks...');
    isRunning = false;
  });
  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM. Gracefully draining current tasks...');
    isRunning = false;
  });

  // Single or concurrent claim loop worker
  async function publisherWorker(workerId) {
    const client = await pool.connect();
    try {
      while (isRunning) {
        // Safe claim with FOR UPDATE SKIP LOCKED using ready queue index
        const tClaim0 = performance.now();
        await client.query('BEGIN');
        const claimRes = await client.query(`
          UPDATE public.atlas_search_outbox
          SET status = 'PROCESSING', processing_started_at = NOW()
          WHERE outbox_id IN (
            SELECT outbox_id FROM public.atlas_search_outbox
            WHERE status IN ('PENDING', 'RETRY') AND next_retry_at <= NOW()
            ORDER BY next_retry_at ASC, outbox_id ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING outbox_id, payload;
        `, [CLAIM_BATCH_SIZE]);

        await client.query('COMMIT');
        const claimMs = performance.now() - tClaim0;

        if (claimRes.rows.length === 0) {
          const idleMs = performance.now() - lastActivityTime;
          if (DRAIN_MODE && idleMs > STOP_IDLE_MS) {
            console.log(`[Worker ${workerId}] Idle for ${(idleMs/1000).toFixed(1)}s in DRAIN mode. Stopping.`);
            break;
          }
          await new Promise(r => setTimeout(r, 50));
          continue;
        }

        lastActivityTime = performance.now();
        const docs = claimRes.rows.map(r => r.payload);
        const ids = claimRes.rows.map(r => r.outbox_id);
        totalDocsClaimed += docs.length;
        totalClaimMs += claimMs;

        // Post to Meilisearch
        const tEnq0 = performance.now();
        let pRes;
        try {
          pRes = await fetch(`${MEILI_URL}/indexes/${DELTA_INDEX}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docs)
          });
        } catch (fetchErr) {
          console.error(`[Worker ${workerId}] Fetch error:`, fetchErr.message);
          await client.query(`
            UPDATE public.atlas_search_outbox
            SET status = 'RETRY', next_retry_at = NOW() + interval '5 seconds', last_error = $2
            WHERE outbox_id = ANY($1::uuid[])
          `, [ids, fetchErr.message.substring(0, 250)]);
          continue;
        }

        const enqMs = performance.now() - tEnq0;
        totalEnqueueMs += enqMs;
        const pJson = await pRes.json();

        if (pRes.ok && pJson.taskUid) {
          const tMeili0 = performance.now();
          const task = await waitForMeiliTask(pJson.taskUid);
          const meiliMs = performance.now() - tMeili0;
          totalMeiliMs += meiliMs;

          if (task.status === 'succeeded') {
            await client.query(`
              UPDATE public.atlas_search_outbox
              SET status = 'PUBLISHED', published_at = NOW()
              WHERE outbox_id = ANY($1::uuid[])
            `, [ids]);
            totalDocsPublished += docs.length;
          } else {
            console.error(`[Worker ${workerId}] Meili Task Failed:`, task.error);
            await client.query(`
              UPDATE public.atlas_search_outbox
              SET status = 'QUARANTINED', quarantined_at = NOW(), last_error = $2
              WHERE outbox_id = ANY($1::uuid[])
            `, [ids, JSON.stringify(task.error).substring(0, 250)]);
            totalDocsQuarantined += docs.length;
          }
        } else {
          console.error(`[Worker ${workerId}] Meili POST Failed:`, pRes.status, pJson);
          await client.query(`
            UPDATE public.atlas_search_outbox
            SET status = 'QUARANTINED', quarantined_at = NOW(), last_error = $2
            WHERE outbox_id = ANY($1::uuid[])
          `, [ids, JSON.stringify(pJson).substring(0, 250)]);
          totalDocsQuarantined += docs.length;
        }

        writeStatus(true);
        console.log(`[Worker ${workerId}] Published ${docs.length} docs (Total: ${totalDocsPublished.toLocaleString()}) | Claim: ${claimMs.toFixed(0)}ms, Enq: ${enqMs.toFixed(0)}ms`);
      }
    } finally {
      client.release();
    }
  }

  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(publisherWorker(w + 1));
  }

  await Promise.all(workers);
  const finalStats = writeStatus(false);

  console.log('\n================================================================');
  console.log('⚡ SEARCH PUBLISHER TERMINATED');
  console.log(`TOTAL PUBLISHED:      ${totalDocsPublished.toLocaleString()}`);
  console.log(`TOTAL QUARANTINED:    ${totalDocsQuarantined.toLocaleString()}`);
  console.log(`OUTBOX_CLAIM_DOCS_SEC: ${finalStats.OUTBOX_CLAIM_DOCS_SEC}`);
  console.log(`HTTP_ENQUEUE_DOCS_SEC: ${finalStats.HTTP_ENQUEUE_DOCS_SEC}`);
  console.log(`MEILI_PROCESS_DOCS_SEC:${finalStats.MEILI_PROCESS_DOCS_SEC}`);
  console.log(`SEARCH_E2E_DOCS_SEC:   ${finalStats.SEARCH_E2E_DOCS_SEC}`);
  console.log('================================================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('FATAL SEARCH PUBLISHER ERROR:', err);
  process.exit(1);
});
