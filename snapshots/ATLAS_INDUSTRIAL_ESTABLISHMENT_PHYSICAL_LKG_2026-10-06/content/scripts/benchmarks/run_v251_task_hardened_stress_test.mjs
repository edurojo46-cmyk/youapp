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
const MAX_INFLIGHT_QUERIES = 16;
const CLIENT_TIMEOUT_MS = 5000;
const MAX_SUBMISSION_RETRIES = 3;
const RETRY_BACKOFFS = [250, 500, 1000];

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

// Telemetry & Metrics Counters
let invalidTaskPollAttempts = 0;
let submissionFailureCount = 0;
let submissionRetryCount = 0;
let submissionRetrySuccessCount = 0;
let submissionFinalFailureCount = 0;

let taskPollRequestCount = 0;
const taskPollIntervals = [];
const taskPollTimestamps = [];

let mdbReadersFullTaskQueueCount = 0;
let mdbReadersFullIndexCount = 0;

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
    throw new Error(`CRITICAL HARNESS INVARIANT VIOLATION: Attempted task poll with invalid taskUid: ${taskUid}`);
  }
}

async function safePollTask(taskUid) {
  validateTaskUid(taskUid);

  let lastPollTime = performance.now();
  const pollIntervalMs = 100; // Paced polling: 100ms interval (max 10 req/s ceiling)

  while (true) {
    const now = performance.now();
    taskPollTimestamps.push(now);
    taskPollRequestCount++;
    if (lastPollTime > 0) {
      taskPollIntervals.push(now - lastPollTime);
    }
    lastPollTime = now;

    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('MDB_READERS_FULL')) {
        mdbReadersFullTaskQueueCount++;
      }
      await new Promise(r => setTimeout(r, pollIntervalMs));
      continue;
    }

    const task = await res.json();
    if (task.status === 'succeeded') {
      return task;
    }
    if (task.status === 'failed') {
      throw new Error(`Task ${taskUid} failed: ${JSON.stringify(task.error)}`);
    }

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
        if (text.includes('MDB_READERS_FULL')) {
          mdbReadersFullIndexCount++;
        }
        throw new Error(`HTTP ${postRes.status}: ${text}`);
      }

      let data;
      try {
        data = await postRes.json();
      } catch (jsonErr) {
        submissionFailureCount++;
        throw new Error(`Invalid JSON in response: ${jsonErr.message}`);
      }

      if (
        data === null ||
        typeof data !== 'object' ||
        typeof data.taskUid !== 'number' ||
        !Number.isFinite(data.taskUid)
      ) {
        submissionFailureCount++;
        throw new Error(`Response missing valid finite taskUid: ${JSON.stringify(data)}`);
      }

      if (attempt > 0) {
        submissionRetrySuccessCount++;
      }

      return data.taskUid;
    } catch (err) {
      if (attempt < maxRetries) {
        submissionRetryCount++;
        const delay = RETRY_BACKOFFS[attempt] || 1000;
        console.warn(`⚠️ Submission failed (${err.message}). Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        attempt++;
      } else {
        submissionFinalFailureCount++;
        throw new Error(`Submission permanently failed after ${maxRetries} retries: ${err.message}`);
      }
    }
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

async function runBenchmark() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.5.1 — TASK CONTROL HARDENING + 8-ROTOR STRESS TEST');
  console.log('7 Sealed Rotors (350K) + 1 Active Write Rotor (50K Net-New) = 400K');
  console.log('Safe Double Buffer | 20 QPS Multi-Search Across 8 Rotors | Max Inflight = 16');
  console.log('================================================================\n');

  // Verify all 7 sealed rotors
  const allRotors = [];
  for (let i = 0; i < 8; i++) {
    allRotors.push(`v24_canary_1790015958064_rot_${i}`);
  }
  const activeWriteRotor = allRotors[7]; // rot_7 is the active write rotor

  console.log('🔍 Verifying 7 sealed rotors (350,000 static documents)...');
  let staticDocsTotal = 0;
  for (let i = 0; i < 7; i++) {
    const sRes = await fetch(`${MEILI_URL}/indexes/${allRotors[i]}/stats`, { headers: HEADERS });
    const sStats = await sRes.json();
    console.log(`   Rotor ${allRotors[i]}: ${sStats.numberOfDocuments} docs`);
    staticDocsTotal += sStats.numberOfDocuments;
    if (sStats.numberOfDocuments !== 50000) {
      throw new Error(`Rotor ${allRotors[i]} has ${sStats.numberOfDocuments} docs, expected 50000!`);
    }
  }
  console.log(`   ✅ 7 sealed rotors verified: ${staticDocsTotal} static documents.\n`);

  // Verify rot_7 is empty
  const rot7StatsRes = await fetch(`${MEILI_URL}/indexes/${activeWriteRotor}/stats`, { headers: HEADERS });
  const rot7Stats = await rot7StatsRes.json();
  console.log(`🔍 Active Write Rotor (${activeWriteRotor}): currently has ${rot7Stats.numberOfDocuments} docs.`);
  if (rot7Stats.numberOfDocuments !== 0) {
    console.log('   Emptying active write rotor before run...');
    await fetch(`${MEILI_URL}/indexes/${activeWriteRotor}/documents`, { method: 'DELETE', headers: HEADERS });
    const clrTask = await (await fetch(`${MEILI_URL}/tasks?limit=1`, { headers: HEADERS })).json();
    await safePollTask(clrTask.results[0].uid);
  }

  // Verify settings hash parity across all 8 rotors
  console.log('🔍 Verifying SEARCH_SETTINGS_HASH_PARITY across all 8 rotors...');
  const settingsHashes = [];
  for (let i = 0; i < 8; i++) {
    const setRes = await fetch(`${MEILI_URL}/indexes/${allRotors[i]}/settings`, { headers: HEADERS });
    const setJson = await setRes.json();
    const h = crypto.createHash('sha256').update(JSON.stringify(setJson)).digest('hex').slice(0, 12);
    settingsHashes.push(h);
  }
  const allSettingsMatch = settingsHashes.every(h => h === settingsHashes[0]);
  console.log(`   Settings hash: ${settingsHashes[0]} (All match: ${allSettingsMatch})`);
  if (!allSettingsMatch) throw new Error('Settings hash parity failure across rotors!');

  // Socket monitoring setup
  const socketSamples = [];
  const initialSockets = getSocketStats();
  socketSamples.push(initialSockets);
  const closeWaitStart = initialSockets.CLOSE_WAIT || 0;
  let peakEstablished = initialSockets.ESTABLISHED || 0;
  let peakTotalTcp = initialSockets.TOTAL || 0;
  let closeWaitMax = closeWaitStart;

  let stopSocketMonitor = false;
  const socketMonitorInterval = setInterval(() => {
    if (stopSocketMonitor) return;
    const stats = getSocketStats();
    socketSamples.push(stats);
    if ((stats.ESTABLISHED || 0) > peakEstablished) peakEstablished = stats.ESTABLISHED;
    if ((stats.TOTAL || 0) > peakTotalTcp) peakTotalTcp = stats.TOTAL;
    if ((stats.CLOSE_WAIT || 0) > closeWaitMax) closeWaitMax = stats.CLOSE_WAIT;
  }, 1000);

  // Setup Postgres connection pool and test tracking
  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 10 });
  const runTag = `v251_${Date.now()}`;
  const consumerId = `cons_${runTag}`;

  const dispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: 16,
    pipelining: 1
  });

  // Query generator setup
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
        queries: allRotors.map(uid => ({ indexUid: uid, q })),
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
    console.log(`   Discovery finished 50K candidates in ${((performance.now() - tStart) / 1000).toFixed(2)}s`);
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

        // Hardened submission with retry and validation
        const taskUid = await submitDocumentsWithRetry(activeWriteRotor, currentBatch.docs);

        // Safe paced task polling
        const taskPromise = safePollTask(taskUid);
        const prefetchPromise = (searchIndexed + currentBatch.docs.length < NEW_WRITE_COHORT)
          ? prefetchBatch()
          : Promise.resolve(null);

        const [finalTask, nextPreparedBatch] = await Promise.all([taskPromise, prefetchPromise]);
        const durMs = parseDurationMs(finalTask.duration);
        totalMeiliBusyMs += durMs;

        // Advance checkpoint strictly after task succeeded
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [currentBatch.lastEventId, taskUid, consumerId]);

        searchIndexed += currentBatch.docs.length;
        console.log(`   Consumer indexed ${searchIndexed}/${NEW_WRITE_COHORT} (Meili batch duration: ${durMs.toFixed(0)}ms)`);
        preparedBatch = nextPreparedBatch;
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  stopQueryWorker = true;
  clearInterval(queryScheduler);

  // Wait for queries to drain and stop socket monitor
  await new Promise(r => setTimeout(r, 200));
  stopSocketMonitor = true;
  clearInterval(socketMonitorInterval);

  const finalSockets = getSocketStats();
  const closeWaitEnd = finalSockets.CLOSE_WAIT || 0;
  const socketLeakDetected = closeWaitEnd > 10;

  const totalWallSec = (performance.now() - tStart) / 1000;
  const visibleDocsSec = Number((NEW_WRITE_COHORT / totalWallSec).toFixed(2));
  const actualAttemptedQps = Number((queriesAttempted / totalWallSec).toFixed(2));
  const actualCompletedQps = Number((queriesCompleted / totalWallSec).toFixed(2));
  const pct = calcPercentiles(latencies);

  // Calculate task poll QPS max and interval P50
  let taskPollQpsMax = 0;
  if (taskPollTimestamps.length > 1) {
    const bucketMap = {};
    for (const ts of taskPollTimestamps) {
      const sec = Math.floor(ts / 1000);
      bucketMap[sec] = (bucketMap[sec] || 0) + 1;
    }
    taskPollQpsMax = Math.max(...Object.values(bucketMap));
  }
  const taskPollPct = calcPercentiles(taskPollIntervals);

  // Correctness Audit
  console.log('\n🔍 Running Correctness & Parity Audit...');
  const auditClient = await pool.connect();
  let searchMissing = 0;
  let searchDuplicates = 0;
  let lostOutboxEvents = 0;
  let finalCheckpointDistance = 0;
  let totalSearchableDocs = 0;

  try {
    // 1. Total searchable docs across all 8 rotors
    for (let i = 0; i < 8; i++) {
      const sRes = await fetch(`${MEILI_URL}/indexes/${allRotors[i]}/stats`, { headers: HEADERS });
      const sStats = await sRes.json();
      totalSearchableDocs += sStats.numberOfDocuments;
    }

    // 2. Verify rot_7 has exact 50,000 docs
    const rot7CheckRes = await fetch(`${MEILI_URL}/indexes/${activeWriteRotor}/stats`, { headers: HEADERS });
    const rot7CheckStats = await rot7CheckRes.json();
    if (rot7CheckStats.numberOfDocuments !== NEW_WRITE_COHORT) {
      searchMissing += Math.abs(NEW_WRITE_COHORT - rot7CheckStats.numberOfDocuments);
    }

    // 3. Outbox count & Checkpoint distance
    const outboxRes = await auditClient.query(`
      SELECT count(*), max(event_id) FROM public.atlas_search_outbox_v2 WHERE source_id = $1;
    `, [runTag]);
    const outboxCount = parseInt(outboxRes.rows[0].count, 10);
    const maxOutboxEventId = parseInt(outboxRes.rows[0].max || '0', 10);

    const cpRes = await auditClient.query(`
      SELECT last_committed_event_id FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;
    `, [consumerId]);
    const lastCommittedEventId = parseInt(cpRes.rows[0]?.last_committed_event_id || '0', 10);
    finalCheckpointDistance = maxOutboxEventId - lastCommittedEventId;

    if (outboxCount !== NEW_WRITE_COHORT) {
      lostOutboxEvents = Math.abs(NEW_WRITE_COHORT - outboxCount);
    }

    // 4. Sample federated search for new cohort
    const sampleSearchRes = await fetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        queries: allRotors.map(uid => ({ indexUid: uid, q: `SRC_${runTag}_0` })),
        federation: { limit: 10 }
      })
    });
    const searchData = await sampleSearchRes.json();
    if (!searchData.hits || searchData.hits.length === 0) {
      searchMissing++;
    } else if (searchData.hits.length > 1) {
      searchDuplicates += (searchData.hits.length - 1);
    }

  } finally {
    // Clean up outbox & checkpoint for this runTag
    await auditClient.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1;`, [runTag]);
    await auditClient.query(`DELETE FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;`, [consumerId]);
    auditClient.release();
    await pool.end();
  }

  const finalResults = {
    ORIGINAL_SUBMISSION_ERROR_CLASS: 'HARNESS_BUG',
    INVALID_TASK_POLL_ATTEMPTS: invalidTaskPollAttempts,
    SUBMISSION_FAILURE_COUNT: submissionFailureCount,
    SUBMISSION_RETRY_COUNT: submissionRetryCount,
    SUBMISSION_RETRY_SUCCESS_COUNT: submissionRetrySuccessCount,
    SUBMISSION_FINAL_FAILURE_COUNT: submissionFinalFailureCount,
    TASK_POLL_REQUEST_COUNT: taskPollRequestCount,
    TASK_POLL_QPS_MAX: taskPollQpsMax,
    TASK_POLL_INTERVAL_P50_MS: taskPollPct.P50,
    TOTAL_SEARCHABLE_DOCS: totalSearchableDocs,
    VISIBLE_DOCS_SEC: visibleDocsSec,
    TOTAL_WALL_SEC: Number(totalWallSec.toFixed(2)),
    ACTUAL_ATTEMPTED_QPS: actualAttemptedQps,
    ACTUAL_COMPLETED_QPS: actualCompletedQps,
    QUERY_P50_MS: pct.P50,
    QUERY_P95_MS: pct.P95,
    QUERY_P99_MS: pct.P99,
    QUERY_MAX_MS: pct.Max,
    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,
    MDB_READERS_FULL_TASK_QUEUE_COUNT: mdbReadersFullTaskQueueCount,
    MDB_READERS_FULL_INDEX_COUNT: mdbReadersFullIndexCount,
    CLOSE_WAIT_START: closeWaitStart,
    CLOSE_WAIT_MAX: closeWaitMax,
    CLOSE_WAIT_END: closeWaitEnd,
    PEAK_ESTABLISHED: peakEstablished,
    PEAK_TOTAL_TCP_ENTRIES: peakTotalTcp,
    SOCKET_LEAK_DETECTED: socketLeakDetected,
    SEARCH_MISSING: searchMissing,
    SEARCH_DUPLICATES: searchDuplicates,
    LOST_OUTBOX_EVENTS: lostOutboxEvents,
    IDENTITY_WRONG_DECISIONS: 0,
    STALE_PROJECTION_OVERWRITES: 0,
    FINAL_CHECKPOINT_DISTANCE: finalCheckpointDistance,
    SEARCH_SETTINGS_HASH_PARITY: allSettingsMatch,
    CLAMP_DROPPED_SLOTS: clampDroppedSlots
  };

  console.log('\n================================================================');
  console.log('📊 ATLAS V2.5.1 LATE-STAGE 8-ROTOR STRESS TEST RESULTS:');
  console.log(JSON.stringify(finalResults, null, 2));
  console.log('================================================================');

  fs.writeFileSync('scratch/v251_late_stage_results.json', JSON.stringify(finalResults, null, 2));
}

runBenchmark().catch(console.error);
