import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { fetch as undiciFetch, Agent } from 'undici';
import fs from 'node:fs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const NEW_WRITE_COHORT = 50000;
const SUBMISSION_BATCH_SIZE = 5000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_LANES = 2;
const BACKPRESSURE_TRIGGER = 25000;
const TARGET_QPS = 20;
const MAX_INFLIGHT_QUERIES = 16;
const CLIENT_TIMEOUT_MS = 5000;

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

const sampleQueries = ['gonzalez', 'director', 'ingeniero', 'mercado', 'presidente', 'abogado', 'matrix', 'holding', 'santos', 'lopez'];

function parseDurationMs(durationStr) {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT([\d.]+)S/);
  if (match) return parseFloat(match[1]) * 1000;
  return 0;
}

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

let mdbReadersFullCount = 0;

async function waitForMeiliTask(taskUid) {
  if (!taskUid) throw new Error('Task UID is undefined');
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('MDB_READERS_FULL')) mdbReadersFullCount++;
      await new Promise(r => setTimeout(r, 50));
      continue;
    }
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

async function createRotor(uid) {
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

async function runConfigA() {
  console.log('================================================================');
  console.log('⚡ CONFIGURATION A — MONOLITHIC MEILISEARCH RESOURCE DOMAIN');
  console.log('4 Static Sealed Rotors (200K) + 1 Active Write Rotor (50K Net-New)');
  console.log('Safe Double Buffer | 20 QPS Multi-Search Fanout | Max Inflight = 16');
  console.log('================================================================\n');

  // Verify the 4 static rotors exist and have 50K docs each
  const staticRotors = [
    'v24_canary_1790015958064_rot_0',
    'v24_canary_1790015958064_rot_1',
    'v24_canary_1790015958064_rot_2',
    'v24_canary_1790015958064_rot_3'
  ];

  console.log('🔍 Verifying 4 static rotors (200,000 existing docs)...');
  for (const sUid of staticRotors) {
    const sRes = await fetch(`${MEILI_URL}/indexes/${sUid}/stats`, { headers: HEADERS });
    const sStats = await sRes.json();
    console.log(`   Rotor ${sUid}: ${sStats.numberOfDocuments} docs`);
  }

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 10 });
  const runTag = `v25_cfga_${Date.now()}`;
  const consumerId = `cons_${runTag}`;
  const activeWriteRotor = `${runTag}_rot_active`;

  console.log(`\n🔧 Pre-creating Active Write Rotor (${activeWriteRotor})...`);
  await createRotor(activeWriteRotor);
  console.log('   ✅ Active write rotor ready.');

  const allFederatedRotors = [...staticRotors, activeWriteRotor];

  const dispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: 16,
    pipelining: 1
  });

  let queriesAttempted = 0;
  let queriesCompleted = 0;
  let queryErrors = 0;
  let queryTimeouts = 0;
  let inFlight = 0;
  let maxInFlightObserved = 0;
  let missedSlots = 0;
  let clampDroppedSlots = 0;
  const latencies = [];
  let stopQueryWorker = false;
  let qIdx = 0;

  const tStart = performance.now();
  const SLOT_MS = 1000 / TARGET_QPS;
  let lastSlot = 0;

  function dispatchQuery() {
    queriesAttempted++;
    inFlight++;
    if (inFlight > maxInFlightObserved) maxInFlightObserved = inFlight;

    const q = sampleQueries[qIdx++ % sampleQueries.length];
    const tQStart = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    undiciFetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      signal: controller.signal,
      dispatcher,
      body: JSON.stringify({
        queries: allFederatedRotors.map(uid => ({ indexUid: uid, q })),
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
      const passed = currentSlot - lastSlot;
      if (passed > 1) missedSlots += (passed - 1);
      lastSlot = currentSlot;

      if (inFlight >= MAX_INFLIGHT_QUERIES) {
        clampDroppedSlots++;
      } else {
        dispatchQuery();
      }
    }
  }, 5);

  // Producer (2 Lanes, 50,000 docs)
  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  const perLane = NEW_WRITE_COHORT / DISCOVERY_LANES;
  const lanePromises = [];

  for (let l = 0; l < DISCOVERY_LANES; l++) {
    const start = l * perLane;
    const end = start + perLane;
    lanePromises.push((async () => {
      const client = await pool.connect();
      try {
        for (let b = start; b < end; b += DISCOVERY_BATCH_SIZE) {
          while (totalCommitted - searchIndexed >= BACKPRESSURE_TRIGGER) {
            await new Promise(r => setTimeout(r, 20));
          }
          const count = Math.min(DISCOVERY_BATCH_SIZE, end - b);
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
    })());
  }

  const producerPromise = Promise.all(lanePromises).then(() => {
    discoveryDone = true;
    console.log(`   Discovery finished in ${((performance.now() - tStart) / 1000).toFixed(2)}s`);
  });

  // Consumer (Safe Double Buffer, 50,000 docs into activeWriteRotor)
  let totalMeiliBusyMs = 0;
  const consumerPromise = (async () => {
    const client = await pool.connect();
    let lastFetchedEventId = 0;

    await client.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [consumerId]);

    async function prefetchBatch() {
      let rows = [];
      while (rows.length < SUBMISSION_BATCH_SIZE && (!discoveryDone || (searchIndexed + rows.length < NEW_WRITE_COHORT))) {
        const res = await client.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT $3;
        `, [runTag, lastFetchedEventId, SUBMISSION_BATCH_SIZE - rows.length]);
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
      while (preparedBatch && searchIndexed < NEW_WRITE_COHORT) {
        const currentBatch = preparedBatch;
        const postRes = await fetch(`${MEILI_URL}/indexes/${activeWriteRotor}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(currentBatch.docs)
        });
        if (!postRes.ok) {
          const errText = await postRes.text();
          if (errText.includes('MDB_READERS_FULL')) mdbReadersFullCount++;
          throw new Error(`Document POST failed: ${postRes.status} ${errText}`);
        }
        const taskMeta = await postRes.json();

        const taskPromise = waitForMeiliTask(taskMeta.taskUid);
        const prefetchPromise = (searchIndexed + currentBatch.docs.length < NEW_WRITE_COHORT)
          ? prefetchBatch()
          : Promise.resolve(null);

        const [finalTask, nextPreparedBatch] = await Promise.all([taskPromise, prefetchPromise]);
        const durMs = parseDurationMs(finalTask.duration);
        totalMeiliBusyMs += durMs;

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

  await Promise.all([producerPromise, consumerPromise]);
  stopQueryWorker = true;
  clearInterval(queryScheduler);

  // Wait for in-flight queries to drain
  await new Promise(r => setTimeout(r, 200));

  const totalWallSec = (performance.now() - tStart) / 1000;
  const visibleDocsSec = Number((NEW_WRITE_COHORT / totalWallSec).toFixed(2));
  const actualQps = Number((queriesAttempted / totalWallSec).toFixed(2));
  const completedQps = Number((queriesCompleted / totalWallSec).toFixed(2));
  const pct = calcPercentiles(latencies);

  const resultsA = {
    A_VISIBLE_DOCS_SEC: visibleDocsSec,
    A_ACTUAL_QPS: actualQps,
    A_COMPLETED_QPS: completedQps,
    A_QUERY_P50: pct.P50,
    A_QUERY_P95: pct.P95,
    A_QUERY_P99: pct.P99,
    A_MDB_READERS_FULL_COUNT: mdbReadersFullCount,
    A_QUERY_ERRORS: queryErrors,
    A_QUERY_TIMEOUTS: queryTimeouts,
    A_MEILI_PROCESSING_MS: Number(totalMeiliBusyMs.toFixed(2)),
    A_PEAK_INFLIGHT: maxInFlightObserved,
    A_TOTAL_WALL_SEC: Number(totalWallSec.toFixed(2)),
    A_CLAMP_DROPPED_SLOTS: clampDroppedSlots
  };

  console.log('\n📊 CONFIGURATION A FINAL RESULTS:');
  console.log(JSON.stringify(resultsA, null, 2));
  fs.writeFileSync('scratch/config_a_results.json', JSON.stringify(resultsA, null, 2));

  // Cleanup active write rotor and outbox
  const cleanClient = await pool.connect();
  try {
    await cleanClient.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1;`, [runTag]);
    await cleanClient.query(`DELETE FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;`, [consumerId]);
  } finally {
    cleanClient.release();
    await pool.end();
  }
  await fetch(`${MEILI_URL}/indexes/${activeWriteRotor}`, { method: 'DELETE', headers: HEADERS });
}

runConfigA().catch(console.error);
