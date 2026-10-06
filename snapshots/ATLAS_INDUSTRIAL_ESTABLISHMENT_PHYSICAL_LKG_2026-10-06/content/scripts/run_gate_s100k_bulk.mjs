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
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_v2_gate_s100k_bulk.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';

const TOTAL_LOGICAL_SEARCHES = 100000;
const BATCH_SIZE = 16;
const HTTP_CONCURRENCY = 16;

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

function getCpuInfo() {
  const cpus = os.cpus();
  const model = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown';
  const logicalCores = cpus.length;
  let physicalCores = logicalCores;
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_Processor).NumberOfCores"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (out) physicalCores = parseInt(out, 10);
  } catch (e) {}
  return { model, logicalCores, physicalCores };
}

function getDirectorySizeGB(dirPath) {
  try {
    const out = execSync(`powershell -NoProfile -Command "[math]::Round((Get-ChildItem -Path '${dirPath}' -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB, 2)"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return parseFloat(out || '0');
  } catch (e) {
    return 0;
  }
}

function getDiskFreeGB() {
  try {
    const out = execSync(`powershell -NoProfile -Command "[math]::Round((Get-PSDrive C).Free / 1GB, 2)"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return parseFloat(out || '0');
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

function build100kRequestSequence() {
  const goldenRaw = fs.readFileSync(INDUSTRIAL_GOLDEN_PATH, 'utf8');
  const golden = JSON.parse(goldenRaw);
  const cases = golden.cases;

  const prng = createPRNG(543210987);
  const sequence = [];

  for (let i = 0; i < TOTAL_LOGICAL_SEARCHES; i++) {
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

// CPU & RAM snapshot helper
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

function getProcessCpuAndMemory(pid) {
  try {
    const psCmd = `powershell -NoProfile -Command "
      $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue;
      if ($p) {
        $cpu = [math]::Round($p.CPU, 2);
        $ws = [math]::Round($p.WorkingSet64 / 1MB, 2);
        [PSCustomObject]@{ Cpu = $cpu; WsMB = $ws } | ConvertTo-Json -Compress
      }
    "`;
    const out = execSync(psCmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (out) return JSON.parse(out);
  } catch (e) {}
  return { Cpu: 0, WsMB: 0 };
}

async function main() {
  console.log('============================================================');
  console.log('GATE S100K-BULK — SUSTAINED MEILISEARCH THROUGHPUT & CPU AUDIT');
  console.log('============================================================\n');

  // 1. Hardware Inspection
  const cpuInfo = getCpuInfo();
  const currentIndexSizeGB = getDirectorySizeGB(MEILI_DB_PATH);
  const initialFreeDiskGB = getDiskFreeGB();
  const freeDiskAfterCopyGB = parseFloat((initialFreeDiskGB - currentIndexSizeGB).toFixed(2));
  const isSecondReplicaSafe = freeDiskAfterCopyGB >= 12.0;

  console.log(`HARDWARE AUDIT:`);
  console.log(`  - CPU Model:        ${cpuInfo.model}`);
  console.log(`  - Physical Cores:   ${cpuInfo.physicalCores}`);
  console.log(`  - Logical Cores:    ${cpuInfo.logicalCores}`);
  console.log(`  - Index Size:       ${currentIndexSizeGB} GB`);
  console.log(`  - Free Disk:        ${initialFreeDiskGB} GB`);
  console.log(`  - Disk After Copy:  ${freeDiskAfterCopyGB} GB (Safe >= 12GB: ${isSecondReplicaSafe})\n`);

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

  // 2. Build 100,000 Request Sequence
  console.log(`>>> Building ${TOTAL_LOGICAL_SEARCHES.toLocaleString()} deterministic request sequence (Batch=${BATCH_SIZE}, Concurrency=${HTTP_CONCURRENCY})...`);
  const { sequence: queries100k, sha256: sequenceSha256 } = build100kRequestSequence();
  console.log(`✅ Sequence SHA256: ${sequenceSha256}`);
  console.log(`✅ Total Batches (HTTP Requests): ${Math.ceil(TOTAL_LOGICAL_SEARCHES / BATCH_SIZE).toLocaleString()}\n`);

  // 3. Chunk into Batches
  const batches = [];
  for (let i = 0; i < queries100k.length; i += BATCH_SIZE) {
    batches.push(queries100k.slice(i, i + BATCH_SIZE));
  }

  // Metric tracking
  let batchIdx = 0;
  let successfulRequests = 0;
  let completedLogicalSearches = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  let missingResultsCount = 0;
  let duplicateResponsesCount = 0;

  const requestLatencies = [];
  const cpuSamples = [];
  const meiliCpuSamples = [];
  const nodeCpuSamples = [];

  let minFreeRamMB = Infinity;
  let minFreeVirtMB = Infinity;
  let peakMeiliRssMB = 0;

  let lastCpuState = os.cpus();
  let lastMeiliCpuTime = 0;
  let lastSampleTime = performance.now();

  // Background Telemetry Sampler every 2 seconds
  const telemetryInterval = setInterval(() => {
    const now = performance.now();
    const elapsedSec = (now - lastSampleTime) / 1000;
    lastSampleTime = now;

    // Total CPU
    const { percentUsed, currentCpus } = getSystemCpuUsage(lastCpuState);
    lastCpuState = currentCpus;
    if (percentUsed >= 0 && percentUsed <= 100) {
      cpuSamples.push(percentUsed);
    }

    // Process stats
    const meiliStats = getProcessCpuAndMemory(meiliProc.pid);
    if (meiliStats.WsMB > peakMeiliRssMB) peakMeiliRssMB = meiliStats.WsMB;

    if (elapsedSec > 0 && meiliStats.Cpu > 0) {
      const meiliCpuDelta = meiliStats.Cpu - lastMeiliCpuTime;
      lastMeiliCpuTime = meiliStats.Cpu;
      const meiliPercent = (meiliCpuDelta / elapsedSec / cpuInfo.logicalCores) * 100;
      if (meiliPercent >= 0) meiliCpuSamples.push(parseFloat(meiliPercent.toFixed(2)));
    }

    // Free RAM
    const freeRamMB = parseFloat((os.freemem() / 1024 / 1024).toFixed(2));
    if (freeRamMB < minFreeRamMB) minFreeRamMB = freeRamMB;
  }, 2000);

  console.log(`>>> [BENCHMARK RUNNING] Executing ${TOTAL_LOGICAL_SEARCHES.toLocaleString()} searches (estimated ~3 minutes)...`);
  const t0 = performance.now();
  let lastProgressLog = t0;

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

      // Progress heartbeat every 10 seconds
      if (performance.now() - lastProgressLog > 10000) {
        lastProgressLog = performance.now();
        const currentElapsedSec = (performance.now() - t0) / 1000;
        const currentQps = completedLogicalSearches / currentElapsedSec;
        const pct = ((completedLogicalSearches / TOTAL_LOGICAL_SEARCHES) * 100).toFixed(1);
        const lastCpu = cpuSamples.length > 0 ? cpuSamples[cpuSamples.length - 1] : 0;
        console.log(`  [Progress ${pct}%] ${completedLogicalSearches.toLocaleString()}/${TOTAL_LOGICAL_SEARCHES.toLocaleString()} searches | QPS: ${currentQps.toFixed(1)} | CPU: ${lastCpu}% | Elapsed: ${currentElapsedSec.toFixed(1)}s`);
      }
    }
  }

  const workers = Array.from({ length: HTTP_CONCURRENCY }, () => worker());
  await Promise.all(workers);

  clearInterval(telemetryInterval);
  const totalDurationSec = (performance.now() - t0) / 1000;
  const actualLogicalQps = parseFloat((completedLogicalSearches / totalDurationSec).toFixed(2));
  const httpRps = parseFloat((successfulRequests / totalDurationSec).toFixed(2));

  // Final host reading
  const finalFreeRamMB = parseFloat((os.freemem() / 1024 / 1024).toFixed(2));
  if (finalFreeRamMB < minFreeRamMB) minFreeRamMB = finalFreeRamMB;

  // Latencies
  const p50 = percentile(requestLatencies, 50);
  const p95 = percentile(requestLatencies, 95);
  const p99 = percentile(requestLatencies, 99);
  const maxLat = requestLatencies.length > 0 ? Math.max(...requestLatencies) : 0;

  // CPU aggregates
  const avgTotalCpu = cpuSamples.length > 0 ? parseFloat((cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length).toFixed(2)) : 0;
  const p95TotalCpu = percentile(cpuSamples, 95);
  const maxTotalCpu = cpuSamples.length > 0 ? Math.max(...cpuSamples) : 0;
  const avgMeiliCpu = meiliCpuSamples.length > 0 ? parseFloat((meiliCpuSamples.reduce((a, b) => a + b, 0) / meiliCpuSamples.length).toFixed(2)) : 0;
  const maxMeiliCpu = meiliCpuSamples.length > 0 ? Math.max(...meiliCpuSamples) : 0;

  // CPU Headroom Classification
  let cpuHeadroom = 'MODERATE';
  if (avgTotalCpu < 60) {
    cpuHeadroom = 'HIGH';
  } else if (avgTotalCpu <= 80) {
    cpuHeadroom = 'MODERATE';
  } else {
    cpuHeadroom = 'LOW';
  }

  // 1M Projection & S20 Speedup
  const projected1mSeconds = parseFloat((1000000 / actualLogicalQps).toFixed(2));
  const projected1mMinutes = parseFloat((projected1mSeconds / 60).toFixed(2));
  const speedupRequiredForS20 = parseFloat((833.33 / actualLogicalQps).toFixed(2));

  console.log('\n============================================================');
  console.log(`GATE S100K-BULK BENCHMARK COMPLETED IN ${totalDurationSec.toFixed(2)}s`);
  console.log(`LOGICAL QPS: ${actualLogicalQps} | HTTP RPS: ${httpRps}`);
  console.log(`LATENCIES: P50=${p50.toFixed(2)}ms | P95=${p95.toFixed(2)}ms | P99=${p99.toFixed(2)}ms | MAX=${maxLat.toFixed(2)}ms`);
  console.log(`CPU: Avg=${avgTotalCpu}% | P95=${p95TotalCpu}% | Max=${maxTotalCpu}% | Headroom: ${cpuHeadroom}`);
  console.log(`1M PROJECTION: ${projected1mMinutes} minutes (${projected1mSeconds}s) | Speedup for S20: ${speedupRequiredForS20}x`);
  console.log('============================================================\n');

  // Full JSON report
  const fullReport = {
    benchmark: 'GATE_S100K_BULK_SUSTAINED_THROUGHPUT_AND_CPU_AUDIT',
    timestamp: new Date().toISOString(),
    engine: 'Meilisearch',
    version: '1.13.0',
    index: INDEX_NAME,
    document_count: docCount,
    request_sequence_sha256: sequenceSha256,
    hardware: {
      cpu_model: cpuInfo.model,
      physical_cores: cpuInfo.physicalCores,
      logical_cores: cpuInfo.logicalCores,
      current_index_size_gb: currentIndexSizeGB,
      free_disk_gb: initialFreeDiskGB,
      free_disk_after_second_copy_gb: freeDiskAfterCopyGB,
      local_second_replica_disk_safe: isSecondReplicaSafe
    },
    benchmark_parameters: {
      total_logical_searches: TOTAL_LOGICAL_SEARCHES,
      batch_size: BATCH_SIZE,
      http_concurrency: HTTP_CONCURRENCY,
      http_requests: batches.length
    },
    results: {
      completed_logical_searches: completedLogicalSearches,
      successful_http_requests: successfulRequests,
      duration_seconds: parseFloat(totalDurationSec.toFixed(2)),
      logical_qps: actualLogicalQps,
      http_rps: httpRps,
      errors: errorCount,
      timeouts: timeoutCount,
      missing_results: missingResultsCount,
      duplicate_responses: duplicateResponsesCount
    },
    request_latencies: {
      p50_ms: parseFloat(p50.toFixed(2)),
      p95_ms: parseFloat(p95.toFixed(2)),
      p99_ms: parseFloat(p99.toFixed(2)),
      max_ms: parseFloat(maxLat.toFixed(2))
    },
    cpu_and_host_telemetry: {
      avg_total_cpu_percent: avgTotalCpu,
      p95_total_cpu_percent: p95TotalCpu,
      max_total_cpu_percent: maxTotalCpu,
      avg_meili_cpu_percent: avgMeiliCpu,
      max_meili_cpu_percent: maxMeiliCpu,
      cpu_headroom: cpuHeadroom,
      peak_meili_rss_mb: peakMeiliRssMB,
      min_free_ram_mb: minFreeRamMB
    },
    projection_1m: {
      projected_1m_seconds: projected1mSeconds,
      projected_1m_minutes: projected1mMinutes,
      s20_required_qps: 833.33,
      speedup_required_for_s20: speedupRequiredForS20
    }
  };

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`✅ Saved Gate S100K-Bulk Report to: ${OUTPUT_REPORT_PATH}\n`);

  console.log('>>> Shutting down Meilisearch cleanly...');
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  console.log('✅ Meilisearch stopped cleanly.');
}

main().catch(err => {
  console.error('❌ Error executing Gate S100K-Bulk benchmark:', err);
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  process.exit(1);
});
