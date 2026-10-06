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
const MAX_INFLIGHT_HARD = 64; // Emergency safety ceiling
const CLIENT_SERVICE_TIMEOUT_MS = 5000;
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

// -------------------------------------------------------------
// LMDB BINARY READER TABLE PARSER
// -------------------------------------------------------------
export function parseLockFile(path) {
  try {
    if (!fs.existsSync(path)) return { path, error: 'not_found', maxReaders: 0, activeReaders: 0 };
    const buf = fs.readFileSync(path);
    const headerSize = 64;
    const slotSize = 64;
    const totalSlots = Math.floor((buf.length - headerSize) / slotSize);

    let activeSlots = 0;
    for (let s = 0; s < totalSlots; s++) {
      const offset = headerSize + s * slotSize;
      const txnid = buf.readBigUInt64LE(offset);
      const pid = buf.readUInt32LE(offset + 8);
      if (pid !== 0 && txnid > 0n) activeSlots++;
    }

    return { path, fileSize: buf.length, maxReaders: totalSlots, activeReaders: activeSlots };
  } catch (err) {
    return { path, error: err.message, maxReaders: 0, activeReaders: 0 };
  }
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

// -------------------------------------------------------------
// ATLAS STABILITY GOVERNOR (BENCHMARK_MODE)
// -------------------------------------------------------------
class BenchmarkStabilityGovernor {
  constructor(onTriggerAbort) {
    this.mode = 'BENCHMARK_MODE';
    this.state = 'GREEN';
    this.transitions = [];
    this.onTriggerAbort = onTriggerAbort;
    this.failed = false;
  }

  evaluate(metrics) {
    if (this.failed) return;

    // Hard failure boundaries under BENCHMARK_MODE
    if (metrics.inFlight >= MAX_INFLIGHT_HARD) {
      this.failed = true;
      this.state = 'RED';
      this.onTriggerAbort(`MAX_INFLIGHT_HARD reached (${metrics.inFlight} >= ${MAX_INFLIGHT_HARD})`);
    } else if (metrics.serviceP95 > 4000) {
      this.failed = true;
      this.state = 'RED';
      this.onTriggerAbort(`Service latency P95 exceeded 4000ms (${metrics.serviceP95}ms)`);
    } else if (metrics.closeWait > 25) {
      this.failed = true;
      this.state = 'RED';
      this.onTriggerAbort(`Socket CloseWait threshold breached (${metrics.closeWait} > 25)`);
    } else if (metrics.inFlight > 16 || metrics.serviceP95 > 1000) {
      if (this.state !== 'YELLOW') {
        this.transitions.push({ from: this.state, to: 'YELLOW', reason: 'Elevated latency/concurrency', ts: performance.now() });
        this.state = 'YELLOW';
      }
    } else {
      if (this.state !== 'GREEN') {
        this.transitions.push({ from: this.state, to: 'GREEN', reason: 'Metrics within safe bounds', ts: performance.now() });
        this.state = 'GREEN';
      }
    }
  }
}

// -------------------------------------------------------------
// GEOMETRY PHASE EXECUTION (ISOLATED RUN CONTEXT)
// -------------------------------------------------------------
async function executePhase(configName, rotorUids, activeWriteRotorUid, writeCohortStartId, rotorLockPaths) {
  console.log(`\n================================================================`);
  console.log(`⚡ PHASE START: ${configName} (${rotorUids.length} Rotors)`);
  console.log(`Active Writer: ${activeWriteRotorUid} | Write Range: ${writeCohortStartId}..${writeCohortStartId + NEW_WRITE_COHORT - 1}`);
  console.log(`================================================================`);

  // Root Abort Controller for Phase Isolation
  const phaseAbortController = new AbortController();
  const phaseSignal = phaseAbortController.signal;

  let phaseStatus = 'RUNNING';
  let abortReason = null;
  let fatalEventToAbortMs = 0;

  function triggerPhaseAbort(reason, isSafety = true) {
    if (phaseSignal.aborted) return;
    const t0 = performance.now();
    abortReason = reason;
    phaseStatus = isSafety ? 'SAFETY_ABORT' : 'PERFORMANCE_FAIL';
    console.error(`🛑 ${configName} ABORT: ${reason}`);
    phaseAbortController.abort(reason);
    fatalEventToAbortMs = Number((performance.now() - t0).toFixed(2));
  }

  const governor = new BenchmarkStabilityGovernor((reason) => triggerPhaseAbort(reason, true));

  // Inflight Accounting Invariant
  let inFlight = 0;
  let inFlightIncrementCount = 0;
  let inFlightDecrementCount = 0;
  let maxInFlightObserved = 0;
  const inFlightSamples = [];

  // Query Accounting Metrics
  let querySeq = 0;
  let offeredQueries = 0;
  let admittedQueries = 0;
  let completedQueries = 0;
  let shedQueries = 0;
  let queryErrors = 0;
  let queryTimeouts = 0;

  const admissionWaitList = [];
  const serviceLatencyList = [];
  const totalLatencyList = [];

  // Sockets & Process Samplers
  const socketSamples = [];
  const initialSockets = getSocketStats();
  const closeWaitStart = initialSockets.CLOSE_WAIT || 0;
  let closeWaitMax = closeWaitStart;
  let establishedMax = initialSockets.ESTABLISHED || 0;
  let timeWaitMax = initialSockets.TIME_WAIT || 0;

  const cpuSamples = [];
  const rssSamples = [];
  let lastStat = getMeiliProcessStats();
  let lastStatTime = performance.now();

  // Reader Table Samples (Per Environment)
  const taskLockPath = 'C:/Users/Eduardo/YOUAPP/data_discovery_delta.ms/tasks/lock.mdb';
  const taskReaderSamples = [];
  const rotorReaderSamples = rotorUids.map(() => []);

  // Periodic Monitor (100ms interval, owned by phaseSignal)
  const monitorTimer = setInterval(() => {
    if (phaseSignal.aborted) return;

    inFlightSamples.push(inFlight);

    // Socket stats
    const s = getSocketStats();
    socketSamples.push(s);
    if ((s.CLOSE_WAIT || 0) > closeWaitMax) closeWaitMax = s.CLOSE_WAIT;
    if ((s.ESTABLISHED || 0) > establishedMax) establishedMax = s.ESTABLISHED;
    if ((s.TIME_WAIT || 0) > timeWaitMax) timeWaitMax = s.TIME_WAIT;

    // Process stats
    const now = performance.now();
    const stat = getMeiliProcessStats();
    const deltaSec = (now - lastStatTime) / 1000;
    if (deltaSec > 0 && lastStat.cpuSec > 0 && stat.cpuSec >= lastStat.cpuSec) {
      const cpuPct = ((stat.cpuSec - lastStat.cpuSec) / (deltaSec * 8)) * 100;
      cpuSamples.push(Math.max(0, Math.min(100, cpuPct)));
      rssSamples.push(stat.rssMb);
    }
    lastStat = stat;
    lastStatTime = now;

    // Reader table sampling
    const tLock = parseLockFile(taskLockPath);
    taskReaderSamples.push(tLock.activeReaders);

    for (let r = 0; r < rotorUids.length; r++) {
      const lockP = rotorLockPaths[r];
      if (lockP) {
        const iLock = parseLockFile(lockP);
        rotorReaderSamples[r].push(iLock.activeReaders);
      }
    }

    // Governor evaluation
    const recentServiceP95 = serviceLatencyList.length ? calcPercentiles(serviceLatencyList.slice(-20)).P95 : 0;
    governor.evaluate({ inFlight, closeWait: s.CLOSE_WAIT || 0, serviceP95: recentServiceP95 });
  }, 100);

  // Undici Dispatcher (connections = 64)
  const dispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: MAX_INFLIGHT_HARD,
    pipelining: 1
  });

  const tPhaseStart = performance.now();
  const SLOT_MS = 1000 / TARGET_QPS;
  let lastSlot = 0;

  async function executeSingleQuery(queryId, tScheduled) {
    const tAdmitted = performance.now();
    admissionWaitList.push(tAdmitted - tScheduled);

    inFlight++;
    inFlightIncrementCount++;
    if (inFlight > maxInFlightObserved) maxInFlightObserved = inFlight;

    const tFetchStart = performance.now();
    const queryController = new AbortController();

    const onPhaseAbort = () => queryController.abort('Phase Aborted');
    phaseSignal.addEventListener('abort', onPhaseAbort, { once: true });

    // Client service timeout SLA strictly applied to service duration
    const timeout = setTimeout(() => {
      queryController.abort('CLIENT_SERVICE_TIMEOUT_EXCEEDED');
    }, CLIENT_SERVICE_TIMEOUT_MS);

    const q = sampleQueries[querySeq % sampleQueries.length];

    try {
      const res = await undiciFetch(`${MEILI_URL}/multi-search`, {
        method: 'POST',
        headers: HEADERS,
        signal: queryController.signal,
        dispatcher,
        body: JSON.stringify({
          queries: rotorUids.map(uid => ({ indexUid: uid, q })),
          federation: { limit: 20 }
        })
      });

      const text = await res.text();
      const tCompleted = performance.now();

      clearTimeout(timeout);
      phaseSignal.removeEventListener('abort', onPhaseAbort);

      if (!res.ok) {
        queryErrors++;
        if (text.includes('MDB_READERS_FULL')) {
          triggerPhaseAbort(`MDB_READERS_FULL from Meilisearch: ${text}`, true);
        }
      } else {
        completedQueries++;
        serviceLatencyList.push(tCompleted - tFetchStart);
        totalLatencyList.push(tCompleted - tScheduled);
      }
    } catch (err) {
      clearTimeout(timeout);
      phaseSignal.removeEventListener('abort', onPhaseAbort);

      const tAborted = performance.now();
      serviceLatencyList.push(tAborted - tFetchStart);
      totalLatencyList.push(tAborted - tScheduled);

      if (err.name === 'AbortError' || err.message === 'CLIENT_SERVICE_TIMEOUT_EXCEEDED') {
        if (err.message === 'CLIENT_SERVICE_TIMEOUT_EXCEEDED' || (tAborted - tFetchStart >= CLIENT_SERVICE_TIMEOUT_MS)) {
          queryTimeouts++;
        }
      } else {
        queryErrors++;
      }
    } finally {
      inFlight--;
      inFlightDecrementCount++;
    }
  }

  // Paced Arrival Scheduler
  const scheduler = setInterval(() => {
    if (phaseSignal.aborted) return;
    const elapsed = performance.now() - tPhaseStart;
    const currentSlot = Math.floor(elapsed / SLOT_MS);

    while (lastSlot < currentSlot && !phaseSignal.aborted) {
      lastSlot++;
      offeredQueries++;
      const tScheduled = performance.now();

      if (inFlight >= MAX_INFLIGHT_HARD) {
        shedQueries++;
        governor.evaluate({ inFlight, closeWait: closeWaitMax, serviceP95: 5000 });
      } else {
        admittedQueries++;
        const qId = ++querySeq;
        executeSingleQuery(qId, tScheduled);
      }
    }
  }, 5);

  // Producer (Postgres Discovery: 2 Lanes, 50,000 docs)
  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 10 });
  const runTag = `v262_${configName}_${Date.now()}`;
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
          if (phaseSignal.aborted) break;
          while (totalCommitted - searchIndexed >= BACKPRESSURE_TRIGGER && !phaseSignal.aborted) {
            await new Promise(r => setTimeout(r, 20));
          }
          if (phaseSignal.aborted) break;

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
  });

  // Consumer (Safe Double Buffer)
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
      while (rows.length < SUBMISSION_BATCH_SIZE && (!discoveryDone || (searchIndexed + rows.length < NEW_WRITE_COHORT)) && !phaseSignal.aborted) {
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
      if (rows.length === 0 || phaseSignal.aborted) return null;
      return { docs: projectDocs(rows), lastEventId: lastFetchedEventId };
    }

    try {
      let preparedBatch = await prefetchBatch();
      while (preparedBatch && searchIndexed < NEW_WRITE_COHORT && !phaseSignal.aborted) {
        const currentBatch = preparedBatch;

        // Hardened document submission with bounded retry
        let taskUid = null;
        for (let attempt = 0; attempt <= MAX_SUBMISSION_RETRIES; attempt++) {
          if (phaseSignal.aborted) break;
          try {
            const postRes = await fetch(`${MEILI_URL}/indexes/${activeWriteRotorUid}/documents`, {
              method: 'POST',
              headers: HEADERS,
              body: JSON.stringify(currentBatch.docs)
            });
            if (!postRes.ok) {
              const errTxt = await postRes.text();
              throw new Error(`HTTP ${postRes.status}: ${errTxt}`);
            }
            const postData = await postRes.json();
            if (typeof postData?.taskUid !== 'number' || !Number.isFinite(postData.taskUid)) {
              throw new Error(`Invalid taskUid in response: ${JSON.stringify(postData)}`);
            }
            taskUid = postData.taskUid;
            break;
          } catch (postErr) {
            if (attempt < MAX_SUBMISSION_RETRIES) {
              await new Promise(r => setTimeout(r, RETRY_BACKOFFS[attempt] || 1000));
            } else {
              triggerPhaseAbort(`Document submission failed after retries: ${postErr.message}`, true);
              break;
            }
          }
        }

        if (phaseSignal.aborted || !taskUid) break;

        // Paced safe task polling
        const taskPromise = (async () => {
          while (!phaseSignal.aborted) {
            const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
            if (!res.ok) {
              const txt = await res.text();
              if (txt.includes('MDB_READERS_FULL')) {
                triggerPhaseAbort(`MDB_READERS_FULL during task polling: ${txt}`, true);
                break;
              }
              await new Promise(r => setTimeout(r, 100));
              continue;
            }
            const tJson = await res.json();
            if (tJson.status === 'succeeded') return tJson;
            if (tJson.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(tJson.error)}`);
            await new Promise(r => setTimeout(r, 100));
          }
          return null;
        })();

        const prefetchPromise = (searchIndexed + currentBatch.docs.length < NEW_WRITE_COHORT)
          ? prefetchBatch()
          : Promise.resolve(null);

        const [finalTask, nextBatch] = await Promise.all([taskPromise, prefetchPromise]);
        if (phaseSignal.aborted || !finalTask) break;

        const durMs = parseDurationMs(finalTask.duration);
        indexTaskDurations.push(durMs);

        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [currentBatch.lastEventId, taskUid, consumerId]);

        searchIndexed += currentBatch.docs.length;
        preparedBatch = nextBatch;
      }
    } finally {
      client.release();
    }
  })();

  // Await completion or phase abort
  await Promise.race([
    Promise.all([producerPromise, consumerPromise]),
    new Promise(r => phaseSignal.addEventListener('abort', r, { once: true }))
  ]);

  clearInterval(scheduler);

  // Bounded drain window (up to 2000 ms)
  const tDrainStart = performance.now();
  while (inFlight > 0 && performance.now() - tDrainStart < 2000) {
    await new Promise(r => setTimeout(r, 50));
  }

  // Ensure root abort is triggered so all background loops stop
  if (!phaseSignal.aborted) {
    triggerPhaseAbort('Phase completed normally', false);
    phaseStatus = 'COMPLETED';
  }
  clearInterval(monitorTimer);

  // Clean socket drain wait (1000 ms)
  await new Promise(r => setTimeout(r, 1000));
  const postDrainSockets = getSocketStats();
  const closeWaitAfterDrain = postDrainSockets.CLOSE_WAIT || 0;

  // Clean Postgres outbox for this run
  const cleanClient = await pool.connect();
  try {
    await cleanClient.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1;`, [runTag]);
    await cleanClient.query(`DELETE FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;`, [consumerId]);
  } finally {
    cleanClient.release();
    await pool.end();
  }

  const phaseWallSec = (performance.now() - tPhaseStart) / 1000;
  const visibleDocsSec = Number((searchIndexed / phaseWallSec).toFixed(2));
  const admittedQps = Number((admittedQueries / phaseWallSec).toFixed(2));
  const completedQps = Number((completedQueries / phaseWallSec).toFixed(2));
  const offeredQps = Number((offeredQueries / phaseWallSec).toFixed(2));
  const shedQps = Number((shedQueries / phaseWallSec).toFixed(2));

  const servicePct = calcPercentiles(serviceLatencyList);
  const totalPct = calcPercentiles(totalLatencyList);
  const admWaitPct = calcPercentiles(admissionWaitList);
  const inFlightPct = calcPercentiles(inFlightSamples);
  const cpuPct = calcPercentiles(cpuSamples);
  const rssPct = calcPercentiles(rssSamples);
  const taskPct = calcPercentiles(indexTaskDurations);

  const meanInFlight = inFlightSamples.length
    ? Number((inFlightSamples.reduce((a, b) => a + b, 0) / inFlightSamples.length).toFixed(2))
    : 0;

  // Reader metrics
  const taskLockPostDrain = parseLockFile(taskLockPath);
  const taskReaderPct = calcPercentiles(taskReaderSamples);

  const rotorReaderMetrics = rotorUids.map((uid, idx) => {
    const sArr = rotorReaderSamples[idx] || [];
    const rPct = calcPercentiles(sArr);
    const postDrain = parseLockFile(rotorLockPaths[idx]);
    return {
      rotorUid: uid,
      maxReaders: postDrain.maxReaders || 1024,
      activeReadersP50: rPct.P50,
      activeReadersP95: rPct.P95,
      peakActiveReaders: rPct.Max,
      readersAfterDrain: postDrain.activeReaders || 0
    };
  });

  // Evaluate Pass/Fail Gate
  let finalResult = 'PASS';
  if (phaseStatus === 'SAFETY_ABORT') {
    finalResult = 'SAFETY_ABORT';
  } else if (admittedQps < 19.5 || completedQps < 19.5 || visibleDocsSec < 833.33 || shedQueries > 0) {
    finalResult = 'PERFORMANCE_FAIL';
  }

  const phaseMetrics = {
    CONFIG: configName,
    RESULT: finalResult,
    PHASE_STATUS: phaseStatus,
    ABORT_REASON: abortReason,
    FATAL_EVENT_TO_ABORT_MS: fatalEventToAbortMs,
    VISIBLE_DOCS_SEC: visibleDocsSec,
    WRITE_TOTAL_SEC: Number(phaseWallSec.toFixed(2)),
    DOCS_INDEXED: searchIndexed,
    OFFERED_QPS: offeredQps,
    ADMITTED_QPS: admittedQps,
    COMPLETED_QPS: completedQps,
    SHED_QPS: shedQps,
    SCHEDULED_COUNT: offeredQueries,
    ADMITTED_COUNT: admittedQueries,
    COMPLETED_COUNT: completedQueries,
    TIMEOUT_COUNT: queryTimeouts,
    ERROR_COUNT: queryErrors,
    ADMISSION_WAIT_P50: admWaitPct.P50,
    ADMISSION_WAIT_P95: admWaitPct.P95,
    ADMISSION_WAIT_P99: admWaitPct.P99,
    SERVICE_P50: servicePct.P50,
    SERVICE_P95: servicePct.P95,
    SERVICE_P99: servicePct.P99,
    SERVICE_MAX: servicePct.Max,
    TOTAL_LATENCY_P50: totalPct.P50,
    TOTAL_LATENCY_P95: totalPct.P95,
    TOTAL_LATENCY_P99: totalPct.P99,
    MEAN_INFLIGHT: meanInFlight,
    P95_INFLIGHT: inFlightPct.P95,
    MAX_INFLIGHT: maxInFlightObserved,
    INFLIGHT_INCREMENT_COUNT: inFlightIncrementCount,
    INFLIGHT_DECREMENT_COUNT: inFlightDecrementCount,
    INFLIGHT_AT_PHASE_END: inFlight,
    TASK_QUEUE_MAX_READERS: taskLockPostDrain.maxReaders,
    TASK_QUEUE_ACTIVE_P50: taskReaderPct.P50,
    TASK_QUEUE_ACTIVE_P95: taskReaderPct.P95,
    TASK_QUEUE_PEAK_READERS: taskReaderPct.Max,
    TASK_QUEUE_READERS_AFTER_DRAIN: taskLockPostDrain.activeReaders,
    ROTOR_READER_METRICS: rotorReaderMetrics,
    PEAK_READERS_PER_ROTOR: rotorReaderMetrics.map(r => r.peakActiveReaders),
    MEILI_CPU_P50: cpuPct.P50,
    MEILI_CPU_P95: cpuPct.P95,
    MEILI_CPU_MAX: cpuPct.Max,
    RSS_P50_MB: rssPct.P50,
    RSS_P95_MB: rssPct.P95,
    RSS_MAX_MB: rssPct.Max,
    MEILI_INDEX_TASK_P50_MS: taskPct.P50,
    MEILI_INDEX_TASK_P95_MS: taskPct.P95,
    ESTABLISHED_P50: 0,
    ESTABLISHED_MAX: establishedMax,
    CLOSE_WAIT_START: closeWaitStart,
    CLOSE_WAIT_MAX: closeWaitMax,
    CLOSE_WAIT_AFTER_DRAIN: closeWaitAfterDrain,
    TIME_WAIT_MAX: timeWaitMax
  };

  console.log(`\n📊 PHASE METRICS FOR ${configName}:`, JSON.stringify(phaseMetrics, null, 2));
  return phaseMetrics;
}

// -------------------------------------------------------------
// 500-QUERY PARITY AUDIT AGAINST MONOLITHIC REFERENCE
// -------------------------------------------------------------
async function runParityAudit(rotorUids, referenceFile = 'scratch/reference_500_monolithic.json') {
  if (!fs.existsSync(referenceFile)) {
    return { TOP10_RESULT_PARITY: 0, TOP10_RANK_PARITY: 0, TOP50_RESULT_PARITY: 0, TOP50_RANK_PARITY: 0 };
  }
  const refQueries = JSON.parse(fs.readFileSync(referenceFile));
  console.log(`   Auditing 500 queries across ${rotorUids.length} rotors against monolithic reference...`);

  let top10Matches = 0;
  let top10RankMatches = 0;
  let top50Matches = 0;
  let top50RankMatches = 0;

  for (let i = 0; i < refQueries.length; i++) {
    const ref = refQueries[i];
    const res = await fetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        queries: rotorUids.map(uid => ({ indexUid: uid, q: ref.q })),
        federation: { limit: 50 }
      })
    });
    const d = await res.json();
    const hits = (d.hits || []).map(h => h.atlas_person_id);

    // Top 10 check
    const top10Current = hits.slice(0, 10);
    const top10Ref = ref.top10Ids || [];
    const top10Set = new Set(top10Current);
    if (top10Ref.length === top10Current.length && top10Ref.every(id => top10Set.has(id))) {
      top10Matches++;
    }
    if (top10Ref.length === top10Current.length && top10Ref.every((id, idx) => id === top10Current[idx])) {
      top10RankMatches++;
    }

    // Top 50 check
    const top50Current = hits.slice(0, 50);
    const top50Ref = ref.top50Ids || [];
    const top50Set = new Set(top50Current);
    if (top50Ref.length === top50Current.length && top50Ref.every(id => top50Set.has(id))) {
      top50Matches++;
    }
    if (top50Ref.length === top50Current.length && top50Ref.every((id, idx) => id === top50Current[idx])) {
      top50RankMatches++;
    }
  }

  const count = refQueries.length;
  return {
    TOP10_RESULT_PARITY: Number(((top10Matches / count) * 100).toFixed(2)),
    TOP10_RANK_PARITY: Number(((top10RankMatches / count) * 100).toFixed(2)),
    TOP50_RESULT_PARITY: Number(((top50Matches / count) * 100).toFixed(2)),
    TOP50_RANK_PARITY: Number(((top50RankMatches / count) * 100).toFixed(2))
  };
}

