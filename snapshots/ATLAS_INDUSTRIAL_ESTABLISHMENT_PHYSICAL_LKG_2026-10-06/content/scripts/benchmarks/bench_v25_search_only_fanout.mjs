import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { fetch as undiciFetch, Agent } from 'undici';
import fs from 'node:fs';

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

async function runFanoutTest(rotorCount, durationSec = 120) {
  console.log(`\n================================================================`);
  console.log(`🔍 BENCHMARK: Fanout ${rotorCount} Rotor(s) | Duration: ${durationSec}s | Target: 20 QPS | Max Inflight: 16 | Conns: 16`);
  console.log(`================================================================`);

  const dispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: 16,
    pipelining: 1
  });

  const rotorUids = [];
  for (let i = 0; i < rotorCount; i++) {
    rotorUids.push(`v24_canary_1790015958064_rot_${i}`);
  }

  const TARGET_QPS = 20;
  const SLOT_MS = 1000 / TARGET_QPS; // 50ms
  const latencies = [];
  const errorBodies = [];
  let attempted = 0;
  let completed = 0;
  let errors = 0;
  let timeouts = 0;
  let mdbReadersFullCount = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let missedSlots = 0;
  let clampDroppedSlots = 0;
  let qIdx = 0;
  let stopWorker = false;

  const tStart = performance.now();
  let lastScheduledSlot = 0;

  function dispatchQuery() {
    attempted++;
    inFlight++;
    if (inFlight > maxInFlight) maxInFlight = inFlight;

    const q = sampleQueries[qIdx++ % sampleQueries.length];
    const tQStart = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const bodyObj = rotorCount === 1
      ? { queries: [{ indexUid: rotorUids[0], q }] }
      : { queries: rotorUids.map(uid => ({ indexUid: uid, q })), federation: { limit: 20 } };

    undiciFetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      signal: controller.signal,
      dispatcher,
      body: JSON.stringify(bodyObj)
    }).then(async res => {
      clearTimeout(timeout);
      inFlight--;
      if (!res.ok) {
        errors++;
        const text = await res.text();
        if (text.includes('MDB_READERS_FULL')) mdbReadersFullCount++;
        errorBodies.push({ timestamp: new Date().toISOString(), status: res.status, body: text });
      } else {
        const lat = performance.now() - tQStart;
        latencies.push(lat);
        completed++;
      }
    }).catch(err => {
      clearTimeout(timeout);
      inFlight--;
      if (err.name === 'AbortError') {
        timeouts++;
      } else {
        errors++;
        errorBodies.push({ timestamp: new Date().toISOString(), error: err.message });
      }
    });
  }

  return new Promise(resolve => {
    const scheduler = setInterval(() => {
      if (stopWorker) return;
      const elapsed = performance.now() - tStart;
      if (elapsed >= durationSec * 1000) {
        stopWorker = true;
        clearInterval(scheduler);

        // Wait for drain
        const drainWait = setInterval(() => {
          if (inFlight === 0 || (performance.now() - tStart > (durationSec + 5) * 1000)) {
            clearInterval(drainWait);
            const totalWallSec = (performance.now() - tStart) / 1000;
            const pct = calcPercentiles(latencies);
            const actualQps = Number((attempted / totalWallSec).toFixed(2));
            const completedQps = Number((completed / totalWallSec).toFixed(2));

            const summary = {
              ROTOR_COUNT: rotorCount,
              DURATION_SEC: Number(totalWallSec.toFixed(2)),
              QUERY_ATTEMPTED: attempted,
              QUERY_COMPLETED: completed,
              ACTUAL_QPS: actualQps,
              COMPLETED_QPS: completedQps,
              QUERY_P50: pct.P50,
              QUERY_P95: pct.P95,
              QUERY_P99: pct.P99,
              QUERY_MAX: pct.Max,
              MAX_INFLIGHT: maxInFlight,
              MDB_READERS_FULL_COUNT: mdbReadersFullCount,
              QUERY_ERRORS: errors,
              QUERY_TIMEOUTS: timeouts,
              MISSED_SLOTS: missedSlots,
              CLAMP_DROPPED: clampDroppedSlots,
              ERROR_SAMPLES: errorBodies.slice(0, 5)
            };

            console.log(`\n📊 RESULTS FOR FANOUT ${rotorCount} ROTOR(S):`);
            console.log(JSON.stringify(summary, null, 2));
            resolve(summary);
          }
        }, 50);
        return;
      }

      const currentSlot = Math.floor(elapsed / SLOT_MS);
      if (currentSlot > lastScheduledSlot) {
        const passed = currentSlot - lastScheduledSlot;
        if (passed > 1) missedSlots += (passed - 1);
        lastScheduledSlot = currentSlot;

        if (inFlight >= 16) {
          clampDroppedSlots++;
        } else {
          dispatchQuery();
        }
      }
    }, 5);
  });
}

async function main() {
  const fanouts = [1, 2, 4, 8];
  const allResults = [];
  // For quick clean benchmarking: 120 seconds each as specified by prompt
  for (const f of fanouts) {
    const res = await runFanoutTest(f, 120);
    allResults.push(res);
  }

  fs.writeFileSync('scratch/search_only_fanout_results.json', JSON.stringify(allResults, null, 2));
  console.log('\n================================================================');
  console.log('✅ ALL FANOUT MATRIX TESTS COMPLETED');
  console.log('================================================================');
  console.log(JSON.stringify(allResults, null, 2));
}

main().catch(console.error);
