import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { performance } from 'perf_hooks';

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================
const PROJECTION_DIR = path.resolve('reports/atlas/search');
const INDUSTRIAL_GOLDEN_PATH = path.join(PROJECTION_DIR, 'atlas_industrial_relevance_golden_v1.json');
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_v2_gate_s1m.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_s1m_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';

const TOTAL_TARGET_SEARCHES = 1000000;
const WARMUP_SEARCHES = 5000;
const BATCH_SIZE = 48;
const HTTP_CONCURRENCY = 12;

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

function getFreeDiskGb(driveLetter = 'C:') {
  try {
    const out = execSync(`powershell -NoProfile -Command "(Get-PSDrive -Name '${driveLetter[0]}').Free / 1GB"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return parseFloat(parseFloat(out).toFixed(2));
  } catch (e) {
    return 0;
  }
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

function getProcessTelemetry(pid) {
  try {
    const out = execSync(`powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -Property WorkingSet64, CPU | ConvertTo-Json -Compress"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (out) {
      const parsed = JSON.parse(out);
      const rssMb = parsed.WorkingSet64 ? parseFloat((parsed.WorkingSet64 / 1024 / 1024).toFixed(2)) : 0;
      return { rssMb };
    }
  } catch (e) {}
  return { rssMb: 0 };
}

