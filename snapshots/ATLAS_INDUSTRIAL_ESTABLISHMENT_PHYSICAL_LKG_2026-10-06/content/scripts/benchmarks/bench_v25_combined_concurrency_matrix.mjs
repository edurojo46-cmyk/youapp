import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { fetch as undiciFetch, Agent } from 'undici';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const sampleQueries = ['gonzalez', 'director', 'ingeniero', 'mercado', 'presidente', 'abogado', 'matrix', 'holding', 'santos', 'lopez'];

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0, Max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    Max: Number(sorted[sorted.length - 1].toFixed(2))
  };
}

function getCloseWaitCount() {
  try {
    const output = execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 7700 -State CloseWait -ErrorAction SilentlyContinue).Count"', { encoding: 'utf8' }).trim();
    return parseInt(output || '0', 10);
  } catch {
    return 0;
  }
}

function getEstCount() {
  try {
    const output = execSync('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 7700 -State Established -ErrorAction SilentlyContinue).Count"', { encoding: 'utf8' }).trim();
    return parseInt(output || '0', 10);
  } catch {
    return 0;
  }
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

async function waitForMeiliTask(taskUid) {
  if (!taskUid) throw new Error('Task UID is undefined');
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    if (!res.ok) {
      await new Promise(r => setTimeout(r, 20));
      continue;
    }
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 20));
  }
}

const FROZEN_SETTINGS = {
  displayedAttributes: ['*'],
  searchableAttributes: [
    'display_name',
    'display_name_normalized',
    'organization',
    'role',
    'profession',
    'search_text_normalized'
  ],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 } },
  pagination: { maxTotalHits: 1000 },
  prefixSearch: 'indexingTime'
};

