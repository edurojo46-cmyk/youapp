/**
 * scripts/run_gate_s_concurrency_sweep.mjs
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ATLAS GATE S: SEARCH CONCURRENCY & PERFORMANCE SWEEP
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Sweeps concurrency tiers: 1, 5, 10, 20, 50, 100, 200 (and 300, 500)
 * Evaluates warm-up (10s) and measured window (30s) per tier.
 * Measures QPS, P50, P95, P99, Max latency, Timeouts, HTTP/DB errors, Client CPU/Lag.
 * Identifies the optimal stable operating concurrency for Gate S.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { performance } from 'perf_hooks';

const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

const SEQUENCE_PATH = path.resolve('reports/atlas/search/atlas_gate_s_1m_request_sequence.jsonl');
const REPORT_PATH   = path.resolve('reports/atlas/search/atlas_gate_s_concurrency_sweep.json');
const SEP           = '═'.repeat(75);

const CONCURRENCY_LEVELS = [1, 5, 10, 20, 50, 100, 200];
const WARMUP_SEC  = 10;
const MEASURE_SEC = 30;

function percentile(arr, pct) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return Number((sorted[Math.floor(sorted.length * pct)] || sorted[sorted.length - 1]).toFixed(1));
}

async function loadRequestPool(limit = 100_000) {
  console.log(`Loading request pool from ${SEQUENCE_PATH}...`);
  const pool = [];
  const fileStream = fs.createReadStream(SEQUENCE_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    pool.push(JSON.parse(line));
    if (pool.length >= limit) break;
  }

  console.log(`Loaded ${pool.length.toLocaleString()} request templates into memory.\n`);
  return pool;
}

async function runTier(tierConcurrency, requestPool) {
  console.log(`\n── TESTING CONCURRENCY: ${tierConcurrency} WORKERS ───────────────────────────`);

  let poolIdx = 0;
  function nextRequest() {
    return requestPool[poolIdx++ % requestPool.length];
  }

  // 1. Warm-up Phase
  console.log(`   [Warm-up] Running ${WARMUP_SEC}s...`);
  const warmupStart = performance.now();
  let warmupDone = false;

  async function warmupWorker() {
    while (!warmupDone) {
      const req = nextRequest();
      try {
        await AtlasPeopleSearchV2.search(req.params);
      } catch {}
      if ((performance.now() - warmupStart) / 1000 >= WARMUP_SEC) warmupDone = true;
    }
  }

  await Promise.all(Array.from({ length: tierConcurrency }, () => warmupWorker()));

  // 2. Measured Window Phase
  console.log(`   [Measuring] Running ${MEASURE_SEC}s window...`);
  const latencies = [];
  const dbLatencies = [];
  let completed = 0;
  let timeouts = 0;
  let httpErrors = 0;
  let dbErrors = 0;
  let measureDone = false;

  const measureStart = performance.now();

  async function measureWorker() {
    while (!measureDone) {
      const req = nextRequest();
      const t0 = performance.now();
      try {
        const res = await AtlasPeopleSearchV2.search(req.params);
        const dt = performance.now() - t0;
        latencies.push(dt);
        if (res?.db_query_ms) dbLatencies.push(res.db_query_ms);
        completed++;
      } catch (err) {
        const dt = performance.now() - t0;
        latencies.push(dt);
        if (err?.message?.includes('timeout') || dt >= 8000) {
          timeouts++;
        } else if (err?.message?.includes('database') || err?.code) {
          dbErrors++;
        } else {
          httpErrors++;
        }
      }

      if ((performance.now() - measureStart) / 1000 >= MEASURE_SEC) {
        measureDone = true;
      }
    }
  }

  await Promise.all(Array.from({ length: tierConcurrency }, () => measureWorker()));

  const actualElapsedSec = (performance.now() - measureStart) / 1000;
  const qps = Number((completed / actualElapsedSec).toFixed(1));
  const p50 = percentile(latencies, 0.50);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);
  const max = latencies.length ? Number(Math.max(...latencies).toFixed(1)) : 0;
  const dbP50 = percentile(dbLatencies, 0.50);
  const dbP95 = percentile(dbLatencies, 0.95);
  const dbP99 = percentile(dbLatencies, 0.99);

  const tierResult = {
    concurrency: tierConcurrency,
    warmup_seconds: WARMUP_SEC,
    measured_seconds: Number(actualElapsedSec.toFixed(2)),
    requests_completed: completed,
    qps,
    client_latency_p50_ms: p50,
    client_latency_p95_ms: p95,
    client_latency_p99_ms: p99,
    client_latency_max_ms: max,
    db_latency_p50_ms: dbP50,
    db_latency_p95_ms: dbP95,
    db_latency_p99_ms: dbP99,
    timeouts,
    http_errors: httpErrors,
    db_errors: dbErrors,
    error_rate_pct: Number((((timeouts + httpErrors + dbErrors) / (completed || 1)) * 100).toFixed(3))
  };

  console.log(
    `   ✅ Results: QPS = ${tierResult.qps.toLocaleString()} | ` +
    `Client P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms | Max: ${max}ms | ` +
    `DB P99: ${dbP99}ms | Timeouts: ${timeouts} | Errors: ${httpErrors + dbErrors}`
  );

  return tierResult;
}

async function main() {
  console.log(`\n${SEP}`);
  console.log('🏛️  STARTING GATE S CONCURRENCY & PERFORMANCE SWEEP');
  console.log(`   Tiers: ${CONCURRENCY_LEVELS.join(', ')} concurrent workers`);
  console.log(`   Warm-up: ${WARMUP_SEC}s | Measured Window: ${MEASURE_SEC}s per tier`);
  console.log(`${SEP}\n`);

  const requestPool = await loadRequestPool(50_000);
  const tierResults = [];

  for (const c of CONCURRENCY_LEVELS) {
    const res = await runTier(c, requestPool);
    tierResults.push(res);

    // Stop early if massive error rate / timeouts
    if (res.timeouts > 10 || res.error_rate_pct > 5.0) {
      console.warn(`\n⚠️ High error rate (${res.error_rate_pct}%) at concurrency ${c}. Stopping sweep.`);
      break;
    }

    // Cooldown between tiers
    await new Promise(r => setTimeout(r, 3000));
  }

  // Check if we should test 300 / 500
  const lastTier = tierResults[tierResults.length - 1];
  if (lastTier && lastTier.concurrency === 200 && lastTier.timeouts === 0 && lastTier.qps > 800) {
    console.log('\nConcurrency 200 is healthy and scaling! Testing Concurrency 300...');
    const res300 = await runTier(300, requestPool);
    tierResults.push(res300);

    if (res300.timeouts === 0 && res300.qps > lastTier.qps) {
      console.log('\nConcurrency 300 is healthy and scaling! Testing Concurrency 500...');
      const res500 = await runTier(500, requestPool);
      tierResults.push(res500);
    }
  }

  // Find optimal concurrency
  const validTiers = tierResults.filter(t => t.timeouts === 0 && t.client_latency_p99_ms < 1000);
  const optimalTier = validTiers.length
    ? validTiers.reduce((prev, curr) => (curr.qps > prev.qps ? curr : prev), validTiers[0])
    : tierResults.reduce((prev, curr) => (curr.qps > prev.qps ? curr : prev), tierResults[0]);

  const report = {
    benchmark: "ATLAS_GATE_S_CONCURRENCY_SWEEP",
    timestamp: new Date().toISOString(),
    optimal_concurrency: optimalTier.concurrency,
    max_sustained_qps: optimalTier.qps,
    target_qps: 1041.67,
    engineering_target_qps: 1200.0,
    target_achieved: optimalTier.qps >= 1041.67,
    tier_results: tierResults
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n${SEP}`);
  console.log('🏁 CONCURRENCY SWEEP COMPLETE');
  console.log(`   Report File:          ${REPORT_PATH}`);
  console.log(`   Optimal Concurrency:  ${optimalTier.concurrency} workers`);
  console.log(`   Max Sustained QPS:    ${optimalTier.qps.toLocaleString()} QPS [Target: 1,041.67 QPS]`);
  console.log(`   Client Latency P99:   ${optimalTier.client_latency_p99_ms}ms`);
  console.log(`   Timeouts:             ${optimalTier.timeouts}`);
  console.log(`   Target Met:           ${report.target_achieved ? '✅ YES' : '❌ NO'}`);
  console.log(`${SEP}\n`);
}

main().catch(err => {
  console.error('FATAL SWEEP ERROR:', err);
  process.exit(1);
});
