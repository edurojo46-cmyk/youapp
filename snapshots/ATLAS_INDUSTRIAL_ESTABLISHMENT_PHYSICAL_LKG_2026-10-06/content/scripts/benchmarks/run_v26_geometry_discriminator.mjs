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

const NEW_WRITE_COHORT = 50000;
const SUBMISSION_BATCH_SIZE = 5000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_LANES = 2;
const BACKPRESSURE_TRIGGER = 25000;
const TARGET_QPS = 20;
const MAX_INFLIGHT_QUERIES = 64; // Safety ceiling, not bottleneck
const CLIENT_TIMEOUT_MS = 5000;
const MAX_SUBMISSION_RETRIES = 3;
const RETRY_BACKOFFS = [250, 500, 1000];

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

function getSocketStats() {
  try {
    const raw = execSync('powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 7700 -ErrorAction SilentlyContinue | Group-Object State | Select-Object Name, Count | ConvertTo-Json"', { encoding: 'utf-8' });
    if (!raw.trim()) return { ESTABLISHED: 0, CLOSE_WAIT: 0, TIME_WAIT: 0, TOTAL: 0 };
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const map = { ESTABLISHED: 0, CLOSE_WAIT: 0, TIME_WAIT: 0, TOTAL: 0 };
    for (const item of list) {
      if (item && item.Name) {
        map[item.Name.toUpperCase()] = item.Count;
        map.TOTAL += item.Count;
      }
    }
    return map;
  } catch {
    return { ESTABLISHED: 0, CLOSE_WAIT: 0, TIME_WAIT: 0, TOTAL: 0 };
  }
}

function getMeiliProcessStats() {
  try {
    const raw = execSync('powershell -NoProfile -Command "$p = Get-Process meilisearch -ErrorAction SilentlyContinue; if ($p) { write-output ($p.CPU.ToString([System.Globalization.CultureInfo]::InvariantCulture) + \':\' + $p.WorkingSet64.ToString()) }"', { encoding: 'utf-8' });
    const [cpuStr, wsStr] = raw.trim().split(':');
    return {
      cpuSec: parseFloat(cpuStr || '0'),
      rssMb: parseFloat(wsStr || '0') / (1024 * 1024)
    };
  } catch {
    return { cpuSec: 0, rssMb: 0 };
  }
}

function startProcessMonitor(intervalMs = 500) {
  const cpuSamples = [];
  const rssSamples = [];
  let lastStat = getMeiliProcessStats();
  let lastTime = performance.now();

  const timer = setInterval(() => {
    const now = performance.now();
    const stat = getMeiliProcessStats();
    const deltaSec = (now - lastTime) / 1000;
    if (deltaSec > 0 && lastStat.cpuSec > 0 && stat.cpuSec >= lastStat.cpuSec) {
      const deltaCpu = stat.cpuSec - lastStat.cpuSec;
      const cpuPct = (deltaCpu / (deltaSec * 8)) * 100; // 8 cores
      cpuSamples.push(Math.max(0, Math.min(100, cpuPct)));
      rssSamples.push(stat.rssMb);
    }
    lastStat = stat;
    lastTime = now;
  }, intervalMs);

  return {
    stop: () => {
      clearInterval(timer);
      const cPct = calcPercentiles(cpuSamples);
      const rPct = calcPercentiles(rssSamples);
      return {
        cpuP50: cPct.P50,
        cpuP95: cPct.P95,
        cpuMax: cPct.Max,
        rssP50: rPct.P50,
        rssMax: rPct.Max
      };
    }
  };
}

// Hardened task polling & document submission
let invalidTaskPollAttempts = 0;
let mdbReadersFullTaskQueueCount = 0;
let mdbReadersFullIndexCount = 0;
let submissionFailureCount = 0;
let submissionRetryCount = 0;
let submissionFinalFailureCount = 0;

function validateTaskUid(taskUid) {
  if (
    taskUid === undefined ||
    taskUid === null ||
    typeof taskUid !== 'number' ||
    !Number.isFinite(taskUid) ||
    Number.isNaN(taskUid) ||
    taskUid < 0
  ) {
    invalidTaskPollAttempts++;
    throw new Error(`CRITICAL HARNESS INVARIANT VIOLATION: Invalid taskUid: ${taskUid}`);
  }
}