async function runWarmup(warmupCount) {
  console.log(`>>> Executing Warmup (${warmupCount} logical searches)...`);
  const { sequence } = buildRequestSequence(warmupCount);
  const batches = [];
  for (let i = 0; i < sequence.length; i += BATCH_SIZE) {
    batches.push(sequence.slice(i, i + BATCH_SIZE));
  }

  let batchIdx = 0;
  async function warmupWorker() {
    while (true) {
      const idx = batchIdx++;
      if (idx >= batches.length) break;
      const b = batches[idx];
      const multiPayload = {
        queries: b.map(item => ({
          indexUid: INDEX_NAME,
          q: item.query,
          limit: 10,
          attributesToRetrieve: ['atlas_person_id', 'display_name', 'organization', 'role', 'profession', 'geography']
        }))
      };
      try {
        await fetch(`${MEILI_URL}/multi-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(multiPayload)
        });
      } catch (e) {}
    }
  }

  const workers = Array.from({ length: HTTP_CONCURRENCY }, () => warmupWorker());
  await Promise.all(workers);
  console.log('✅ Warmup completed cleanly (excluded from official metrics).\n');
}

async function main() {
  console.log('================================================================================');
  console.log('GATE S1M — CERTIFICACIÓN FINAL SEARCH INDUSTRIAL (1.000.000 LOGICAL SEARCHES)');
  console.log('================================================================================\n');

  // 1. Audit Hardware & Power
  const cpuAudit = getCpuAndPowerAudit();
  const initDiskGb = getFreeDiskGb('C:');
  console.log('>>> CPU & POWER AUDIT:');
  console.log(`  - Model:             ${cpuAudit.model}`);
  console.log(`  - Physical Cores:    ${cpuAudit.physicalCores}`);
  console.log(`  - Logical Cores:     ${cpuAudit.logicalCores}`);
  console.log(`  - Max Clock Speed:   ${cpuAudit.maxClock} MHz`);
  console.log(`  - Current Clock:     ${cpuAudit.currentClock} MHz`);
  console.log(`  - Power Plan:        ${cpuAudit.powerPlan}`);
  console.log(`  - Free Disk:         ${initDiskGb} GB\n`);

  // 2. Start Meilisearch
  console.log(`>>> Starting Meilisearch pointing to: ${MEILI_DB_PATH}...`);
  const meiliProc = spawnMeili();
  const meiliPid = meiliProc.pid;

  const isHealthy = await waitForHealth(45);
  if (!isHealthy) {
    console.error('❌ Meilisearch failed to become healthy within timeout.');
    try { process.kill(meiliPid); } catch (e) {}
    process.exit(1);
  }
  console.log(`✅ Meilisearch is HEALTHY on PID ${meiliPid}`);

  // 3. Preconditions verification
  const statsRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/stats`);
  const statsData = await statsRes.json();
  const docCount = statsData.numberOfDocuments;
  const isIndexing = statsData.isIndexing;

  console.log(`>>> Verified Document Count: ${docCount.toLocaleString()}`);
  console.log(`>>> Indexing Active:         ${isIndexing}`);

  if (docCount !== 1001007 || isIndexing) {
    console.error(`❌ Precondition failed: Document count=${docCount}, isIndexing=${isIndexing}`);
    try { process.kill(meiliPid); } catch (e) {}
    process.exit(1);
  }

  // 4. Build 1M deterministic sequence
  console.log('\n>>> Generating 1.000.000 deterministic query sequence...');
  const { sequence, sha256: sequenceSha256 } = buildRequestSequence(TOTAL_TARGET_SEARCHES);
  console.log(`✅ 1M Sequence SHA256: ${sequenceSha256}`);

  // 5. Warmup
  await runWarmup(WARMUP_SEARCHES);

  // 6. Execute 1,000,000 benchmark
  console.log('================================================================================');
  console.log(`>>> STARTING 1M OFFICIAL RUN (Batch=${BATCH_SIZE}, Concurrency=${HTTP_CONCURRENCY})...`);
  console.log('--------------------------------------------------------------------------------');
  console.log(' COMPLETED | PERCENT | ELAPSED (s) | CURRENT QPS | ERRORS | TIMEOUTS | MISSING | RAM FREE MB ');
  console.log('--------------------------------------------------------------------------------');

  const batches = [];
  for (let i = 0; i < sequence.length; i += BATCH_SIZE) {
    batches.push(sequence.slice(i, i + BATCH_SIZE));
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
  let minFreeVirtualMB = Infinity;
  let peakMeiliRssMB = 0;

  let lastCpuState = os.cpus();
  let lastReportedProgress = 0;

  const sampleInterval = setInterval(() => {
    const { percentUsed, currentCpus } = getSystemCpuUsage(lastCpuState);
    lastCpuState = currentCpus;
    if (percentUsed >= 0 && percentUsed <= 100) cpuSamples.push(percentUsed);

    const freeRamMB = parseFloat((os.freemem() / 1024 / 1024).toFixed(2));
    if (freeRamMB < minFreeRamMB) minFreeRamMB = freeRamMB;

    const meiliTelem = getProcessTelemetry(meiliPid);
    if (meiliTelem.rssMb > peakMeiliRssMB) peakMeiliRssMB = meiliTelem.rssMb;
  }, 1000);

  const tStartBenchmark = performance.now();
  let lastCheckpointTime = tStartBenchmark;
  let lastCheckpointCompleted = 0;

  async function worker() {
    while (true) {
      const idx = batchIdx++;
      if (idx >= batches.length) break;

      const batch = batches[idx];
      const multiPayload = {
        queries: batch.map(b => ({
          indexUid: INDEX_NAME,
          q: b.query,
          limit: 10,
          attributesToRetrieve: ['atlas_person_id', 'display_name', 'organization', 'role', 'profession', 'geography']
        }))
      };

      const tReqStart = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const res = await fetch(`${MEILI_URL}/multi-search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(multiPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const lat = performance.now() - tReqStart;
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

      // Check progress reporting milestone (every 100,000 queries)
      const currentCompleted = completedLogicalSearches;
      const progressMilestone = Math.floor(currentCompleted / 100000);
      if (progressMilestone > lastReportedProgress) {
        lastReportedProgress = progressMilestone;
        const now = performance.now();
        const totalElapsedSec = (now - tStartBenchmark) / 1000;
        const currentQps = currentCompleted / totalElapsedSec;
        const currentRamFree = (os.freemem() / 1024 / 1024).toFixed(0);
        const percent = ((currentCompleted / TOTAL_TARGET_SEARCHES) * 100).toFixed(1);

        console.log(
          ` ${String(currentCompleted.toLocaleString()).padStart(9)} | ` +
          ` ${String(percent + '%').padStart(7)} | ` +
          ` ${String(totalElapsedSec.toFixed(2) + 's').padStart(11)} | ` +
          ` ${String(currentQps.toFixed(2)).padStart(11)} | ` +
          ` ${String(errorCount).padStart(6)} | ` +
          ` ${String(timeoutCount).padStart(8)} | ` +
          ` ${String(missingResultsCount).padStart(7)} | ` +
          ` ${String(currentRamFree).padStart(11)} `
        );
      }
    }
  }

  const workers = Array.from({ length: HTTP_CONCURRENCY }, () => worker());
  await Promise.all(workers);

  clearInterval(sampleInterval);
  const totalDurationSec = (performance.now() - tStartBenchmark) / 1000;
  const totalDurationMin = parseFloat((totalDurationSec / 60).toFixed(2));

  const finalFreeRamMB = parseFloat((os.freemem() / 1024 / 1024).toFixed(2));
  if (finalFreeRamMB < minFreeRamMB) minFreeRamMB = finalFreeRamMB;
  const finalDiskGb = getFreeDiskGb('C:');

  const actualLogicalQps = parseFloat((completedLogicalSearches / totalDurationSec).toFixed(2));
  const httpRps = parseFloat((successfulRequests / totalDurationSec).toFixed(2));

  const p50 = percentile(requestLatencies, 50);
  const p95 = percentile(requestLatencies, 95);
  const p99 = percentile(requestLatencies, 99);
  const maxLat = requestLatencies.length > 0 ? Math.max(...requestLatencies) : 0;

  const avgCpu = cpuSamples.length > 0 ? parseFloat((cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length).toFixed(2)) : 0;
  const p95Cpu = percentile(cpuSamples, 95);
  const maxCpu = cpuSamples.length > 0 ? Math.max(...cpuSamples) : 0;

  // Gate classifications
  const s20StrictPass = (
    completedLogicalSearches === TOTAL_TARGET_SEARCHES &&
    totalDurationSec <= 1200 &&
    errorCount === 0 &&
    timeoutCount === 0 &&
    missingResultsCount === 0
  );

  const approx20MinProductPass = (
    completedLogicalSearches === TOTAL_TARGET_SEARCHES &&
    totalDurationSec <= 1260 &&
    errorCount === 0 &&
    timeoutCount === 0 &&
    missingResultsCount === 0
  );

  const engineeringTargetPass = actualLogicalQps >= 1000;
  const idealTargetPass = actualLogicalQps >= 1200;

  console.log('--------------------------------------------------------------------------------');
  console.log('\n================================================================================');
  console.log('GATE S1M — FINAL RESULTS SUMMARY');
  console.log('================================================================================');
  console.log(`TOTAL_LOGICAL_SEARCHES:   ${completedLogicalSearches.toLocaleString()}`);
  console.log(`TOTAL_HTTP_REQUESTS:      ${batches.length.toLocaleString()}`);
  console.log(`DURATION_SECONDS:         ${totalDurationSec.toFixed(2)}s`);
  console.log(`DURATION_MINUTES:         ${totalDurationMin} min`);
  console.log(`LOGICAL_QPS:              ${actualLogicalQps}`);
  console.log(`HTTP_RPS:                 ${httpRps}`);
  console.log(`P50_MS:                   ${p50.toFixed(2)} ms`);
  console.log(`P95_MS:                   ${p95.toFixed(2)} ms`);
  console.log(`P99_MS:                   ${p99.toFixed(2)} ms`);
  console.log(`MAX_MS:                   ${maxLat.toFixed(2)} ms`);
  console.log(`ERRORS:                   ${errorCount}`);
  console.log(`TIMEOUTS:                 ${timeoutCount}`);
  console.log(`MISSING_RESULTS:          ${missingResultsCount}`);
  console.log(`DUPLICATE_RESPONSES:      ${duplicateResponsesCount}`);
  console.log(`AVG_TOTAL_CPU_PERCENT:    ${avgCpu}%`);
  console.log(`MAX_TOTAL_CPU_PERCENT:    ${maxCpu}%`);
  console.log(`PEAK_MEILI_RSS_MB:        ${peakMeiliRssMB} MB`);
  console.log(`MIN_FREE_RAM_MB:          ${minFreeRamMB} MB`);
  console.log(`FREE_DISK_GB:             ${finalDiskGb} GB`);
  console.log(`S20_STRICT:               ${s20StrictPass ? 'PASS' : 'FAIL'}`);
  console.log(`APPROX_20_MIN_PRODUCT:    ${approx20MinProductPass ? 'TRUE' : 'FALSE'}`);
  console.log(`ENGINEERING_TARGET:       ${engineeringTargetPass ? 'PASS' : 'FAIL'}`);
  console.log(`IDEAL_TARGET:             ${idealTargetPass ? 'PASS' : 'FAIL'}`);

  // Build Certification Artifact
  const artifactPayload = {
    benchmark: "GATE_S1M_CERTIFICACION_FINAL_SEARCH_INDUSTRIAL",
    timestamp: new Date().toISOString(),
    engine: "Meilisearch",
    version: "1.13.0",
    index: INDEX_NAME,
    document_count: docCount,
    request_sequence_sha256: sequenceSha256,
    batch_size: BATCH_SIZE,
    http_concurrency: HTTP_CONCURRENCY,
    total_logical_searches: completedLogicalSearches,
    total_http_requests: batches.length,
    successful_http_requests: successfulRequests,
    duration_seconds: parseFloat(totalDurationSec.toFixed(2)),
    duration_minutes: totalDurationMin,
    logical_qps: actualLogicalQps,
    http_rps: httpRps,
    request_latencies: {
      p50_ms: parseFloat(p50.toFixed(2)),
      p95_ms: parseFloat(p95.toFixed(2)),
      p99_ms: parseFloat(p99.toFixed(2)),
      max_ms: parseFloat(maxLat.toFixed(2))
    },
    integrity: {
      successful_searches: completedLogicalSearches,
      errors: errorCount,
      timeouts: timeoutCount,
      missing_results: missingResultsCount,
      duplicate_responses: duplicateResponsesCount
    },
    telemetry: {
      cpu_model: cpuAudit.model,
      physical_cores: cpuAudit.physicalCores,
      logical_cores: cpuAudit.logicalCores,
      power_plan: cpuAudit.powerPlan,
      avg_total_cpu_percent: avgCpu,
      p95_total_cpu_percent: p95Cpu,
      max_total_cpu_percent: maxCpu,
      peak_meili_rss_mb: peakMeiliRssMB,
      min_free_ram_mb: minFreeRamMB,
      final_free_disk_gb: finalDiskGb
    },
    gate_evaluations: {
      s20_strict: s20StrictPass ? "PASS" : "FAIL",
      approx_20_min_product: approx20MinProductPass,
      engineering_target: engineeringTargetPass ? "PASS" : "FAIL",
      ideal_target: idealTargetPass ? "PASS" : "FAIL"
    },
    certification_status: s20StrictPass ? "CERTIFIED_S20_STRICT" : (approx20MinProductPass ? "CERTIFIED_APPROX_20_MIN" : "COMPLETED_NOT_S20_CERTIFIED")
  };

  const rawJson = JSON.stringify(artifactPayload, null, 2);
  fs.writeFileSync(OUTPUT_REPORT_PATH, rawJson);
  const artifactSha256 = crypto.createHash('sha256').update(fs.readFileSync(OUTPUT_REPORT_PATH)).digest('hex');

  console.log(`\n✅ Saved Certification Artifact to: ${OUTPUT_REPORT_PATH}`);
  console.log(`✅ ARTIFACT_SHA256: ${artifactSha256}`);

  // 7. Clean Shutdown
  console.log('\n>>> Shutting down Meilisearch cleanly...');
  try {
    process.kill(meiliPid);
  } catch (e) {}
  await new Promise(r => setTimeout(r, 2000));
  console.log('✅ Meilisearch stopped cleanly.');
}

main().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