async function recreateRotorWithLockTracking(uid) {
  const indexesDir = 'C:/Users/Eduardo/YOUAPP/data_discovery_delta.ms/indexes';
  const beforeDirs = new Set(fs.existsSync(indexesDir) ? fs.readdirSync(indexesDir) : []);

  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const cRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const cTask = await cRes.json();
  while (true) {
    const t = await (await fetch(`${MEILI_URL}/tasks/${cTask.taskUid}`, { headers: HEADERS })).json();
    if (t.status === 'succeeded') break;
    await new Promise(r => setTimeout(r, 50));
  }

  const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const sTask = await sRes.json();
  while (true) {
    const t = await (await fetch(`${MEILI_URL}/tasks/${sTask.taskUid}`, { headers: HEADERS })).json();
    if (t.status === 'succeeded') break;
    await new Promise(r => setTimeout(r, 50));
  }

  const afterDirs = fs.readdirSync(indexesDir);
  const newDir = afterDirs.find(d => !beforeDirs.has(d));
  return newDir ? `${indexesDir}/${newDir}/lock.mdb` : null;
}

async function populateRotorBatch(uid, startId, totalDocs, batchSize = 25000) {
  console.log(`   Populating ${uid} with ${totalDocs} docs starting at ${startId}...`);
  for (let b = 0; b < totalDocs; b += batchSize) {
    const count = Math.min(batchSize, totalDocs - b);
    const docs = generateDocBatch(startId + b, count);
    const postRes = await fetch(`${MEILI_URL}/indexes/${uid}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(docs)
    });
    const postData = await postRes.json();
    while (true) {
      const t = await (await fetch(`${MEILI_URL}/tasks/${postData.taskUid}`, { headers: HEADERS })).json();
      if (t.status === 'succeeded') break;
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

// -------------------------------------------------------------
// MAIN CONTROLLER: EXECUTE A -> B -> C WITH CLEAN ISOLATION
// -------------------------------------------------------------
async function runV262Discriminator() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.6.2 — RESUME SEARCH GEOMETRY DISCRIMINATOR');
  console.log('Testing Config A (8x50K) -> Drain -> Config B (4x100K) -> Drain -> Config C (2x200K)');
  console.log('================================================================\n');

  // -----------------------------------------------------------
  // 1. EXECUTE CONFIGURATION A (8 x 50K)
  // -----------------------------------------------------------
  const rotUidsA = [];
  for (let i = 0; i < 8; i++) rotUidsA.push(`v24_canary_1790015958064_rot_${i}`);
  const activeRotorA = rotUidsA[7];

  // Map lock files for Config A
  const indexesDir = 'C:/Users/Eduardo/YOUAPP/data_discovery_delta.ms/indexes';
  const lockFilesA = rotUidsA.map(() => null); // Sample from all index locks
  if (fs.existsSync(indexesDir)) {
    const allLocks = fs.readdirSync(indexesDir).map(d => `${indexesDir}/${d}/lock.mdb`);
    for (let i = 0; i < Math.min(rotUidsA.length, allLocks.length); i++) {
      lockFilesA[i] = allLocks[i];
    }
  }

  // Clear rot_7 so it starts at 0K
  console.log(`Clearing ${activeRotorA} so active rotor starts at 0K...`);
  await fetch(`${MEILI_URL}/indexes/${activeRotorA}/documents`, { method: 'DELETE', headers: HEADERS });
  const delTask = await (await fetch(`${MEILI_URL}/tasks?limit=1`, { headers: HEADERS })).json();
  while (true) {
    const t = await (await fetch(`${MEILI_URL}/tasks/${delTask.results[0].uid}`, { headers: HEADERS })).json();
    if (t.status === 'succeeded') break;
    await new Promise(r => setTimeout(r, 50));
  }

  const metricsA = await executePhase('CONFIG_A', rotUidsA, activeRotorA, 350000, lockFilesA);
  let parityA = { TOP10_RESULT_PARITY: 0, TOP10_RANK_PARITY: 0, TOP50_RESULT_PARITY: 0, TOP50_RANK_PARITY: 0 };
  if (metricsA.RESULT === 'PASS') {
    parityA = await runParityAudit(rotUidsA);
  } else {
    console.log(`⚠️ Config A result is ${metricsA.RESULT}; skipping parity audit for A.`);
  }

  // -----------------------------------------------------------
  // 2. CONSTRUCT & EXECUTE CONFIGURATION B (4 x 100K)
  // -----------------------------------------------------------
  console.log('\n--- PREPARING CONFIGURATION B (4 Rotors x 100K docs) ---');
  // Reclaim disk space by deleting Config A indexes
  for (const uid of rotUidsA) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }
  await new Promise(r => setTimeout(r, 1500));

  const rotUidsB = ['v26_b_rot_0', 'v26_b_rot_1', 'v26_b_rot_2', 'v26_b_rot_3'];
  const lockFilesB = [];
  for (const uid of rotUidsB) {
    const lPath = await recreateRotorWithLockTracking(uid);
    lockFilesB.push(lPath);
  }

  // Populate B:
  // rot_0: 0..99,999 (100K)
  // rot_1: 100,000..199,999 (100K)
  // rot_2: 200,000..299,999 (100K)
  // rot_3: 300,000..349,999 (50K static). Write cohort will be 350,000..399,999 (50K net-new) -> finishes at 100K!
  await populateRotorBatch(rotUidsB[0], 0, 100000);
  await populateRotorBatch(rotUidsB[1], 100000, 100000);
  await populateRotorBatch(rotUidsB[2], 200000, 100000);
  await populateRotorBatch(rotUidsB[3], 300000, 50000);

  const metricsB = await executePhase('CONFIG_B', rotUidsB, rotUidsB[3], 350000, lockFilesB);
  let parityB = { TOP10_RESULT_PARITY: 0, TOP10_RANK_PARITY: 0, TOP50_RESULT_PARITY: 0, TOP50_RANK_PARITY: 0 };
  if (metricsB.DOCS_INDEXED >= 50000) {
    parityB = await runParityAudit(rotUidsB);
    console.log('Parity B:', parityB);
  }

  // -----------------------------------------------------------
  // 3. CONSTRUCT & EXECUTE CONFIGURATION C (2 x 200K)
  // -----------------------------------------------------------
  console.log('\n--- PREPARING CONFIGURATION C (2 Rotors x 200K docs) ---');
  // Reclaim disk space by deleting Config B indexes
  for (const uid of rotUidsB) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }
  await new Promise(r => setTimeout(r, 1500));

  const rotUidsC = ['v26_c_rot_0', 'v26_c_rot_1'];
  const lockFilesC = [];
  for (const uid of rotUidsC) {
    const lPath = await recreateRotorWithLockTracking(uid);
    lockFilesC.push(lPath);
  }

  // Populate C:
  // rot_0: 0..199,999 (200K)
  // rot_1: 200,000..349,999 (150K static). Write cohort will be 350,000..399,999 (50K net-new) -> finishes at 200K!
  await populateRotorBatch(rotUidsC[0], 0, 200000);
  await populateRotorBatch(rotUidsC[1], 200000, 150000);

  const metricsC = await executePhase('CONFIG_C', rotUidsC, rotUidsC[1], 350000, lockFilesC);
  let parityC = { TOP10_RESULT_PARITY: 0, TOP10_RANK_PARITY: 0, TOP50_RESULT_PARITY: 0, TOP50_RANK_PARITY: 0 };
  if (metricsC.DOCS_INDEXED >= 50000) {
    parityC = await runParityAudit(rotUidsC);
    console.log('Parity C:', parityC);
  }

  // -----------------------------------------------------------
  // 4. GLOBAL EVALUATION & SELECTION
  // -----------------------------------------------------------
  let selectedRotorSize = 'UNKNOWN';
  let selectedRotorCount = 'UNKNOWN';
  let projected1mRotors = 'UNKNOWN';
  let nextTest = 'SEARCH_ARCHITECTURE_REDESIGN';

  if (metricsC.RESULT === 'PASS' && parityC.TOP10_RANK_PARITY === 100) {
    selectedRotorSize = '200K';
    selectedRotorCount = 2;
    projected1mRotors = 5;
    nextTest = '1M_EQUIVALENT_LATE_STAGE_5_ROTOR_TEST';
  } else if (metricsB.RESULT === 'PASS' && parityB.TOP10_RANK_PARITY === 100) {
    selectedRotorSize = '100K';
    selectedRotorCount = 4;
    projected1mRotors = 10;
    nextTest = '1M_EQUIVALENT_10_ROTOR_TEST';
  }

  const finalSummary = {
    CONFIG_A: { ...metricsA, PARITY: parityA },
    CONFIG_B: { ...metricsB, PARITY: parityB },
    CONFIG_C: { ...metricsC, PARITY: parityC },
    SELECTED_ROTOR_SIZE: selectedRotorSize,
    SELECTED_ROTOR_COUNT_AT_400K: selectedRotorCount,
    PROJECTED_ROTOR_COUNT_AT_1M: projected1mRotors,
    NEXT_TEST: nextTest
  };

  fs.writeFileSync('scratch/v262_discriminator_summary.json', JSON.stringify(finalSummary, null, 2));
  console.log('\n================================================================');
  console.log('🏁 ATLAS V2.6.2 SEARCH GEOMETRY DISCRIMINATOR FINISHED');
  console.log(JSON.stringify(finalSummary, null, 2));
  console.log('================================================================');
}

runV262Discriminator().catch(console.error);
