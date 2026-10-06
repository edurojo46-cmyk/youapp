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
const SUBMISSION_BATCH_SIZE = 5000;
const ROTOR_SIZE = 50000;
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

function projectDocs(rows) {
  return rows.map(r => ({
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
}

async function runStrictSerialTest(pool) {
  console.log('\n--- Running STRICT_SERIAL Consumer (100K) ---');
  const runId = `strict_${Date.now()}`;
  const rotor0 = `${runId}_rot_0`;
  const rotor1 = `${runId}_rot_1`;
  await createIndex(rotor0);
  await createIndex(rotor1);

  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;

  const tStart = performance.now();

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
            pSrcIds[i] = `SRC_SS_${b + i}`;
            pHmacs[i] = `hmac_ss_${b + i}`;
            pPersonIds[i] = `P_SS_${b + i}`;
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

  const producerPromise = Promise.all(lanePromises).then(() => { discoveryDone = true; });

  let totalMeiliBusyMs = 0;
  let totalCheckpointMs = 0;
  const consumerPromise = (async () => {
    const client = await pool.connect();
    const consumerId = `cons_${runId}`;
    let lastEventId = 0;
    try {
      while (searchIndexed < WORKLOAD) {
        // 1. Fetch
        let rows = [];
        while (rows.length < SUBMISSION_BATCH_SIZE && (!discoveryDone || searchIndexed < WORKLOAD)) {
          const res = await client.query(`
            SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
            FROM public.atlas_search_outbox_v2
            WHERE source_id = $1 AND event_id > $2
            ORDER BY event_id ASC
            LIMIT $3;
          `, [runId, lastEventId, SUBMISSION_BATCH_SIZE - rows.length]);
          if (res.rows.length) {
            rows.push(...res.rows);
            lastEventId = res.rows[res.rows.length - 1].event_id;
          } else {
            await new Promise(r => setTimeout(r, 10));
          }
        }

        // 2. Project
        const docs = projectDocs(rows);

        // 3. Submit
        const targetRotor = (searchIndexed < ROTOR_SIZE) ? rotor0 : rotor1;
        const postRes = await fetch(`${MEILI_URL}/indexes/${targetRotor}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(docs)
        });
        const taskMeta = await postRes.json();

        // 4. Wait
        const finalTask = await waitForMeiliTask(taskMeta.taskUid);
        const meiliDuration = parseDurationMs(finalTask.duration) || 3500;
        totalMeiliBusyMs += meiliDuration;

        // 5. Checkpoint
        const tCkStart = performance.now();
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [lastEventId, taskMeta.taskUid, consumerId]);
        totalCheckpointMs += (performance.now() - tCkStart);

        searchIndexed += docs.length;
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  const tEnd = performance.now();
  const wallSec = (tEnd - tStart) / 1000;
  const docsSec = WORKLOAD / wallSec;
  const busySec = totalMeiliBusyMs / 1000;
  const idleSec = Math.max(0, wallSec - busySec);
  const util = (busySec / wallSec) * 100;
  const avgCkMs = totalCheckpointMs / (WORKLOAD / SUBMISSION_BATCH_SIZE);

  await fetch(`${MEILI_URL}/indexes/${rotor0}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${rotor1}`, { method: 'DELETE', headers: HEADERS });

  return {
    wallSec: Number(wallSec.toFixed(2)),
    docsSec: Number(docsSec.toFixed(2)),
    busySec: Number(busySec.toFixed(2)),
    idleSec: Number(idleSec.toFixed(2)),
    util: Number(util.toFixed(2)),
    avgCkMs: Number(avgCkMs.toFixed(2))
  };
}

async function runSafeDoubleBufferTest(pool) {
  console.log('\n--- Running SAFE_DOUBLE_BUFFER Consumer (100K) ---');
  const runId = `sdb_${Date.now()}`;
  const rotor0 = `${runId}_rot_0`;
  const rotor1 = `${runId}_rot_1`;
  await createIndex(rotor0);
  await createIndex(rotor1);

  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;

  const tStart = performance.now();

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
            pSrcIds[i] = `SRC_SDB_${b + i}`;
            pHmacs[i] = `hmac_sdb_${b + i}`;
            pPersonIds[i] = `P_SDB_${b + i}`;
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

  const producerPromise = Promise.all(lanePromises).then(() => { discoveryDone = true; });

  let totalMeiliBusyMs = 0;
  let totalCheckpointMs = 0;

  const consumerPromise = (async () => {
    const client = await pool.connect();
    const consumerId = `cons_${runId}`;
    let lastFetchedEventId = 0;

    // Helper to fetch and project one batch of up to 5,000 documents
    async function prefetchBatch() {
      let rows = [];
      while (rows.length < SUBMISSION_BATCH_SIZE && (!discoveryDone || (searchIndexed + rows.length < WORKLOAD))) {
        const res = await client.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT $3;
        `, [runId, lastFetchedEventId, SUBMISSION_BATCH_SIZE - rows.length]);
        if (res.rows.length) {
          rows.push(...res.rows);
          lastFetchedEventId = res.rows[res.rows.length - 1].event_id;
        } else {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      if (rows.length === 0) return null;
      const docs = projectDocs(rows);
      return { docs, lastEventId: lastFetchedEventId };
    }

    try {
      // 1. Initial prefetch of Batch 1
      let preparedBatch = await prefetchBatch();

      while (preparedBatch && searchIndexed < WORKLOAD) {
        const currentBatch = preparedBatch;
        const targetRotor = (searchIndexed < ROTOR_SIZE) ? rotor0 : rotor1;

        // 2. Submit Current Batch N
        const postRes = await fetch(`${MEILI_URL}/indexes/${targetRotor}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(currentBatch.docs)
        });
        const taskMeta = await postRes.json();

        // 3. Concurrently:
        //    a) Wait for Meilisearch Task N to complete
        //    b) Prefetch and project Batch N+1 if more work remains
        const taskPromise = waitForMeiliTask(taskMeta.taskUid);
        const prefetchPromise = (searchIndexed + currentBatch.docs.length < WORKLOAD)
          ? prefetchBatch()
          : Promise.resolve(null);

        // Wait for both to complete
        const [finalTask, nextPreparedBatch] = await Promise.all([taskPromise, prefetchPromise]);

        const meiliDuration = parseDurationMs(finalTask.duration) || 3500;
        totalMeiliBusyMs += meiliDuration;

        // 4. Conservative ordering: TASK N SUCCEEDED -> COMMIT CHECKPOINT N
        const tCkStart = performance.now();
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [currentBatch.lastEventId, taskMeta.taskUid, consumerId]);
        totalCheckpointMs += (performance.now() - tCkStart);

        searchIndexed += currentBatch.docs.length;

        // 5. Next loop will immediately submit Batch N+1 (already prepared!)
        preparedBatch = nextPreparedBatch;
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  const tEnd = performance.now();
  const wallSec = (tEnd - tStart) / 1000;
  const docsSec = WORKLOAD / wallSec;
  const busySec = totalMeiliBusyMs / 1000;
  const idleSec = Math.max(0, wallSec - busySec);
  const util = (busySec / wallSec) * 100;
  const avgCkMs = totalCheckpointMs / (WORKLOAD / SUBMISSION_BATCH_SIZE);

  await fetch(`${MEILI_URL}/indexes/${rotor0}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${rotor1}`, { method: 'DELETE', headers: HEADERS });

  return {
    wallSec: Number(wallSec.toFixed(2)),
    docsSec: Number(docsSec.toFixed(2)),
    busySec: Number(busySec.toFixed(2)),
    idleSec: Number(idleSec.toFixed(2)),
    util: Number(util.toFixed(2)),
    avgCkMs: Number(avgCkMs.toFixed(2))
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.3 — PIPELINED DOUBLE BUFFER BENCHMARK (100K MATCHED)');
  console.log('Comparing STRICT_SERIAL vs SAFE_DOUBLE_BUFFER');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 8 });

  const strictRes = await runStrictSerialTest(pool);
  console.log(`STRICT_SERIAL     : ${strictRes.docsSec} docs/sec | Wall: ${strictRes.wallSec}s | Busy: ${strictRes.busySec}s | Idle: ${strictRes.idleSec}s | Util: ${strictRes.util}% | Ck: ${strictRes.avgCkMs}ms`);

  const sdbRes = await runSafeDoubleBufferTest(pool);
  console.log(`SAFE_DOUBLE_BUFFER: ${sdbRes.docsSec} docs/sec | Wall: ${sdbRes.wallSec}s | Busy: ${sdbRes.busySec}s | Idle: ${sdbRes.idleSec}s | Util: ${sdbRes.util}% | Ck: ${sdbRes.avgCkMs}ms`);

  const diffPct = Number((((sdbRes.docsSec - strictRes.docsSec) / strictRes.docsSec) * 100).toFixed(2));

  console.log('\n================================================================');
  console.log('🏆 DOUBLE BUFFER COMPARISON RESULTS');
  console.log('================================================================');
  console.log(`STRICT_SERIAL_DOCS_SEC            : ${strictRes.docsSec}`);
  console.log(`SAFE_DOUBLE_BUFFER_DOCS_SEC       : ${sdbRes.docsSec}`);
  console.log(`DOUBLE_BUFFER_IMPROVEMENT_PERCENT : ${diffPct} %`);
  console.log(`MEILI_UTILIZATION_BEFORE          : ${strictRes.util} %`);
  console.log(`MEILI_UTILIZATION_AFTER           : ${sdbRes.util} %`);
  console.log(`CHECKPOINT_COMMIT_MS              : ${sdbRes.avgCkMs} ms`);

  const out = {
    STRICT_SERIAL: strictRes,
    SAFE_DOUBLE_BUFFER: sdbRes,
    DOUBLE_BUFFER_IMPROVEMENT_PERCENT: diffPct
  };
  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v23_double_buffer_benchmark.json', JSON.stringify(out, null, 2));

  await pool.end();
}

main().catch(console.error);