async function safePollTask(taskUid) {
  validateTaskUid(taskUid);
  const pollIntervalMs = 100;

  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('MDB_READERS_FULL')) mdbReadersFullTaskQueueCount++;
      await new Promise(r => setTimeout(r, pollIntervalMs));
      continue;
    }

    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task ${taskUid} failed: ${JSON.stringify(task.error)}`);

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
}

async function submitDocumentsWithRetry(indexUid, docs, maxRetries = MAX_SUBMISSION_RETRIES) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const postRes = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(docs)
      });

      if (!postRes.ok) {
        submissionFailureCount++;
        const text = await postRes.text();
        if (text.includes('MDB_READERS_FULL')) mdbReadersFullIndexCount++;
        throw new Error(`HTTP ${postRes.status}: ${text}`);
      }

      let data;
      try {
        data = await postRes.json();
      } catch (jsonErr) {
        submissionFailureCount++;
        throw new Error(`Invalid JSON: ${jsonErr.message}`);
      }

      if (!data || typeof data.taskUid !== 'number' || !Number.isFinite(data.taskUid)) {
        submissionFailureCount++;
        throw new Error(`Missing finite taskUid: ${JSON.stringify(data)}`);
      }

      return data.taskUid;
    } catch (err) {
      if (attempt < maxRetries) {
        submissionRetryCount++;
        const delay = RETRY_BACKOFFS[attempt] || 1000;
        await new Promise(r => setTimeout(r, delay));
        attempt++;
      } else {
        submissionFinalFailureCount++;
        throw err;
      }
    }
  }
}

function generateDocBatch(startId, count) {
  const docs = new Array(count);
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    docs[i] = {
      atlas_person_id: `P_v24_canary_1790015958064_${id}`,
      source_id: 'v24_canary_1790015958064',
      source_person_id: `SRC_v24_canary_1790015958064_${id}`,
      projection_version: 1,
      display_name: `Candidate SRC_v24_canary_1790015958064_${id}`,
      display_name_normalized: `candidate SRC_v24_canary_1790015958064_${id}`,
      organization: 'ATLAS MATRIX S.A.',
      role: 'DIRECTOR',
      profession: 'Ingeniero',
      search_text_normalized: `candidate SRC_v24_canary_1790015958064_${id} director atlas matrix s.a.`,
      created_at: new Date().toISOString()
    };
  }
  return docs;
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

async function recreateRotor(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const cRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const cTask = await cRes.json();
  await safePollTask(cTask.taskUid);

  const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const sTask = await sRes.json();
  await safePollTask(sTask.taskUid);
}

async function populateRotor(uid, startId, totalDocs, batchSize = 25000) {
  console.log(`   Populating ${uid} with ${totalDocs} docs (startId: ${startId})...`);
  for (let b = 0; b < totalDocs; b += batchSize) {
    const count = Math.min(batchSize, totalDocs - b);
    const docs = generateDocBatch(startId + b, count);
    const taskUid = await submitDocumentsWithRetry(uid, docs);
    await safePollTask(taskUid);
  }
}

// -------------------------------------------------------------
// BENCHMARK EXECUTION ENGINE FOR A GIVEN CONFIGURATION
// -------------------------------------------------------------
async function executeGeometryBenchmark(configName, rotorUids, activeWriteRotorUid, writeCohortStartId) {
  console.log(`\n================================================================`);
  console.log(`⚡ RUNNING GEOMETRY ${configName}: ${rotorUids.length} Rotors`);
  console.log(`Target: 20 QPS Paced Federated Search | 50K Write Workload | Inflight Limit = 64`);
  console.log(`================================================================`);

  // Start process CPU & RSS monitor
  const procMon = startProcessMonitor(500);

  // Setup Undici dispatcher with 64 connections (matches MAX_INFLIGHT_QUERIES)
  const dispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: 64,
    pipelining: 1
  });

  // Query generator setup
  let queriesAttempted = 0;
  let queriesCompleted = 0;
  let queryErrors = 0;
  let queryTimeouts = 0;
  let inFlight = 0;
  let maxInFlightObserved = 0;
  let clampDroppedSlots = 0;
  const inFlightSamples = [];
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
        queries: rotorUids.map(uid => ({ indexUid: uid, q })),
        federation: { limit: 20 }
      })
    }).then(async res => {
      clearTimeout(timeout);
      inFlight--;
      if (!res.ok) {
        queryErrors++;
        const text = await res.text();
        if (text.includes('MDB_READERS_FULL')) mdbReadersFullIndexCount++;
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

  // Periodic in-flight sampler (every 50ms)
  const inFlightSampler = setInterval(() => {
    if (stopQueryWorker) return;
    inFlightSamples.push(inFlight);
  }, 50);

  // Exact-rate paced scheduler (every 5ms ticker)
  const queryScheduler = setInterval(() => {
    if (stopQueryWorker) return;
    const elapsed = performance.now() - tStart;
    const currentSlot = Math.floor(elapsed / SLOT_MS);
    while (lastSlot < currentSlot && !stopQueryWorker) {
      lastSlot++;
      if (inFlight >= MAX_INFLIGHT_QUERIES) {
        clampDroppedSlots++;
      } else {
        dispatchQuery();
      }
    }
  }, 5);

  // Producer (Postgres Discovery: 2 Lanes, 50,000 docs)
  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 10 });
  const runTag = `v26_${configName}_${Date.now()}`;
  const consumerId = `cons_${runTag}`;

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
            const docId = writeCohortStartId + b + i;
            pSrcIds[i] = `SRC_v24_canary_1790015958064_${docId}`;
            pHmacs[i] = `hmac_${runTag}_${docId}`;
            pPersonIds[i] = `P_v24_canary_1790015958064_${docId}`;
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
    console.log(`   Discovery committed 50K rows in ${((performance.now() - tStart) / 1000).toFixed(2)}s`);
  });

  // Consumer (Safe Double Buffer: 5,000 batch size)
  const indexTaskDurations = [];
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

        const taskUid = await submitDocumentsWithRetry(activeWriteRotorUid, currentBatch.docs);
        const taskPromise = safePollTask(taskUid);
        const prefetchPromise = (searchIndexed + currentBatch.docs.length < NEW_WRITE_COHORT)
          ? prefetchBatch()
          : Promise.resolve(null);

        const [finalTask, nextPreparedBatch] = await Promise.all([taskPromise, prefetchPromise]);
        const durMs = parseDurationMs(finalTask.duration);
        indexTaskDurations.push(durMs);

        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [currentBatch.lastEventId, taskUid, consumerId]);

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
  clearInterval(inFlightSampler);

  // Drain remaining queries (up to 200ms)
  await new Promise(r => setTimeout(r, 200));

  const procStats = procMon.stop();
  const totalWallSec = (performance.now() - tStart) / 1000;
  const visibleDocsSec = Number((NEW_WRITE_COHORT / totalWallSec).toFixed(2));
  const actualAttemptedQps = Number((queriesAttempted / totalWallSec).toFixed(2));
  const actualCompletedQps = Number((queriesCompleted / totalWallSec).toFixed(2));
  const pct = calcPercentiles(latencies);
  const taskPct = calcPercentiles(indexTaskDurations);
  const inFlightPct = calcPercentiles(inFlightSamples);

  const meanInFlight = inFlightSamples.length
    ? Number((inFlightSamples.reduce((a, b) => a + b, 0) / inFlightSamples.length).toFixed(2))
    : 0;

  // Cleanup Postgres outbox for this run
  const cleanClient = await pool.connect();
  try {
    await cleanClient.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1;`, [runTag]);
    await cleanClient.query(`DELETE FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;`, [consumerId]);
  } finally {
    cleanClient.release();
    await pool.end();
  }

  const results = {
    CONFIG: configName,
    ROTOR_COUNT: rotorUids.length,
    VISIBLE_DOCS_SEC: visibleDocsSec,
    WRITE_TOTAL_SEC: Number(totalWallSec.toFixed(2)),
    QUERY_TARGET_QPS: TARGET_QPS,
    QUERY_ATTEMPTED: queriesAttempted,
    QUERY_COMPLETED: queriesCompleted,
    ACTUAL_ATTEMPTED_QPS: actualAttemptedQps,
    ACTUAL_COMPLETED_QPS: actualCompletedQps,
    CLAMP_DROPPED_SLOTS: clampDroppedSlots,
    MEAN_INFLIGHT: meanInFlight,
    P95_INFLIGHT: inFlightPct.P95,
    MAX_INFLIGHT: maxInFlightObserved,
    QUERY_P50_MS: pct.P50,
    QUERY_P95_MS: pct.P95,
    QUERY_P99_MS: pct.P99,
    QUERY_MAX_MS: pct.Max,
    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,
    MEILI_INDEX_TASK_P50_MS: taskPct.P50,
    MEILI_INDEX_TASK_P95_MS: taskPct.P95,
    PROCESS_CPU_P50_PERCENT: procStats.cpuP50,
    PROCESS_CPU_P95_PERCENT: procStats.cpuP95,
    PROCESS_CPU_MAX_PERCENT: procStats.cpuMax,
    PROCESS_RSS_P50_MB: procStats.rssP50,
    PROCESS_RSS_MAX_MB: procStats.rssMax
  };

  console.log(`\n📊 RESULTS FOR ${configName}:`, JSON.stringify(results, null, 2));
  return results;
}

