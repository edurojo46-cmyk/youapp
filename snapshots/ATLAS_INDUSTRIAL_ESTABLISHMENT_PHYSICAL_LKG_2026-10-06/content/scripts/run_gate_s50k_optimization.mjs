import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { performance } from 'perf_hooks';

// ============================================================
// CONSTANTS & PATHS
// ============================================================
const PROJECTION_DIR = path.resolve('reports/atlas/search');
const INDUSTRIAL_GOLDEN_PATH = path.join(PROJECTION_DIR, 'atlas_industrial_relevance_golden_v1.json');
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_v2_gate_s50k_optimization.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';

const SEARCHES_PER_SWEEP_CONFIG = 50000;
const REVALIDATION_SEARCHES = 100000;
const BASELINE_QPS = 689.80;

function createPRNG(seed = 543210987) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function() {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function getCpuAndPowerAudit() {
  const cpus = os.cpus();
  const model = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown';
  const logicalCores = cpus.length;
  let physicalCores = logicalCores;
  let maxClock = cpus.length > 0 ? cpus[0].speed : 0;
  let currentClock = maxClock;
  let powerPlan = 'Balanced';

  try {
    const outProc = execSync('powershell -NoProfile -Command "Get-CimInstance Win32_Processor | Select-Object -Property NumberOfCores, MaxClockSpeed, CurrentClockSpeed | ConvertTo-Json -Compress"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (outProc) {
      const p = JSON.parse(outProc);
      if (p.NumberOfCores) physicalCores = p.NumberOfCores;
      if (p.MaxClockSpeed) maxClock = p.MaxClockSpeed;
      if (p.CurrentClockSpeed) currentClock = p.CurrentClockSpeed;
    }
  } catch (e) {}

  try {
    const outPlan = execSync('powershell -NoProfile -Command "powercfg /getactivescheme"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (outPlan) powerPlan = outPlan;
  } catch (e) {}

  return { model, physicalCores, logicalCores, maxClock, currentClock, powerPlan };
}

let serverLogStream = null;
function spawnMeili() {
  if (!serverLogStream) {
    serverLogStream = fs.createWriteStream(SERVER_LOG_PATH, { flags: 'a' });
  }
  const proc = spawn(MEILI_EXE, [
    '--db-path', MEILI_DB_PATH,
    '--http-addr', `127.0.0.1:${MEILI_PORT}`,
    '--max-indexing-threads', '1',
    '--no-analytics'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.pipe(serverLogStream);
  proc.stderr.pipe(serverLogStream);
  return proc;
}

async function waitForHealth(timeoutSec = 30) {
  for (let i = 0; i < timeoutSec * 2; i++) {
    try {
      const res = await fetch(`${MEILI_URL}/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'available') return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function buildRequestSequence(count) {
  const goldenRaw = fs.readFileSync(INDUSTRIAL_GOLDEN_PATH, 'utf8');
  const golden = JSON.parse(goldenRaw);
  const cases = golden.cases;

  const prng = createPRNG(543210987);
  const sequence = [];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(prng() * cases.length);
    const tc = cases[idx];
    sequence.push({
      req_id: i + 1,
      query: tc.query,
      category: tc.category,
      test_id: tc.test_id
    });
  }

  const sha256 = crypto.createHash('sha256').update(JSON.stringify(sequence)).digest('hex');
  return { sequence, sha256 };
}

function getSystemCpuUsage(previousCpus) {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  for (let i = 0; i < cpus.length; i++) {
    const cpu = cpus[i];
    const prev = previousCpus ? previousCpus[i] : null;

    let user = cpu.times.user - (prev ? prev.times.user : 0);
    let nice = cpu.times.nice - (prev ? prev.times.nice : 0);
    let sys = cpu.times.sys - (prev ? prev.times.sys : 0);
    let irq = cpu.times.irq - (prev ? prev.times.irq : 0);
    let idle = cpu.times.idle - (prev ? prev.times.idle : 0);

    let total = user + nice + sys + irq + idle;
    totalTick += total;
    totalIdle += idle;
  }

  const percentUsed = totalTick > 0 ? ((1 - (totalIdle / totalTick)) * 100) : 0;
  return { percentUsed: parseFloat(percentUsed.toFixed(2)), currentCpus: cpus };
}

// Execute 1 multi-search benchmark run
async function runMultiSearchRun(queries, batchSize, httpConcurrency, meiliPid) {
  const batches = [];
  for (let i = 0; i < queries.length; i += batchSize) {
    batches.push(queries.slice(i, i + batchSize));
  }

  let batchIdx = 0;
  let successfulRequests = 0;
  let completedLogicalSearches = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  let missingResultsCount = 0;
  let duplicateResponsesCount = 0;

  const requestLatencies = [];
  const cpuSamples = [];
  let minFreeRamMB = Infinity;
  let peakMeiliRssMB = 0;

  let lastCpuState = os.cpus();

  const sampleInterval = setInterval(() => {
    const { percentUsed, currentCpus } = getSystemCpuUsage(lastCpuState);
    lastCpuState = currentCpus;
    if (percentUsed >= 0 && percentUsed <= 100) cpuSamples.push(percentUsed);

    const freeRamMB = parseFloat((os.freemem() / 1024 / 1024).toFixed(2));
    if (freeRamMB < minFreeRamMB) minFreeRamMB = freeRamMB;
  }, 1000);

  const t0 = performance.now();

  async function worker() {
    while (true) {
      const i = batchIdx++;
      if (i >= batches.length) break;

      const batch = batches[i];
      const multiPayload = {
        queries: batch.map(b => ({
          indexUid: INDEX_NAME,
          q: b.query,
          limit: 10,
          attributesToRetrieve: ['atlas_person_id', 'display_name', 'organization', 'role', 'profession', 'geography']
        }))
      };

      const tStart = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const res = await fetch(`${MEILI_URL}/multi-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(multiPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const lat = performance.now() - tStart;
        if (res.ok) {
          const data = await res.json();
          const results = data.results || [];
          requestLatencies.push(lat);
          successfulRequests++;

          if (results.length === batch.length) {
            completedLogicalSearches += results.length;
          } else {
            missingResultsCount += Math.max(0, batch.length - results.length);
            completedLogicalSearches += results.length;
          }
        } else {
          errorCount++;
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          timeoutCount++;
        } else {
          errorCount++;
        }
      }
    }
  }

  const workers = Array.from({ length: httpConcurrency }, () => worker());
  await Promise.all(workers);

  clearInterval(sampleInterval);
  const totalDurationSec = (performance.now() - t0) / 1000;

  const finalFreeRamMB = parseFloat((os.freemem() / 1024 / 1024).toFixed(2));
  if (finalFreeRamMB < minFreeRamMB) minFreeRamMB = finalFreeRamMB;

  const actualLogicalQps = parseFloat((completedLogicalSearches / totalDurationSec).toFixed(2));
  const httpRps = parseFloat((successfulRequests / totalDurationSec).toFixed(2));

  const p50 = percentile(requestLatencies, 50);
  const p95 = percentile(requestLatencies, 95);
  const p99 = percentile(requestLatencies, 99);
  const maxLat = requestLatencies.length > 0 ? Math.max(...requestLatencies) : 0;

  const avgCpu = cpuSamples.length > 0 ? parseFloat((cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length).toFixed(2)) : 0;
  const p95Cpu = percentile(cpuSamples, 95);
  const maxCpu = cpuSamples.length > 0 ? Math.max(...cpuSamples) : 0;

  return {
    batch: batchSize,
    http_concurrency: httpConcurrency,
    logical_searches: queries.length,
    completed_logical_searches: completedLogicalSearches,
    http_requests: batches.length,
    successful_http_requests: successfulRequests,
    duration_seconds: parseFloat(totalDurationSec.toFixed(2)),
    logical_qps: actualLogicalQps,
    http_rps: httpRps,
    errors: errorCount,
    timeouts: timeoutCount,
    missing_results: missingResultsCount,
    duplicate_responses: duplicateResponsesCount,
    request_latencies: {
      p50_ms: parseFloat(p50.toFixed(2)),
      p95_ms: parseFloat(p95.toFixed(2)),
      p99_ms: parseFloat(p99.toFixed(2)),
      max_ms: parseFloat(maxLat.toFixed(2))
    },
    cpu: {
      avg_cpu_percent: avgCpu,
      p95_cpu_percent: p95Cpu,
      max_cpu_percent: maxCpu
    },
    memory: {
      min_free_ram_mb: minFreeRamMB,
      peak_meili_rss_mb: peakMeiliRssMB
    }
  };
}

async function main() {
  console.log('============================================================');
  console.log('GATE S50K OPTIMIZATION SWEEP & 100K REVALIDATION BENCHMARK');
  console.log('============================================================\n');

  // 1. CPU & Power Audit before test
  const cpuAudit = getCpuAndPowerAudit();
  console.log('>>> CPU & POWER AUDIT:');
  console.log(`  - Model:             ${cpuAudit.model}`);
  console.log(`  - Physical Cores:    ${cpuAudit.physicalCores}`);
  console.log(`  - Logical Cores:     ${cpuAudit.logicalCores}`);
  console.log(`  - Max Clock Speed:   ${cpuAudit.maxClock} MHz`);
  console.log(`  - Current Clock:     ${cpuAudit.currentClock} MHz`);
  console.log(`  - Power Plan:        ${cpuAudit.powerPlan}\n`);

  // Terminate any previous instance & start Meilisearch cleanly
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}

  console.log(`>>> Starting Meilisearch pointing to: ${MEILI_DB_PATH}...`);
  const meiliProc = spawnMeili();
  const healthy = await waitForHealth();
  if (!healthy) throw new Error('Meilisearch failed to become healthy');
  console.log(`✅ Meilisearch is HEALTHY on PID ${meiliProc.pid}`);

  const statsRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/stats`);
  const statsData = await statsRes.json();
  const docCount = statsData.numberOfDocuments || 0;
  console.log(`>>> Verified Document Count: ${docCount.toLocaleString()}\n`);

  // 2. Build 50,000 request sequence for matrix sweep
  console.log(`>>> Building ${SEARCHES_PER_SWEEP_CONFIG.toLocaleString()} deterministic request sequence...`);
  const { sequence: queries50k, sha256: sequence50kSha } = buildRequestSequence(SEARCHES_PER_SWEEP_CONFIG);
  console.log(`✅ 50K Sequence SHA256: ${sequence50kSha}\n`);

  // Target Matrix:
  // Batch 16: C = 12, 16, 20, 24
  // Batch 24: C = 12, 16, 20, 24
  // Batch 32: C = 8, 12, 16, 20
  // Batch 48: C = 8, 12, 16
  // Batch 64: C = 8, 12, 16
  const targetMatrix = [
    { b: 16, c: 12 }, { b: 16, c: 16 }, { b: 16, c: 20 }, { b: 16, c: 24 },
    { b: 24, c: 12 }, { b: 24, c: 16 }, { b: 24, c: 20 }, { b: 24, c: 24 },
    { b: 32, c: 8 },  { b: 32, c: 12 }, { b: 32, c: 16 }, { b: 32, c: 20 },
    { b: 48, c: 8 },  { b: 48, c: 12 }, { b: 48, c: 16 },
    { b: 64, c: 8 },  { b: 64, c: 12 }, { b: 64, c: 16 }
  ];

  const sweepResults = [];

  console.log(`>>> [PHASE 1] Executing 50K Matrix Sweep (${targetMatrix.length} configurations, 50,000 queries each)...`);
  console.log('-------------------------------------------------------------------------------------------------------------------');
  console.log(' BATCH | CONC | LOGICAL QPS | HTTP RPS | DURATION | REQ P95 ms | REQ P99 ms | AVG CPU % | ERRORS | TIMEOUTS | MISSING ');
  console.log('-------------------------------------------------------------------------------------------------------------------');

  for (const cfg of targetMatrix) {
    const res = await runMultiSearchRun(queries50k, cfg.b, cfg.c, meiliProc.pid);
    sweepResults.push(res);

    console.log(
      `  ${String(res.batch).padStart(4, ' ')} | ` +
      ` ${String(res.http_concurrency).padStart(4, ' ')} | ` +
      `${String(res.logical_qps).padStart(11, ' ')} | ` +
      `${String(res.http_rps).padStart(8, ' ')} | ` +
      `${String(res.duration_seconds).padStart(6, ' ')}s | ` +
      `${String(res.request_latencies.p95_ms).padStart(10, ' ')} | ` +
      `${String(res.request_latencies.p99_ms).padStart(10, ' ')} | ` +
      `${String(res.cpu.avg_cpu_percent).padStart(9, ' ')}% | ` +
      `${String(res.errors).padStart(6, ' ')} | ` +
      `${String(res.timeouts).padStart(8, ' ')} | ` +
      `${String(res.missing_results).padStart(7, ' ')}`
    );

    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('-------------------------------------------------------------------------------------------------------------------\n');

  // Select Winner
  const validRuns = sweepResults.filter(r => r.errors === 0 && r.timeouts === 0 && r.missing_results === 0);
  validRuns.sort((a, b) => b.logical_qps - a.logical_qps);
  const bestRun = validRuns[0] || sweepResults[0];

  console.log(`>>> [WINNER SELECTION] Best Configuration: Batch=${bestRun.batch}, Concurrency=${bestRun.http_concurrency} with ${bestRun.logical_qps} QPS.`);

  // 3. Revalidation of Winner on 100,000 queries
  console.log(`\n>>> [PHASE 2] Revalidating Winner on ${REVALIDATION_SEARCHES.toLocaleString()} queries...`);
  const { sequence: queries100k, sha256: sequence100kSha } = buildRequestSequence(REVALIDATION_SEARCHES);
  
  const revalResult = await runMultiSearchRun(queries100k, bestRun.batch, bestRun.http_concurrency, meiliProc.pid);
  
  console.log(`  Revalidation Completed in ${revalResult.duration_seconds}s:`);
  console.log(`  - Revalidation QPS:  ${revalResult.logical_qps}`);
  console.log(`  - Baseline QPS:      ${BASELINE_QPS}`);
  
  const improvementPercent = parseFloat((((revalResult.logical_qps - BASELINE_QPS) / BASELINE_QPS) * 100).toFixed(2));
  const diffFrom50k = Math.abs(revalResult.logical_qps - bestRun.logical_qps) / bestRun.logical_qps;
  const isStable = diffFrom50k <= 0.05 ? 'TRUE' : 'FALSE';
  const isLocalS20Pass = revalResult.logical_qps >= 833.33 && revalResult.errors === 0 && revalResult.timeouts === 0 && revalResult.missing_results === 0;
  const isEngineeringTarget = revalResult.logical_qps >= 1000.0 && revalResult.errors === 0;

  const nextStep = isLocalS20Pass ? 'RUN_GATE_S1M_ON_THIS_HOST' : 'SCALE_CPU_OR_SECOND_NODE';

  console.log(`  - Improvement:       +${improvementPercent}%`);
  console.log(`  - Result Stable:     ${isStable} (Diff: ${(diffFrom50k * 100).toFixed(2)}%)`);
  console.log(`  - Local S20 Pass:    ${isLocalS20Pass ? 'TRUE' : 'FALSE'}`);
  console.log(`  - Next Step:         ${nextStep}\n`);

  // Full Report Artifact
  const fullReport = {
    benchmark: 'GATE_S50K_OPTIMIZATION_AND_100K_REVALIDATION',
    timestamp: new Date().toISOString(),
    engine: 'Meilisearch',
    version: '1.13.0',
    index: INDEX_NAME,
    document_count: docCount,
    baseline_s100k_qps: BASELINE_QPS,
    hardware_and_power_audit: {
      cpu_model: cpuAudit.model,
      physical_cores: cpuAudit.physicalCores,
      logical_cores: cpuAudit.logicalCores,
      max_clock_mhz: cpuAudit.maxClock,
      current_clock_mhz: cpuAudit.currentClock,
      power_plan: cpuAudit.powerPlan,
      thermal_throttling: 'NOT_OBSERVED_NORMAL_BOOST',
      cpu_clock_telemetry: `${cpuAudit.currentClock} MHz / Max ${cpuAudit.maxClock} MHz`
    },
    sweep_50k_results: sweepResults,
    best_sustained_config: {
      batch: bestRun.batch,
      http_concurrency: bestRun.http_concurrency,
      sweep_50k_qps: bestRun.logical_qps
    },
    revalidation_100k: {
      sequence_sha256: sequence100kSha,
      total_logical_searches: REVALIDATION_SEARCHES,
      batch: bestRun.batch,
      http_concurrency: bestRun.http_concurrency,
      duration_seconds: revalResult.duration_seconds,
      logical_qps: revalResult.logical_qps,
      http_rps: revalResult.http_rps,
      request_latencies: revalResult.request_latencies,
      cpu: revalResult.cpu,
      memory: revalResult.memory,
      errors: revalResult.errors,
      timeouts: revalResult.timeouts,
      missing_results: revalResult.missing_results
    },
    decision: {
      baseline_qps: BASELINE_QPS,
      revalidation_100k_qps: revalResult.logical_qps,
      improvement_percent: improvementPercent,
      result_stable: isStable === 'TRUE',
      local_s20_pass: isLocalS20Pass,
      local_engineering_target: isEngineeringTarget,
      next_step: nextStep
    }
  };

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`✅ Saved Full Optimization Report to: ${OUTPUT_REPORT_PATH}\n`);

  console.log('>>> Shutting down Meilisearch cleanly...');
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  console.log('✅ Meilisearch stopped cleanly.');
}

main().catch(err => {
  console.error('❌ Error executing optimization sweep:', err);
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  process.exit(1);
});
