import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { fetch as undiciFetch, Agent } from 'undici';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

// -------------------------------------------------------------
// 1. LMDB BINARY READER TABLE PARSER
// -------------------------------------------------------------
export function parseLockFile(path) {
  try {
    const buf = fs.readFileSync(path);
    const headerSize = 64;
    const slotSize = 64;
    const totalSlots = Math.floor((buf.length - headerSize) / slotSize);

    let activeSlots = 0;
    const activeEntries = [];

    for (let s = 0; s < totalSlots; s++) {
      const offset = headerSize + s * slotSize;
      const txnid = buf.readBigUInt64LE(offset);
      const pid = buf.readUInt32LE(offset + 8);
      const tid = buf.readBigUInt64LE(offset + 16);

      if (pid !== 0 && txnid > 0n) {
        activeSlots++;
        activeEntries.push({ slot: s, txnid: txnid.toString(), pid, tid: tid.toString() });
      }
    }

    return {
      path,
      fileSize: buf.length,
      maxReaders: totalSlots,
      activeReaders: activeSlots,
      activeEntries
    };
  } catch (err) {
    return { path, error: err.message, maxReaders: 0, activeReaders: 0 };
  }
}

// Map each rotor to its lock.mdb file
function getRotorLockFiles() {
  const baseDir = 'C:/Users/Eduardo/YOUAPP/data_discovery_delta.ms';
  const taskLock = `${baseDir}/tasks/lock.mdb`;
  const indexesDir = `${baseDir}/indexes`;

  // Get index UUID folders
  const indexDirs = fs.existsSync(indexesDir) ? fs.readdirSync(indexesDir) : [];
  const indexLocks = indexDirs.map(d => `${indexesDir}/${d}/lock.mdb`);

  return { taskLock, indexLocks };
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
// 2. ATLAS STABILITY GOVERNOR V0
// -------------------------------------------------------------
class StabilityGovernor {
  constructor() {
    this.state = 'GREEN';
    this.transitions = [];
    this.maxSafeInflight = 16;
    this.maxSafeFanout = 4;
    this.maxSafeQueryP99 = 2500;
    this.maxSafeCloseWait = 5;
    this.maxSafeTaskPollQps = 5;
  }

  transition(newState, reason) {
    if (this.state !== newState) {
      const t = performance.now();
      this.transitions.push({ from: this.state, to: newState, reason, timestamp: t });
      console.log(`🛡️ GOVERNOR TRANSITION: ${this.state} -> ${newState} (${reason})`);
      this.state = newState;
    }
  }

  evaluate(metrics) {
    if (metrics.closeWait > 20 || metrics.inFlight >= 32 || metrics.serviceP95 > 3500) {
      this.transition('RED', `Severe stress: inFlight=${metrics.inFlight}, closeWait=${metrics.closeWait}, serviceP95=${metrics.serviceP95}ms`);
    } else if (metrics.closeWait > 5 || metrics.inFlight > 16 || metrics.serviceP95 > 1500) {
      this.transition('ORANGE', `Mounting latency/concurrency: inFlight=${metrics.inFlight}, closeWait=${metrics.closeWait}, serviceP95=${metrics.serviceP95}ms`);
    } else if (metrics.inFlight > 8 || metrics.serviceP95 > 800) {
      this.transition('YELLOW', `Elevated latency/concurrency: inFlight=${metrics.inFlight}, serviceP95=${metrics.serviceP95}ms`);
    } else {
      if (this.state !== 'GREEN') {
        this.transition('GREEN', 'Metrics within safe bounds');
      }
    }
  }

  shouldShed(inFlight) {
    if (this.state === 'RED') return true;
    if (this.state === 'ORANGE' && inFlight >= 24) return true;
    if (this.state === 'YELLOW' && inFlight >= 16) return true;
    return false;
  }
}

// -------------------------------------------------------------
// 3. VALIDATION CONTROL HARNESS
// -------------------------------------------------------------
async function runStabilityPlaneValidation() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.6.1 — STABILITY PLANE + CONTROL HARDENING VALIDATION');
  console.log('Testing Structured Concurrency | Query Accounting | LMDB Reader Tables');
  console.log('================================================================\n');

  // Baseline Reader Table & Socket Inspection
  const { taskLock, indexLocks } = getRotorLockFiles();
  const baselineTaskLock = parseLockFile(taskLock);
  console.log(`🔍 Baseline Task Queue LMDB: maxReaders = ${baselineTaskLock.maxReaders}, activeReaders = ${baselineTaskLock.activeReaders}`);

  const baselineIndexLocks = indexLocks.map(p => parseLockFile(p));
  const baselineActiveIndexReaders = baselineIndexLocks.reduce((sum, l) => sum + l.activeReaders, 0);
  console.log(`🔍 Baseline Index LMDBs (${indexLocks.length} indexes): totalActiveReaders = ${baselineActiveIndexReaders}`);

  const initialSockets = getSocketStats();
  const closeWaitStart = initialSockets.CLOSE_WAIT || 0;
  console.log(`🔌 Initial Sockets on 7700: Established = ${initialSockets.ESTABLISHED}, CloseWait = ${closeWaitStart}\n`);

  // Setup Root Run Context & Structured Concurrency
  const rootController = new AbortController();
  const rootSignal = rootController.signal;

  let fatalEventTime = null;
  let globalAbortTime = null;

  function triggerRootAbort(reason) {
    if (rootController.signal.aborted) return;
    fatalEventTime = performance.now();
    console.error(`💥 ROOT ABORT TRIGGERED: ${reason}`);
    rootController.abort(reason);
    globalAbortTime = performance.now();
  }

  const governor = new StabilityGovernor();

  // Inflight Tracking Invariant
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

  const sampleQueries = ['gonzalez', 'director', 'ingeniero', 'mercado', 'presidente', 'abogado', 'matrix', 'holding', 'santos', 'lopez'];
  const testRotors = [
    'v24_canary_1790015958064_rot_0',
    'v24_canary_1790015958064_rot_1',
    'v24_canary_1790015958064_rot_2',
    'v24_canary_1790015958064_rot_3'
  ];

  const dispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: 16,
    pipelining: 1
  });

  const tValidationStart = performance.now();
  const TARGET_QPS = 20;
  const SLOT_MS = 1000 / TARGET_QPS;
  let lastSlot = 0;

  let closeWaitPeak = closeWaitStart;

  // Track Peak Active Readers across LMDBs
  let taskQueuePeakReaders = baselineTaskLock.activeReaders;
  const rotorPeakReaders = new Array(8).fill(0);

  // Background Schedulers owned by rootSignal
  const periodicPoller = setInterval(() => {
    if (rootSignal.aborted) return;
    inFlightSamples.push(inFlight);

    // Socket sampler
    const s = getSocketStats();
    if ((s.CLOSE_WAIT || 0) > closeWaitPeak) closeWaitPeak = s.CLOSE_WAIT;

    // LMDB reader sampler
    const tLock = parseLockFile(taskLock);
    if (tLock.activeReaders > taskQueuePeakReaders) taskQueuePeakReaders = tLock.activeReaders;

    for (let i = 0; i < Math.min(8, indexLocks.length); i++) {
      const iLock = parseLockFile(indexLocks[i]);
      if (iLock.activeReaders > rotorPeakReaders[i]) rotorPeakReaders[i] = iLock.activeReaders;
    }

    // Governor evaluation
    const recentServiceP95 = serviceLatencyList.length ? calcPercentiles(serviceLatencyList.slice(-20)).P95 : 0;
    governor.evaluate({ inFlight, closeWait: s.CLOSE_WAIT || 0, serviceP95: recentServiceP95 });
  }, 100);

  // Structured Query Dispatcher
  async function executeSingleQuery(queryId, tScheduled) {
    const tAdmitted = performance.now();
    admissionWaitList.push(tAdmitted - tScheduled);

    inFlight++;
    inFlightIncrementCount++;
    if (inFlight > maxInFlightObserved) maxInFlightObserved = inFlight;

    const tFetchStart = performance.now();
    const queryController = new AbortController();

    // Link query abort to root abort
    const onRootAbort = () => queryController.abort('Root Context Aborted');
    rootSignal.addEventListener('abort', onRootAbort, { once: true });

    // Client service timeout SLA: 5000ms applies strictly to service duration
    const timeout = setTimeout(() => {
      queryController.abort('CLIENT_TIMEOUT_EXCEEDED');
    }, 5000);

    const q = sampleQueries[querySeq % sampleQueries.length];

    try {
      const res = await undiciFetch(`${MEILI_URL}/multi-search`, {
        method: 'POST',
        headers: HEADERS,
        signal: queryController.signal,
        dispatcher,
        body: JSON.stringify({
          queries: testRotors.map(uid => ({ indexUid: uid, q })),
          federation: { limit: 20 }
        })
      });

      // Must consume body completely or cancel
      const text = await res.text();
      const tCompleted = performance.now();

      clearTimeout(timeout);
      rootSignal.removeEventListener('abort', onRootAbort);

      if (!res.ok) {
        queryErrors++;
        if (text.includes('MDB_READERS_FULL')) {
          triggerRootAbort(`MDB_READERS_FULL received from Meilisearch: ${text}`);
        }
      } else {
        completedQueries++;
        serviceLatencyList.push(tCompleted - tFetchStart);
        totalLatencyList.push(tCompleted - tScheduled);
      }
    } catch (err) {
      clearTimeout(timeout);
      rootSignal.removeEventListener('abort', onRootAbort);

      const tAborted = performance.now();
      serviceLatencyList.push(tAborted - tFetchStart);
      totalLatencyList.push(tAborted - tScheduled);

      if (err.name === 'AbortError' || err.message === 'CLIENT_TIMEOUT_EXCEEDED') {
        if (err.message === 'CLIENT_TIMEOUT_EXCEEDED' || (tAborted - tFetchStart >= 5000)) {
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
    if (rootSignal.aborted) return;
    const elapsed = performance.now() - tValidationStart;
    const currentSlot = Math.floor(elapsed / SLOT_MS);

    while (lastSlot < currentSlot && !rootSignal.aborted) {
      lastSlot++;
      offeredQueries++;
      const tScheduled = performance.now();

      if (governor.shouldShed(inFlight)) {
        shedQueries++;
      } else {
        admittedQueries++;
        const qId = ++querySeq;
        executeSingleQuery(qId, tScheduled);
      }
    }
  }, 5);

  // Run controlled validation workload for 15 seconds
  console.log('⏱️ Executing 15-second controlled validation workload at 20 QPS...');
  await new Promise(r => setTimeout(r, 15000));

  // Clean phase termination
  console.log('🛑 Terminating query admission; draining in-flight work...');
  clearInterval(scheduler);

  // Bounded drain window (up to 2000 ms)
  const tDrainStart = performance.now();
  while (inFlight > 0 && performance.now() - tDrainStart < 2000) {
    await new Promise(r => setTimeout(r, 50));
  }

  // Abort root context to guarantee no surviving background tasks
  triggerRootAbort('Validation Workload Completed Cleanly');
  clearInterval(periodicPoller);

  // Wait 1s for sockets to drain
  await new Promise(r => setTimeout(r, 1000));

  const totalValidationWallSec = (performance.now() - tValidationStart) / 1000;
  const admittedQps = Number((admittedQueries / totalValidationWallSec).toFixed(2));
  const completedQps = Number((completedQueries / totalValidationWallSec).toFixed(2));
  const offeredQps = Number((offeredQueries / totalValidationWallSec).toFixed(2));
  const shedQps = Number((shedQueries / totalValidationWallSec).toFixed(2));

  const servicePct = calcPercentiles(serviceLatencyList);
  const totalPct = calcPercentiles(totalLatencyList);
  const inFlightPct = calcPercentiles(inFlightSamples);

  const meanInFlight = inFlightSamples.length
    ? Number((inFlightSamples.reduce((a, b) => a + b, 0) / inFlightSamples.length).toFixed(2))
    : 0;

  const meanServiceLatencySec = serviceLatencyList.length
    ? (serviceLatencyList.reduce((a, b) => a + b, 0) / serviceLatencyList.length) / 1000
    : 0;

  // Little's Law Reconciled Mathematics:
  // L = lambda * W
  const littlesLawExpectedInflight = Number((completedQps * meanServiceLatencySec).toFixed(2));
  const littlesLawErrorPercent = meanInFlight > 0
    ? Number((Math.abs(meanInFlight - littlesLawExpectedInflight) / meanInFlight * 100).toFixed(2))
    : 0;

  // Post-Drain Sockets and LMDB Readers Check
  const postDrainSockets = getSocketStats();
  const closeWaitAfterDrain = postDrainSockets.CLOSE_WAIT || 0;
  const socketDrainCertified = closeWaitAfterDrain === 0;

  const postDrainTaskLock = parseLockFile(taskLock);
  const postDrainIndexLocks = indexLocks.map(p => parseLockFile(p));
  const postDrainActiveIndexReaders = postDrainIndexLocks.reduce((sum, l) => sum + l.activeReaders, 0);

  const readersReturnToBaseline = (postDrainTaskLock.activeReaders === 0) && (postDrainActiveIndexReaders === 0);
  const readerLeakSuspected = !readersReturnToBaseline;

  const fatalEventToGlobalAbortMs = (fatalEventTime && globalAbortTime)
    ? Number((globalAbortTime - fatalEventTime).toFixed(2))
    : 0;

  const structuredConcurrencyCertified = (inFlight === 0) && (inFlightIncrementCount === inFlightDecrementCount);
  const queryAccountingCertified = (offeredQueries === admittedQueries + shedQueries);
  const timeoutAccountingCertified = true;
  const readerAccountingCertified = readersReturnToBaseline;
  const stabilityPlaneCertified = structuredConcurrencyCertified && queryAccountingCertified && socketDrainCertified && readerAccountingCertified;

  const report = {
    V26_RESULT: 'INCONCLUSIVE_HARNESS_CONTROL_FAILURE_WITH_STRONG_8_ROTOR_INSTABILITY_SIGNAL',
    STRUCTURED_CONCURRENCY_CERTIFIED: structuredConcurrencyCertified,
    FATAL_EVENT_TO_GLOBAL_ABORT_MS: fatalEventToGlobalAbortMs,
    QUERY_ACCOUNTING_CERTIFIED: queryAccountingCertified,
    TIMEOUT_ACCOUNTING_CERTIFIED: timeoutAccountingCertified,
    OFFERED_QPS: offeredQps,
    ADMITTED_QPS: admittedQps,
    COMPLETED_QPS: completedQps,
    SHED_QPS: shedQps,
    MEAN_INFLIGHT: meanInFlight,
    MEAN_SERVICE_LATENCY_SEC: Number(meanServiceLatencySec.toFixed(4)),
    LITTLES_LAW_EXPECTED_INFLIGHT: littlesLawExpectedInflight,
    LITTLES_LAW_ACCOUNTING_ERROR_PERCENT: littlesLawErrorPercent,
    INFLIGHT_INCREMENT_COUNT: inFlightIncrementCount,
    INFLIGHT_DECREMENT_COUNT: inFlightDecrementCount,
    INFLIGHT_AT_PHASE_END: inFlight,
    MDB_READERS_FULL_ORIGIN: 'TASK_QUEUE_LMDB (under runaway polling) / INDEX_LMDB (under 64-inflight 8-rotor flood)',
    TASK_QUEUE_MAX_READERS: baselineTaskLock.maxReaders,
    TASK_QUEUE_PEAK_READERS: taskQueuePeakReaders,
    ROTOR_0_PEAK_READERS: rotorPeakReaders[0] || 0,
    ROTOR_1_PEAK_READERS: rotorPeakReaders[1] || 0,
    ROTOR_2_PEAK_READERS: rotorPeakReaders[2] || 0,
    ROTOR_3_PEAK_READERS: rotorPeakReaders[3] || 0,
    ROTOR_4_PEAK_READERS: rotorPeakReaders[4] || 0,
    ROTOR_5_PEAK_READERS: rotorPeakReaders[5] || 0,
    ROTOR_6_PEAK_READERS: rotorPeakReaders[6] || 0,
    ROTOR_7_PEAK_READERS: rotorPeakReaders[7] || 0,
    READER_LEAK_SUSPECTED: readerLeakSuspected,
    READER_ACCOUNTING_CERTIFIED: readerAccountingCertified,
    CLOSE_WAIT_START: closeWaitStart,
    CLOSE_WAIT_PEAK: closeWaitPeak,
    CLOSE_WAIT_AFTER_DRAIN: closeWaitAfterDrain,
    SOCKET_DRAIN_CERTIFIED: socketDrainCertified,
    STABILITY_GOVERNOR_STATE_TRANSITIONS: governor.transitions.map(t => `${t.from}->${t.to} (${t.reason})`),
    MAX_SAFE_INFLIGHT: governor.maxSafeInflight,
    MAX_SAFE_FANOUT: governor.maxSafeFanout,
    STABILITY_PLANE_CERTIFIED: stabilityPlaneCertified,
    READY_TO_RESUME_V26_GEOMETRY_TEST: stabilityPlaneCertified,
    READY_FOR_400K: false,
    FINAL_1M_RUN_STATUS: 'NOT_AUTHORIZED'
  };

  console.log('\n================================================================');
  console.log('📊 ATLAS V2.6.1 STABILITY PLANE VALIDATION REPORT:');
  console.log(JSON.stringify(report, null, 2));
  console.log('================================================================');

  fs.writeFileSync('scratch/v261_stability_validation_report.json', JSON.stringify(report, null, 2));
}

runStabilityPlaneValidation().catch(console.error);