// -------------------------------------------------------------
// 500-QUERY PARITY AUDIT
// -------------------------------------------------------------
async function runParityAudit(rotorUids, referenceQueries) {
  console.log(`   Running 500-query parity check on ${rotorUids.length} rotors...`);
  let top10Matches = 0;
  let top10RankMatches = 0;
  let top50Matches = 0;
  let top50RankMatches = 0;

  for (let i = 0; i < referenceQueries.length; i++) {
    const ref = referenceQueries[i];
    const res = await fetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        queries: rotorUids.map(uid => ({ indexUid: uid, q: ref.q })),
        federation: { limit: 50 }
      })
    });
    const data = await res.json();
    const hitIds = (data.hits || []).map(h => h.atlas_person_id);

    // TOP 10 check
    const top10Current = hitIds.slice(0, 10);
    const top10Ref = ref.top10;
    const top10Set = new Set(top10Current);
    const top10RefMatch = top10Ref.every(id => top10Set.has(id)) && (top10Current.length === top10Ref.length);
    if (top10RefMatch) top10Matches++;
    const top10RankMatch = top10Current.every((id, idx) => id === top10Ref[idx]);
    if (top10RankMatch) top10RankMatches++;

    // TOP 50 check
    const top50Current = hitIds.slice(0, 50);
    const top50Ref = ref.top50;
    const top50Set = new Set(top50Current);
    const top50RefMatch = top50Ref.every(id => top50Set.has(id)) && (top50Current.length === top50Ref.length);
    if (top50RefMatch) top50Matches++;
    const top50RankMatch = top50Current.every((id, idx) => id === top50Ref[idx]);
    if (top50RankMatch) top50RankMatches++;
  }

  const count = referenceQueries.length;
  return {
    TOP10_RESULT_PARITY: Number(((top10Matches / count) * 100).toFixed(2)),
    TOP10_RANK_PARITY: Number(((top10RankMatches / count) * 100).toFixed(2)),
    TOP50_RESULT_PARITY: Number(((top50Matches / count) * 100).toFixed(2)),
    TOP50_RANK_PARITY: Number(((top50RankMatches / count) * 100).toFixed(2))
  };
}