async function createFreshRotor(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const task = await res.json();
  await waitForMeiliTask(task.taskUid);
  const setRes = await fetch(`${MEILI_URL}/indexes/${uid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const setTask = await setRes.json();
  await waitForMeiliTask(setTask.taskUid);
}

// 4 Rotors for federated search
const federatedRotorUids = [
  'v24_canary_1790015958064_rot_0',
  'v24_canary_1790015958064_rot_1',
  'v24_canary_1790015958064_rot_2',
  'v24_canary_1790015958064_rot_3'
];

async function runSingleCombinedTest(maxInFlight, httpConns, docsToIngest = 15000) {
  console.log(`\n================================================================`);
  console.log(`🧪 COMBINED TEST: Inflight Clamp: ${maxInFlight} | Undici Conns: ${httpConns} | Docs: ${docsToIngest}`);
  console.log(`================================================================`);

  const closeWaitStart = getCloseWaitCount();
  const pool = new pg.Pool({ ...parseDbUrl(), max: 6 });
  const runTag = `v25_cmb_${maxInFlight}_${Date.now()}`;
  const consumerId = `cons_${runTag}`;
  const targetIndexingRotor = `${runTag}_rot_active`;

  await createFreshRotor(targetIndexingRotor);

  const dispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: httpConns,
    pipelining: 1
  });

  const TARGET_QPS = 20;
  const SLOT_MS = 1000 / TARGET_QPS;
  let queriesAttempted = 0;
  let queriesCompleted = 0;
  let queryErrors = 0;
  let queryTimeouts = 0;
  let mdbReadersFullCount = 0;
  let inFlight = 0;
  let maxInFlightObserved = 0;
  const latencies = [];
  let stopQueryWorker = false;
  let qIdx = 0;

  const tStart = performance.now();
  let lastSlot = 0;

  function dispatchQuery() {
    queriesAttempted++;
    inFlight++;
    if (inFlight > maxInFlightObserved) maxInFlightObserved = inFlight;

    const q = sampleQueries[qIdx++ % sampleQueries.length];
    const tQStart = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    undiciFetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      signal: controller.signal,
      dispatcher,
      body: JSON.stringify({
        queries: federatedRotorUids.map(uid => ({ indexUid: uid, q })),
        federation: { limit: 20 }
      })
    }).then(async res => {
      clearTimeout(timeout);
      inFlight--;
      if (!res.ok) {
        queryErrors++;
        const text = await res.text();
        if (text.includes('MDB_READERS_FULL')) mdbReadersFullCount++;
      } else {
        latencies.push(performance.now() - tQStart);
        queriesCompleted++;
      }
    }).catch(err => {
      clearTimeout(timeout);
      inFlight--;
      if (err.name === 'AbortError') queryTimeouts++;
      else queryErrors++;
    });
  }

  const queryScheduler = setInterval(() => {
    if (stopQueryWorker) return;
    const elapsed = performance.now() - tStart;
    const currentSlot = Math.floor(elapsed / SLOT_MS);
    if (currentSlot > lastSlot) {
      lastSlot = currentSlot;
      if (inFlight < maxInFlight) {
        dispatchQuery();
      }
    }
  }, 5);

  // Producer (2 lanes)
  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  const SUBMISSION_BATCH = 5000;
  const DISCOVERY_BATCH = 2000;

  const p1 = (async () => {
    const client = await pool.connect();
    try {
      for (let b = 0; b < docsToIngest; b += DISCOVERY_BATCH) {
        const count = Math.min(DISCOVERY_BATCH, docsToIngest - b);
        const pSources = new Array(count).fill(runTag);
        const pSrcIds = new Array(count);
        const pHmacs = new Array(count);
        const pPersonIds = new Array(count);
        const pDecisions = new Array(count).fill('NEW');
        const pEvidenceIds = new Array(count).fill(null);
        const pObservedAts = new Array(count).fill(new Date().toISOString());
        for (let i = 0; i < count; i++) {
          pSrcIds[i] = `SRC_${runTag}_${b + i}`;
          pHmacs[i] = `hmac_${runTag}_${b + i}`;
          pPersonIds[i] = `P_${runTag}_${b + i}`;
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
    discoveryDone = true;
  })();

  // Consumer
  let peakEst = 0;
  const p2 = (async () => {
    const client = await pool.connect();
    let lastFetchedEventId = 0;

    await client.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [consumerId]);

    async function prefetchBatch() {
      let rows = [];
      while (rows.length < SUBMISSION_BATCH && (!discoveryDone || (searchIndexed + rows.length < docsToIngest))) {
        const res = await client.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT $3;
        `, [runTag, lastFetchedEventId, SUBMISSION_BATCH - rows.length]);
        if (res.rows.length) {
          rows.push(...res.rows);
          lastFetchedEventId = res.rows[res.rows.length - 1].event_id;
        } else {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      if (rows.length === 0) return null;
      return { docs: projectDocs(rows), lastEventId: lastFetchedEventId };
    }

    try {
      let preparedBatch = await prefetchBatch();
      while (preparedBatch && searchIndexed < docsToIngest) {
        const cur = getEstCount();
        if (cur > peakEst) peakEst = cur;

        const currentBatch = preparedBatch;
        const postRes = await fetch(`${MEILI_URL}/indexes/${targetIndexingRotor}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(currentBatch.docs)
        });
        const taskMeta = await postRes.json();
        const taskPromise = waitForMeiliTask(taskMeta.taskUid);
        const prefetchPromise = (searchIndexed + currentBatch.docs.length < docsToIngest)
          ? prefetchBatch()
          : Promise.resolve(null);

        const [finalTask, nextPreparedBatch] = await Promise.all([taskPromise, prefetchPromise]);
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [currentBatch.lastEventId, taskMeta.taskUid, consumerId]);

        searchIndexed += currentBatch.docs.length;
        preparedBatch = nextPreparedBatch;
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([p1, p2]);
  stopQueryWorker = true;
  clearInterval(queryScheduler);

  // Wait for queries to drain
  await new Promise(r => setTimeout(r, 200));

  const totalWallSec = (performance.now() - tStart) / 1000;
  const actualQps = Number((queriesAttempted / totalWallSec).toFixed(2));
  const visibleDocsSec = Number((docsToIngest / totalWallSec).toFixed(2));
  const pct = calcPercentiles(latencies);
  const closeWaitEnd = getCloseWaitCount();

  // Cleanup
  const cleanClient = await pool.connect();
  try {
    await cleanClient.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1;`, [runTag]);
    await cleanClient.query(`DELETE FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;`, [consumerId]);
  } finally {
    cleanClient.release();
    await pool.end();
  }
  await fetch(`${MEILI_URL}/indexes/${targetIndexingRotor}`, { method: 'DELETE', headers: HEADERS });

  const summary = {
    MAX_INFLIGHT_LIMIT: maxInFlight,
    UNDICI_CONNECTIONS: httpConns,
    TOTAL_WALL_SEC: Number(totalWallSec.toFixed(2)),
    ACTUAL_QPS: actualQps,
    VISIBLE_DOCS_SEC: visibleDocsSec,
    QUERY_P95: pct.P95,
    QUERY_P99: pct.P99,
    MAX_INFLIGHT_OBSERVED: maxInFlightObserved,
    MDB_READERS_FULL_COUNT: mdbReadersFullCount,
    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,
    PEAK_ESTABLISHED: peakEst,
    CLOSE_WAIT_START: closeWaitStart,
    CLOSE_WAIT_END: closeWaitEnd
  };

  console.log(`Results for Inflight=${maxInFlight}, Conns=${httpConns}:`, summary);
  return summary;
}

async function main() {
  // Section 7: MAX_INFLIGHT = 4, 8, 16, 32, 64 (keep conns = matching or 16)
  const inflightRuns = [4, 8, 16, 32, 64];
  const sec7Results = [];
  for (const inf of inflightRuns) {
    const res = await runSingleCombinedTest(inf, Math.min(inf, 32), 15000);
    sec7Results.push(res);
  }
  fs.writeFileSync('scratch/combined_concurrency_matrix_results.json', JSON.stringify(sec7Results, null, 2));

  // Section 8: UNDICI_CONNECTIONS = 8, 16, 32 with matching MAX_INFLIGHT
  const poolRuns = [8, 16, 32];
  const sec8Results = [];
  for (const conn of poolRuns) {
    const match = sec7Results.find(r => r.UNDICI_CONNECTIONS === conn && r.MAX_INFLIGHT_LIMIT === conn);
    if (match) {
      sec8Results.push(match);
    } else {
      const res = await runSingleCombinedTest(conn, conn, 15000);
      sec8Results.push(res);
    }
  }
  fs.writeFileSync('scratch/http_connection_pool_matrix_results.json', JSON.stringify(sec8Results, null, 2));

  console.log('\n================================================================');
  console.log('✅ SECTION 7 & 8 TESTS COMPLETED');
  console.log('================================================================');
  console.log('Section 7 results:', JSON.stringify(sec7Results, null, 2));
  console.log('Section 8 results:', JSON.stringify(sec8Results, null, 2));
}

main().catch(console.error);
