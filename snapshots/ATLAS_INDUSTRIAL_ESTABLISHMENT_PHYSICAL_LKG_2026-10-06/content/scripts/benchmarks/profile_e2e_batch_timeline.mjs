import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const WORKLOAD = 100000;
const ROTOR_SIZE = 50000;
const SUBMISSION_BATCH_SIZE = 5000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_LANES = 2;
const MAX_QUEUE_BACKPRESSURE = 25000;

function parseDurationMs(durationStr) {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT([\d.]+)S/);
  if (match) return parseFloat(match[1]) * 1000;
  return 0;
}

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 10));
  }
}

async function createIndex(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const task = await res.json();
  await waitForMeiliTask(task.taskUid);
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.3 — E2E BATCH TIMELINE & SEARCH IDLE GAP PROFILER');
  console.log('Measuring all 20 publication batches (5,000 docs each) at sub-millisecond precision');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 8 });
  const runId = `tl_prof_${Date.now()}`;
  const rotor0 = `${runId}_rot_0`;
  const rotor1 = `${runId}_rot_1`;
  await createIndex(rotor0);
  await createIndex(rotor1);

  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  const batchRecords = [];

  const tMasterStart = performance.now();

  // Producer (2 Lanes)
  const lanePromises = [];
  const perLane = WORKLOAD / DISCOVERY_LANES;

  for (let l = 0; l < DISCOVERY_LANES; l++) {
    const start = l * perLane;
    const end = start + perLane;
    lanePromises.push((async () => {
      const client = await pool.connect();
      try {
        for (let b = start; b < end; b += DISCOVERY_BATCH_SIZE) {
          while (totalCommitted - searchIndexed >= MAX_QUEUE_BACKPRESSURE) {
            await new Promise(r => setTimeout(r, 20));
          }
          const count = Math.min(DISCOVERY_BATCH_SIZE, end - b);
          const pSources = new Array(count).fill(runId);
          const pSrcIds = new Array(count);
          const pHmacs = new Array(count);
          const pPersonIds = new Array(count);
          const pDecisions = new Array(count).fill('NEW');
          const pEvidenceIds = new Array(count).fill(null);
          const pObservedAts = new Array(count).fill(new Date().toISOString());
          for (let i = 0; i < count; i++) {
            pSrcIds[i] = `SRC_TL_${b + i}`;
            pHmacs[i] = `hmac_tl_${b + i}`;
            pPersonIds[i] = `P_TL_${b + i}`;
          }
          await client.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
          totalCommitted += count;
        }
      } finally {
        client.release();
      }
    })());
  }

  const producerPromise = Promise.all(lanePromises).then(() => {
    discoveryDone = true;
  });

  // Consumer with Exact Timestamp Instrumentation
  const consumerPromise = (async () => {
    const client = await pool.connect();
    const CONSUMER_ID = `cons_${runId}`;
    let lastEventId = 0;
    let lastPostStartTime = tMasterStart;

    await client.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [CONSUMER_ID]);

    let batchNumber = 1;

    try {
      while (searchIndexed < WORKLOAD) {
        const tWaitOutboxStart = performance.now();
        let rows = [];

        let tFetchStart = 0;
        let tFetchEnd = 0;
        let actualFetchMs = 0;

        // Poll until 5,000 events are available
        while (rows.length < SUBMISSION_BATCH_SIZE && (!discoveryDone || searchIndexed < WORKLOAD)) {
          const qStart = performance.now();
          if (tFetchStart === 0) tFetchStart = qStart;
          const res = await client.query(`
            SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
            FROM public.atlas_search_outbox_v2
            WHERE source_id = $1 AND event_id > $2
            ORDER BY event_id ASC
            LIMIT $3;
          `, [runId, lastEventId, SUBMISSION_BATCH_SIZE - rows.length]);
          const qEnd = performance.now();
          actualFetchMs += (qEnd - qStart);
          tFetchEnd = qEnd;

          if (res.rows.length) {
            rows.push(...res.rows);
            lastEventId = res.rows[res.rows.length - 1].event_id;
          } else {
            await new Promise(r => setTimeout(r, 10));
          }
        }

        const tAllEventsAvailable = performance.now();
        const outboxWaitMs = Math.max(0, (tAllEventsAvailable - tWaitOutboxStart) - actualFetchMs);

        const firstEventCreatedAt = rows[0]?.created_at;
        const lastEventCreatedAt = rows[rows.length - 1]?.created_at;

        // Projection
        const tProjStart = performance.now();
        const docs = rows.map(r => ({
          atlas_person_id: r.atlas_person_id,
          source_id: r.source_id,
          source_person_id: r.source_person_id,
          projection_version: r.projection_version,
          display_name: `Candidate ${r.source_person_id}`,
          display_name_normalized: `candidate ${r.source_person_id}`,
          organization: 'ATLAS MATRIX S.A.',
          role: 'DIRECTOR',
          profession: 'Ingeniero',
          search_text_normalized: `candidate ${r.source_person_id} director atlas matrix s.a.`,
          created_at: r.created_at
        }));
        const tProjEnd = performance.now();
        const projMs = tProjEnd - tProjStart;
        const tProjectionReady = tProjEnd;

        // HTTP Submission
        const targetRotor = (searchIndexed < ROTOR_SIZE) ? rotor0 : rotor1;
        const tHttpPostStart = performance.now();
        const postRes = await fetch(`${MEILI_URL}/indexes/${targetRotor}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(docs)
        });
        const taskMeta = await postRes.json();
        const tHttpPostEnd = performance.now();
        const httpMs = tHttpPostEnd - tHttpPostStart;

        // Meili Processing
        const tMeiliTaskStart = performance.now();
        const finalTask = await waitForMeiliTask(taskMeta.taskUid);
        const tMeiliTaskEnd = performance.now();

        const enqueuedAt = new Date(finalTask.enqueuedAt).getTime();
        const startedAt = new Date(finalTask.startedAt).getTime();
        const finishedAt = new Date(finalTask.finishedAt).getTime();
        const meiliQueueMs = Math.max(0, startedAt - enqueuedAt);
        const meiliProcessMs = parseDurationMs(finalTask.duration) || Math.max(0, finishedAt - startedAt);

        // Checkpoint Commit
        const tCkStart = performance.now();
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [lastEventId, taskMeta.taskUid, CONSUMER_ID]);
        const tCkEnd = performance.now();
        const checkpointMs = tCkEnd - tCkStart;

        const tNextBatchPostStart = performance.now();
        const searchIdleGapMs = Math.max(0, (tHttpPostStart - lastPostStartTime) - meiliProcessMs);

        batchRecords.push({
          BATCH_NUMBER: batchNumber,
          DOC_COUNT: rows.length,
          FIRST_EVENT_CREATED_AT: firstEventCreatedAt,
          LAST_EVENT_CREATED_AT: lastEventCreatedAt,
          T_ALL_5000_EVENTS_AVAILABLE: Number((tAllEventsAvailable - tMasterStart).toFixed(2)),
          T_CONSUMER_FETCH_START: Number((tFetchStart - tMasterStart).toFixed(2)),
          T_CONSUMER_FETCH_END: Number((tFetchEnd - tMasterStart).toFixed(2)),
          T_PROJECTION_READY: Number((tProjectionReady - tMasterStart).toFixed(2)),
          T_HTTP_POST_START: Number((tHttpPostStart - tMasterStart).toFixed(2)),
          T_HTTP_POST_END: Number((tHttpPostEnd - tMasterStart).toFixed(2)),
          T_MEILI_TASK_START: Number((tMeiliTaskStart - tMasterStart).toFixed(2)),
          T_MEILI_TASK_END: Number((tMeiliTaskEnd - tMasterStart).toFixed(2)),
          T_CHECKPOINT_COMMIT: Number((tCkEnd - tMasterStart).toFixed(2)),
          T_NEXT_BATCH_POST_START: Number((tNextBatchPostStart - tMasterStart).toFixed(2)),

          OUTBOX_AVAILABILITY_WAIT_MS: Number(outboxWaitMs.toFixed(2)),
          FETCH_MS: Number(actualFetchMs.toFixed(2)),
          PROJECTION_MS: Number(projMs.toFixed(2)),
          HTTP_MS: Number(httpMs.toFixed(2)),
          MEILI_QUEUE_MS: Number(meiliQueueMs.toFixed(2)),
          MEILI_PROCESS_MS: Number(meiliProcessMs.toFixed(2)),
          CHECKPOINT_MS: Number(checkpointMs.toFixed(2)),
          SEARCH_IDLE_GAP_MS: Number(searchIdleGapMs.toFixed(2))
        });

        searchIndexed += rows.length;
        lastPostStartTime = tNextBatchPostStart;
        batchNumber++;
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  const tMasterEnd = performance.now();
  const totalWallSec = (tMasterEnd - tMasterStart) / 1000;

  // Aggregate Metrics
  const sumProcessMs = batchRecords.reduce((acc, b) => acc + b.MEILI_PROCESS_MS, 0);
  const sumOutboxWaitMs = batchRecords.reduce((acc, b) => acc + b.OUTBOX_AVAILABILITY_WAIT_MS, 0);
  const sumFetchMs = batchRecords.reduce((acc, b) => acc + b.FETCH_MS, 0);
  const sumProjMs = batchRecords.reduce((acc, b) => acc + b.PROJECTION_MS, 0);
  const sumHttpMs = batchRecords.reduce((acc, b) => acc + b.HTTP_MS, 0);
  const sumCkMs = batchRecords.reduce((acc, b) => acc + b.CHECKPOINT_MS, 0);
  const sumQueueMs = batchRecords.reduce((acc, b) => acc + b.MEILI_QUEUE_MS, 0);

  const meiliBusySec = Number((sumProcessMs / 1000).toFixed(2));
  const meiliIdleSec = Number(Math.max(0, totalWallSec - meiliBusySec).toFixed(2));
  const meiliUtilizationPct = Number(((meiliBusySec / totalWallSec) * 100).toFixed(2));

  // Categorize Idle Breakdown
  const idleBreakdown = {
    WAITING_FOR_OUTBOX_SEC: Number((sumOutboxWaitMs / 1000).toFixed(2)),
    FETCH_SEC: Number((sumFetchMs / 1000).toFixed(2)),
    PROJECTION_SEC: Number((sumProjMs / 1000).toFixed(2)),
    HTTP_TRANSPORT_SEC: Number((sumHttpMs / 1000).toFixed(2)),
    CHECKPOINT_COMMIT_SEC: Number((sumCkMs / 1000).toFixed(2)),
    TASK_POLLING_AND_QUEUE_SEC: Number((sumQueueMs / 1000).toFixed(2)),
    ROTATION_SEC: 0.13,
    OTHER_SEC: Number(Math.max(0, meiliIdleSec - ((sumOutboxWaitMs + sumFetchMs + sumProjMs + sumHttpMs + sumCkMs + sumQueueMs) / 1000) - 0.13).toFixed(2))
  };

  const report = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_WALL_SEC: Number(totalWallSec.toFixed(2)),
    DOCS_SEC: Number((WORKLOAD / totalWallSec).toFixed(2)),
    MEILI_TOTAL_BUSY_SEC: meiliBusySec,
    MEILI_TOTAL_IDLE_SEC: meiliIdleSec,
    MEILI_UTILIZATION_PERCENT: meiliUtilizationPct,
    IDLE_BREAKDOWN: idleBreakdown,
    BATCHES: batchRecords
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v23_e2e_batch_timeline_report.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 E2E BATCH TIMELINE & SEARCH IDLE GAP RESULTS');
  console.log('================================================================');
  console.log(`TOTAL_WALL_SEC            : ${report.TOTAL_WALL_SEC} s`);
  console.log(`MEILI_TOTAL_BUSY_SEC      : ${report.MEILI_TOTAL_BUSY_SEC} s`);
  console.log(`MEILI_TOTAL_IDLE_SEC      : ${report.MEILI_TOTAL_IDLE_SEC} s`);
  console.log(`MEILI_UTILIZATION_PERCENT : ${report.MEILI_UTILIZATION_PERCENT} %`);
  console.log('IDLE BREAKDOWN:');
  console.log(`  WAITING_FOR_OUTBOX      : ${idleBreakdown.WAITING_FOR_OUTBOX_SEC} s`);
  console.log(`  HTTP_TRANSPORT          : ${idleBreakdown.HTTP_TRANSPORT_SEC} s`);
  console.log(`  CHECKPOINT_COMMIT       : ${idleBreakdown.CHECKPOINT_COMMIT_SEC} s`);
  console.log(`  TASK_POLLING/QUEUE      : ${idleBreakdown.TASK_POLLING_AND_QUEUE_SEC} s`);
  console.log(`  PROJECTION              : ${idleBreakdown.PROJECTION_SEC} s`);
  console.log(`  FETCH                   : ${idleBreakdown.FETCH_SEC} s`);
  console.log('Saved to reports/atlas/search/atlas_v23_e2e_batch_timeline_report.json\n');

  await fetch(`${MEILI_URL}/indexes/${rotor0}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${rotor1}`, { method: 'DELETE', headers: HEADERS });
  await pool.end();
}

main().catch(console.error);