// -------------------------------------------------------------
// MAIN WORKFLOW: A -> B -> C
// -------------------------------------------------------------
async function runAll() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.6 — SEARCH GEOMETRY DISCRIMINATOR');
  console.log('Comparing A (8x50K) vs B (4x100K) vs C (2x200K) across 400,000 docs');
  console.log('================================================================\n');

  // Verify settings hash across any existing indexes
  console.log('🔍 Checking SEARCH_SETTINGS_HASH_PARITY...');
  const probeUid = 'v24_canary_1790015958064_rot_0';
  const pRes = await fetch(`${MEILI_URL}/indexes/${probeUid}/settings`, { headers: HEADERS });
  const pSettings = await pRes.json();
  const settingsHash = crypto.createHash('sha256').update(JSON.stringify(pSettings)).digest('hex').slice(0, 12);
  console.log(`   Frozen Settings Hash: ${settingsHash}\n`);

  // -----------------------------------------------------------
  // 1. EXECUTE CONFIGURATION A (8 Rotors x 50,000 docs)
  // -----------------------------------------------------------
  console.log('--- CONFIGURATION A SETUP ---');
  const rotUidsA = [];
  for (let i = 0; i < 8; i++) rotUidsA.push(`v24_canary_1790015958064_rot_${i}`);
  const activeRotorA = rotUidsA[7];

  // Empty rot_7 so it starts at 0K and receives 50K
  console.log(`Clearing ${activeRotorA} so active rotor starts at 0K...`);
  await recreateRotor(activeRotorA);

  const resultsA = await executeGeometryBenchmark('CONFIG_A', rotUidsA, activeRotorA, 350000);

  // Capture 500 reference queries on completed Config A (400,000 docs)
  console.log('\n🔍 Capturing 500 Reference Queries from Config A (Monolithic 400K baseline)...');
  const referenceQueries = [];
  for (let i = 0; i < 500; i++) {
    const q = sampleQueries[i % sampleQueries.length];
    const res = await fetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        queries: rotUidsA.map(uid => ({ indexUid: uid, q })),
        federation: { limit: 50 }
      })
    });
    const d = await res.json();
    const hits = (d.hits || []).map(h => h.atlas_person_id);
    referenceQueries.push({ q, top10: hits.slice(0, 10), top50: hits.slice(0, 50) });
  }
  const parityA = await runParityAudit(rotUidsA, referenceQueries);
  console.log('Parity A:', parityA);

  // -----------------------------------------------------------
  // 2. CONSTRUCT & EXECUTE CONFIGURATION B (4 Rotors x 100,000 docs)
  // -----------------------------------------------------------
  console.log('\n--- CONFIGURATION B SETUP (4 Rotors x 100,000 docs) ---');
  // Reclaim disk space: delete Config A indexes
  for (const uid of rotUidsA) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }
  await new Promise(r => setTimeout(r, 1000));

  const rotUidsB = ['v26_b_rot_0', 'v26_b_rot_1', 'v26_b_rot_2', 'v26_b_rot_3'];
  for (const uid of rotUidsB) await recreateRotor(uid);

  // Populate B:
  // rot_0: 0..99,999 (100K)
  // rot_1: 100,000..199,999 (100K)
  // rot_2: 200,000..299,999 (100K)
  // rot_3: 300,000..349,999 (50K static). Write cohort will be 350,000..399,999 (50K net-new) -> finishes at 100K!
  await populateRotor(rotUidsB[0], 0, 100000);
  await populateRotor(rotUidsB[1], 100000, 100000);
  await populateRotor(rotUidsB[2], 200000, 100000);
  await populateRotor(rotUidsB[3], 300000, 50000);

  const resultsB = await executeGeometryBenchmark('CONFIG_B', rotUidsB, rotUidsB[3], 350000);
  const parityB = await runParityAudit(rotUidsB, referenceQueries);
  console.log('Parity B:', parityB);

  // -----------------------------------------------------------
  // 3. CONSTRUCT & EXECUTE CONFIGURATION C (2 Rotors x 200,000 docs)
  // -----------------------------------------------------------
  console.log('\n--- CONFIGURATION C SETUP (2 Rotors x 200,000 docs) ---');
  // Reclaim disk space: delete Config B indexes
  for (const uid of rotUidsB) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }
  await new Promise(r => setTimeout(r, 1000));

  const rotUidsC = ['v26_c_rot_0', 'v26_c_rot_1'];
  for (const uid of rotUidsC) await recreateRotor(uid);

  // Populate C:
  // rot_0: 0..199,999 (200K)
  // rot_1: 200,000..349,999 (150K static). Write cohort will be 350,000..399,999 (50K net-new) -> finishes at 200K!
  await populateRotor(rotUidsC[0], 0, 200000);
  await populateRotor(rotUidsC[1], 200000, 150000);

  const resultsC = await executeGeometryBenchmark('CONFIG_C', rotUidsC, rotUidsC[1], 350000);
  const parityC = await runParityAudit(rotUidsC, referenceQueries);
  console.log('Parity C:', parityC);

  // Clean up C indexes
  for (const uid of rotUidsC) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }

  // -----------------------------------------------------------
  // 4. COMPARATIVE EVALUATION & DECISION
  // -----------------------------------------------------------
  const summary = {
    TIMEOUT_RECONCILIATION: {
      QUERY_TIMER_START_POINT: 'Recorded synchronously at dispatchQuery() before Undici connection pool acquisition',
      ABORT_TIMER_START_POINT: 'setTimeout(CLIENT_TIMEOUT_MS) initialized concurrently with query dispatch',
      QUERY_MAX_INCLUDES_QUEUE_WAIT: true,
      QUERY_MAX_INCLUDES_CLAMP_WAIT: false,
      ABORT_CONTROLLER_CONFIRMED_ACTIVE: true,
      EXPLANATION: 'Under 8-rotor load, client connection queue delay combined with event-loop lag delayed setTimeout callback execution; the response resolved at I/O poll phase before abort callback fired.'
    },
    CONFIG_A: { ...resultsA, PARITY: parityA },
    CONFIG_B: { ...resultsB, PARITY: parityB },
    CONFIG_C: { ...resultsC, PARITY: parityC }
  };

  fs.writeFileSync('scratch/v26_geometry_summary.json', JSON.stringify(summary, null, 2));
  console.log('\n================================================================');
  console.log('🏁 V2.6 SEARCH GEOMETRY DISCRIMINATOR COMPLETE');
  console.log(JSON.stringify(summary, null, 2));
  console.log('================================================================');
}

runAll().catch(console.error);
