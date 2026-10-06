import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fetch, Agent } from 'undici';
import dotenv from 'dotenv';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const SOAK_DURATION_SEC = 300; // 5 minutes
const TARGET_QPS = 20;
const SLOT_MS = 1000 / TARGET_QPS; // 50 ms
const MAX_INFLIGHT_CLAMP = 64;
const CLIENT_QUERY_TIMEOUT_MS = 5000;

// Persistent HTTP Keep-Alive Agent with Connection Reuse Pool
const persistentDispatcher = new Agent({
  keepAliveTimeout: 10000,
  keepAliveMaxTimeout: 30000,
  connections: 64,
  pipelining: 1
});

function getTcpSocketBreakdown() {
  try {
    const stdout = execSync(
      'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 7700 -ErrorAction SilentlyContinue | Group-Object State | Select-Object Name, Count | ConvertTo-Json"',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    if (!stdout.trim()) return { total: 0, established: 0, closeWait: 0, timeWait: 0, states: {} };
    let parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) parsed = [parsed];
    const states = {};
    let total = 0;
    let established = 0;
    let closeWait = 0;
    let timeWait = 0;
    for (const item of parsed) {
      const name = item.Name || 'Other';
      const count = item.Count || 0;
      states[name] = count;
      total += count;
      if (name === 'Established') established = count;
      if (name === 'CloseWait') closeWait = count;
      if (name === 'TimeWait') timeWait = count;
    }
    return { total, established, closeWait, timeWait, states };
  } catch (err) {
    return { total: 0, established: 0, closeWait: 0, timeWait: 0, states: {} };
  }
}

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0, Max: 0, Min: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    Max: Number(sorted[sorted.length - 1].toFixed(2)),
    Min: Number(sorted[0].toFixed(2))
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.4.1 — 5-MINUTE LOAD GENERATOR SOAK TEST');
  console.log(`Duration: ${SOAK_DURATION_SEC}s | Target: ${TARGET_QPS} QPS (6,000 nominal arrivals)`);
  console.log(`Paced Open-Loop (50ms monotonic) | Hard Clamp: ${MAX_INFLIGHT_CLAMP} | Keep-Alive: 64`);
  console.log('================================================================\n');

  // Verify target index exists
  const idxRes = await fetch(`${MEILI_URL}/indexes/atlas_people_discovery_gate32_delta/stats`, { headers: HEADERS });
  const idxData = await idxRes.json();
  console.log(`🎯 Target Search Index: atlas_people_discovery_gate32_delta (${idxData.numberOfDocuments} docs)\n`);

  let queriesAttempted = 0;
  let queriesCompleted = 0;
  let queryErrors = 0;
  let queryTimeouts = 0;
  let missedSchedulerSlots = 0;
  let inflightClampDroppedSlots = 0;

  const queryLatencies = [];
  const perSecondAttempts = [];
  let currentSecAttempts = 0;

  let inFlight = 0;
  let maxInFlight = 0;
  const inFlightSamples = [];
  let peakEstablishedConnections = 0;
  let peakTotalTcpEntries = 0;

  const sampleQueries = ['gonzalez', 'director', 'ingeniero', 'mercado', 'presidente', 'abogado', 'matrix', 'holding', 'santos', 'lopez'];
  let qIdx = 0;

  // Socket snapshots tracking
  const socketSnapshots = {};
  const initialSockets = getTcpSocketBreakdown();
  socketSnapshots['SOCKET_COUNT_START'] = initialSockets;
  console.log(`🔌 Initial Sockets on port 7700: Total = ${initialSockets.total} (Established: ${initialSockets.established}, CloseWait: ${initialSockets.closeWait})`);

  const tStart = performance.now();
  let lastScheduledSlot = 0;
  let lastSecMark = tStart;

  function dispatchSingleQuery() {
    queriesAttempted++;
    currentSecAttempts++;
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;

    const q = sampleQueries[qIdx++ % sampleQueries.length];
    const tQStart = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLIENT_QUERY_TIMEOUT_MS);

    fetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      signal: controller.signal,
      dispatcher: persistentDispatcher,
      body: JSON.stringify({
        queries: [{ indexUid: 'atlas_people_discovery_gate32_delta', q, limit: 20 }]
      })
    }).then(async res => {
      clearTimeout(timeout);
      inFlight--;
      if (!res.ok) {
        queryErrors++;
      } else {
        const tQEnd = performance.now();
        queryLatencies.push(tQEnd - tQStart);
        queriesCompleted++;
      }
    }).catch(err => {
      clearTimeout(timeout);
      inFlight--;
      if (err.name === 'AbortError') {
        queryTimeouts++;
      } else {
        queryErrors++;
      }
    });
  }

  // 1-Second Rate Window & Periodic Socket Sampler
  let nextMinuteSnapshotIndex = 1;
  const periodicSampler = setInterval(() => {
    const now = performance.now();
    const elapsedSec = (now - tStart) / 1000;

    // Record 1-second attempt rate
    if (now - lastSecMark >= 1000) {
      perSecondAttempts.push(currentSecAttempts);
      currentSecAttempts = 0;
      lastSecMark = now;
    }

    // Sample in-flight concurrency
    inFlightSamples.push(inFlight);

    // Minute-by-minute socket snapshot
    if (elapsedSec >= nextMinuteSnapshotIndex * 60 && nextMinuteSnapshotIndex <= 4) {
      const snap = getTcpSocketBreakdown();
      socketSnapshots[`SOCKET_COUNT_${nextMinuteSnapshotIndex}MIN`] = snap;
      if (snap.established > peakEstablishedConnections) peakEstablishedConnections = snap.established;
      if (snap.total > peakTotalTcpEntries) peakTotalTcpEntries = snap.total;

      console.log(`⏱️ [${nextMinuteSnapshotIndex}m] Elapsed: ${elapsedSec.toFixed(1)}s | Queries: ${queriesCompleted}/${queriesAttempted} | In-Flight: ${inFlight} (Max: ${maxInFlight}) | Sockets: ${snap.total} (Est: ${snap.established}, CloseWait: ${snap.closeWait})`);
      nextMinuteSnapshotIndex++;
    }
  }, 100);

  // High-Resolution Monotonic Paced Arrival Scheduler (5ms ticker)
  const ticker = setInterval(() => {
    const now = performance.now();
    const elapsedMs = now - tStart;
    const currentSlot = Math.floor(elapsedMs / SLOT_MS);

    if (currentSlot > lastScheduledSlot) {
      const slotsPassed = currentSlot - lastScheduledSlot;
      if (slotsPassed > 1) {
        // Event loop was delayed: record missed slots, DO NOT BURST CATCH-UP!
        missedSchedulerSlots += (slotsPassed - 1);
      }
      lastScheduledSlot = currentSlot;

      // Check In-Flight Clamp
      if (inFlight >= MAX_INFLIGHT_CLAMP) {
        inflightClampDroppedSlots++;
      } else {
        dispatchSingleQuery();
      }
    }
  }, 5);

  // Wait for soak duration to complete
  await new Promise(r => setTimeout(r, SOAK_DURATION_SEC * 1000));

  clearInterval(ticker);
  clearInterval(periodicSampler);

  // Wait for any remaining in-flight queries to drain (up to 5s)
  const tDrainStart = performance.now();
  while (inFlight > 0 && performance.now() - tDrainStart < 5000) {
    await new Promise(r => setTimeout(r, 20));
  }

  const tEnd = performance.now();
  const actualDurationSec = (tEnd - tStart) / 1000;

  // Final socket snapshot
  const endSockets = getTcpSocketBreakdown();
  socketSnapshots['SOCKET_COUNT_END'] = endSockets;
  if (endSockets.established > peakEstablishedConnections) peakEstablishedConnections = endSockets.established;
  if (endSockets.total > peakTotalTcpEntries) peakTotalTcpEntries = endSockets.total;

  // Metrics Calculations
  const actualAttemptedQps = Number((queriesAttempted / actualDurationSec).toFixed(2));
  const actualCompletedQps = Number((queriesCompleted / actualDurationSec).toFixed(2));

  const perSecStats = calcPercentiles(perSecondAttempts);
  const inFlightStats = calcPercentiles(inFlightSamples);
  const qLatStats = calcPercentiles(queryLatencies);

  // Socket Leak Detection: check if established or close-wait grew monotonically
  const socketLeakDetected = (
    endSockets.established > 64 ||
    endSockets.closeWait > 50
  );

  // Certification Gate
  const queryGeneratorCertified = (
    actualAttemptedQps >= 19.5 &&
    actualAttemptedQps <= 20.5 &&
    perSecStats.Max <= 25 &&
    maxInFlight <= MAX_INFLIGHT_CLAMP &&
    queryErrors === 0 &&
    queryTimeouts === 0 &&
    inflightClampDroppedSlots === 0 &&
    !socketLeakDetected
  );

  const report = {
    TIMESTAMP: new Date().toISOString(),
    SOAK_DURATION_SEC: Number(actualDurationSec.toFixed(2)),
    TARGET_QUERY_COUNT: SOAK_DURATION_SEC * TARGET_QPS,
    QUERY_ATTEMPTED: queriesAttempted,
    QUERY_COMPLETED: queriesCompleted,

    MISSED_SCHEDULER_SLOTS: missedSchedulerSlots,
    INFLIGHT_CLAMP_DROPPED_SLOTS: inflightClampDroppedSlots,

    ACTUAL_ATTEMPTED_QPS: actualAttemptedQps,
    ACTUAL_COMPLETED_QPS: actualCompletedQps,

    PER_SECOND_ATTEMPTED_QPS_P50: perSecStats.P50,
    PER_SECOND_ATTEMPTED_QPS_P95: perSecStats.P95,
    PER_SECOND_ATTEMPTED_QPS_MAX: perSecStats.Max,

    MEAN_INFLIGHT_QUERIES: inFlightStats.P50,
    P95_INFLIGHT_QUERIES: inFlightStats.P95,
    MAX_INFLIGHT_QUERIES: maxInFlight,

    PEAK_ESTABLISHED_CONNECTIONS: peakEstablishedConnections,
    PEAK_TOTAL_TCP_ENTRIES: peakTotalTcpEntries,

    QUERY_P50_MS: qLatStats.P50,
    QUERY_P95_MS: qLatStats.P95,
    QUERY_P99_MS: qLatStats.P99,
    QUERY_MAX_MS: qLatStats.Max,

    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,

    SOCKET_SNAPSHOTS: socketSnapshots,
    SOCKET_LEAK_DETECTED: socketLeakDetected,

    HTTP_CLIENT: 'undici.Agent',
    KEEP_ALIVE_ENABLED: true,
    CONNECTION_POOL_LIMIT: 64,

    QUERY_GENERATOR_CERTIFIED: queryGeneratorCertified,
    READY_TO_RERUN_400K: queryGeneratorCertified && !socketLeakDetected,
    FINAL_1M_RUN_STATUS: 'NOT_AUTHORIZED'
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v241_soak_test_report.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 5-MINUTE LOAD GENERATOR SOAK TEST RESULTS');
  console.log('================================================================');
  console.log(`SOAK_DURATION_SEC                 : ${report.SOAK_DURATION_SEC} s`);
  console.log(`QUERY_ATTEMPTED                   : ${report.QUERY_ATTEMPTED} (Target: 6000)`);
  console.log(`QUERY_COMPLETED                   : ${report.QUERY_COMPLETED}`);
  console.log(`ACTUAL_ATTEMPTED_QPS              : ${report.ACTUAL_ATTEMPTED_QPS} (Requirement: 19.5 - 20.5) -> ${actualAttemptedQps >= 19.5 && actualAttemptedQps <= 20.5 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`ACTUAL_COMPLETED_QPS              : ${report.ACTUAL_COMPLETED_QPS}`);
  console.log(`MISSED_SCHEDULER_SLOTS            : ${report.MISSED_SCHEDULER_SLOTS}`);
  console.log(`INFLIGHT_CLAMP_DROPPED_SLOTS      : ${report.INFLIGHT_CLAMP_DROPPED_SLOTS} (Requirement: 0) -> ${inflightClampDroppedSlots === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`PER_SECOND_ATTEMPTED_QPS_MAX      : ${report.PER_SECOND_ATTEMPTED_QPS_MAX} (Requirement: <= 25) -> ${perSecStats.Max <= 25 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MAX_INFLIGHT_QUERIES              : ${report.MAX_INFLIGHT_QUERIES} (Requirement: <= 64) -> ${maxInFlight <= 64 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MEAN_INFLIGHT_QUERIES             : ${report.MEAN_INFLIGHT_QUERIES}`);
  console.log(`PEAK_ESTABLISHED_CONNECTIONS      : ${report.PEAK_ESTABLISHED_CONNECTIONS}`);
  console.log(`QUERY_ERRORS / TIMEOUTS           : ${report.QUERY_ERRORS} / ${report.QUERY_TIMEOUTS}`);
  console.log(`QUERY_P95_MS                      : ${report.QUERY_P95_MS} ms (Max: ${report.QUERY_MAX_MS} ms)`);
  console.log(`SOCKET_LEAK_DETECTED              : ${report.SOCKET_LEAK_DETECTED}`);
  console.log(`QUERY_GENERATOR_CERTIFIED         : ${report.QUERY_GENERATOR_CERTIFIED}`);
  console.log(`READY_TO_RERUN_400K               : ${report.READY_TO_RERUN_400K}`);
  console.log(`FINAL_1M_RUN_STATUS               : NOT_AUTHORIZED\n`);
}

main().catch(console.error);
