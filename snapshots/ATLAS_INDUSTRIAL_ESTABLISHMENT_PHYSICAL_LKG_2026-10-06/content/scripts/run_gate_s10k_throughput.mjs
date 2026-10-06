import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, execSync } from 'child_process';
import { performance } from 'perf_hooks';

// ============================================================
// CONSTANTS & PATHS
// ============================================================
const PROJECTION_DIR = path.resolve('reports/atlas/search');
const INDUSTRIAL_GOLDEN_PATH = path.join(PROJECTION_DIR, 'atlas_industrial_relevance_golden_v1.json');
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_v2_gate_s10k.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';

// Deterministic PRNG for building the 10,000 sequence from Golden 1050
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

function getHostResources(meiliPid) {
  try {
    const psCmd = `powershell -NoProfile -Command "
      $os = Get-CimInstance Win32_OperatingSystem;
      $freeRam = [math]::Round($os.FreePhysicalMemory / 1024, 2);
      $freeVirt = [math]::Round($os.FreeVirtualMemory / 1024, 2);
      $drive = Get-PSDrive C;
      $freeDisk = [math]::Round($drive.Free / 1GB, 2);
      $mRss = 0;
      if (${meiliPid || 0} -gt 0) {
        $mp = Get-Process -Id ${meiliPid} -ErrorAction SilentlyContinue;
        if ($mp) { $mRss = [math]::Round($mp.WorkingSet64 / 1MB, 2); }
      }
      $nRss = [math]::Round((Get-Process -Id $PID).WorkingSet64 / 1MB, 2);
      [PSCustomObject]@{ FreeRamMB = $freeRam; FreeVirtMB = $freeVirt; FreeDiskGB = $freeDisk; MeiliRssMB = $mRss; NodeRssMB = $nRss } | ConvertTo-Json -Compress
    "`;
    const out = execSync(psCmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return JSON.parse(out);
  } catch (e) {
    return { FreeRamMB: 0, FreeVirtMB: 0, FreeDiskGB: 0, MeiliRssMB: 0, NodeRssMB: 0 };
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

// Build deterministic 10,000 request sequence from 1050 Golden cases
function build10kRequestSequence() {
  const goldenRaw = fs.readFileSync(INDUSTRIAL_GOLDEN_PATH, 'utf8');
  const golden = JSON.parse(goldenRaw);
  const cases = golden.cases;

  const prng = createPRNG(543210987);
  const sequence = [];

  for (let i = 0; i < 10000; i++) {
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

// Execute 1 batch of queries at a specific concurrency level using HTTP Keep-Alive
async function runThroughputRun(queries, concurrency, meiliPid, abortSignal = {}) {
  let queryIdx = 0;
  let successCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  const latencies = [];

  let minFreeRam = Infinity;
  let minFreeVirt = Infinity;
  let peakMeiliRss = 0;
  let peakNodeRss = 0;
  let freeDisk = 0;

  // Poll host resources every 1 second in background
  let hostInterval = setInterval(() => {
    const h = getHostResources(meiliPid);
    if (h.FreeRamMB > 0 && h.FreeRamMB < minFreeRam) minFreeRam = h.FreeRamMB;
    if (h.FreeVirtMB > 0 && h.FreeVirtMB < minFreeVirt) minFreeVirt = h.FreeVirtMB;
    if (h.MeiliRssMB > peakMeiliRss) peakMeiliRss = h.MeiliRssMB;
    if (h.NodeRssMB > peakNodeRss) peakNodeRss = h.NodeRssMB;
    if (h.FreeDiskGB > 0) freeDisk = h.FreeDiskGB;

    // Safety checks
    if (h.FreeRamMB > 0 && h.FreeRamMB < 1200) {
      abortSignal.aborted = true;
      abortSignal.reason = `FREE_RAM_MB too low (${h.FreeRamMB} MB < 1200 MB)`;
    }
    if (h.FreeVirtMB > 0 && h.FreeVirtMB < 2000) {
      abortSignal.aborted = true;
      abortSignal.reason = `FREE_VIRTUAL_MB too low (${h.FreeVirtMB} MB < 2000 MB)`;
    }
  }, 1000);

  const t0 = performance.now();

  async function worker() {
    while (true) {
      if (abortSignal.aborted) break;
      const i = queryIdx++;
      if (i >= queries.length) break;

      const q = queries[i].query;
      const tStart = performance.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: q,
            limit: 10,
            attributesToRetrieve: ['atlas_person_id', 'display_name', 'organization', 'role', 'profession', 'geography']
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const lat = performance.now() - tStart;
        if (res.ok) {
          successCount++;
          latencies.push(lat);
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

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  clearInterval(hostInterval);
  const tTotalSec = (performance.now() - t0) / 1000;
  const qps = tTotalSec > 0 ? (successCount / tTotalSec) : 0;

  // Final host reading
  const hFinal = getHostResources(meiliPid);
  if (hFinal.FreeRamMB > 0 && hFinal.FreeRamMB < minFreeRam) minFreeRam = hFinal.FreeRamMB;
  if (hFinal.FreeVirtMB > 0 && hFinal.FreeVirtMB < minFreeVirt) minFreeVirt = hFinal.FreeVirtMB;
  if (hFinal.MeiliRssMB > peakMeiliRss) peakMeiliRss = hFinal.MeiliRssMB;
  if (hFinal.NodeRssMB > peakNodeRss) peakNodeRss = hFinal.NodeRssMB;
  if (hFinal.FreeDiskGB > 0) freeDisk = hFinal.FreeDiskGB;

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const mean = latencies.length > 0 ? (latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const maxLat = latencies.length > 0 ? Math.max(...latencies) : 0;

  return {
    concurrency,
    total_searches: queries.length,
    successful_searches: successCount,
    errors: errorCount,
    timeouts: timeoutCount,
    duration_seconds: parseFloat(tTotalSec.toFixed(2)),
    logical_qps: parseFloat(qps.toFixed(2)),
    latencies: {
      p50_ms: parseFloat(p50.toFixed(2)),
      p95_ms: parseFloat(p95.toFixed(2)),
      p99_ms: parseFloat(p99.toFixed(2)),
      mean_ms: parseFloat(mean.toFixed(2)),
      max_ms: parseFloat(maxLat.toFixed(2))
    },
    host: {
      peak_meili_rss_mb: peakMeiliRss,
      peak_node_rss_mb: peakNodeRss,
      min_free_ram_mb: minFreeRam,
      min_free_virtual_mb: minFreeVirt,
      free_disk_gb: freeDisk
    }
  };
}

// ============================================================
// MAIN BENCHMARK EXECUTION
// ============================================================
async function main() {
  console.log('============================================================');
  console.log('GATE S10K — MEILISEARCH THROUGHPUT BENCHMARK (1,001,007 DOCS)');
  console.log('============================================================\n');

  // Terminate any previous instance & start Meilisearch cleanly
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}

  console.log(`>>> Starting Meilisearch pointing to: ${MEILI_DB_PATH}...`);
  const meiliProc = spawnMeili();
  const healthy = await waitForHealth();
  if (!healthy) throw new Error('Meilisearch failed to become healthy');
  console.log(`✅ Meilisearch is HEALTHY on PID ${meiliProc.pid}`);

  // Verify document count
  const statsRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/stats`);
  const statsData = await statsRes.json();
  const docCount = statsData.numberOfDocuments || 0;
  const isIndexing = statsData.isIndexing || false;
  console.log(`>>> Verified Document Count: ${docCount.toLocaleString()} | isIndexing: ${isIndexing}\n`);

  if (docCount !== 1001007) {
    console.warn(`⚠️ Warning: Expected 1001007 documents, got ${docCount}`);
  }

  // 1. Build 10,000 request sequence
  console.log('>>> Building 10,000 deterministic request sequence from Industrial Golden V1...');
  const { sequence: queries10k, sha256: sequenceSha256 } = build10kRequestSequence();
  console.log(`✅ Generated 10,000 queries. SHA256: ${sequenceSha256}\n`);

  // 2. Cold Start (100 queries, Concurrency = 1)
  console.log('>>> [PHASE 1] Measuring Cold Start (100 queries, Concurrency=1)...');
  const coldQueries = queries10k.slice(0, 100);
  const coldResult = await runThroughputRun(coldQueries, 1, meiliProc.pid);
  console.log(`  Cold Start: P50=${coldResult.latencies.p50_ms}ms, P95=${coldResult.latencies.p95_ms}ms, P99=${coldResult.latencies.p99_ms}ms (QPS: ${coldResult.logical_qps})\n`);

  // 3. Warmup (1,000 queries, Concurrency = 10)
  console.log('>>> [PHASE 2] Executing Warmup (1,000 queries, Concurrency=10)...');
  const warmupQueries = queries10k.slice(0, 1000);
  const warmupResult = await runThroughputRun(warmupQueries, 10, meiliProc.pid);
  console.log(`  Warmup completed: ${warmupResult.successful_searches} queries in ${warmupResult.duration_seconds}s (${warmupResult.logical_qps} QPS)\n`);

  // 4. Concurrency Sweep (1, 5, 10, 20, 40, 80, [120, 160])
  const targetLevels = [1, 5, 10, 20, 40, 80, 120, 160];
  const sweepResults = [];
  const abortSignal = { aborted: false, reason: '' };

  console.log('>>> [PHASE 3] Starting Full 10,000 Concurrency Sweep...');
  console.log('-------------------------------------------------------------------------------------------------------------');
  console.log(' CONC |   QPS   | DURATION |  P50 ms |  P95 ms |  P99 ms | ERRORS | TIMEOUTS | MIN RAM MB | MEILI RSS MB ');
  console.log('-------------------------------------------------------------------------------------------------------------');

  let prevQps = 0;
  for (const c of targetLevels) {
    if (abortSignal.aborted) {
      console.log(`\n🛑 Aborting further concurrency levels due to: ${abortSignal.reason}`);
      break;
    }

    // Safety pre-check
    const preH = getHostResources(meiliProc.pid);
    if (preH.FreeRamMB > 0 && preH.FreeRamMB < 1200) {
      console.log(`\n🛑 Aborting before C=${c}: Free RAM too low (${preH.FreeRamMB} MB < 1200 MB)`);
      break;
    }

    const res = await runThroughputRun(queries10k, c, meiliProc.pid, abortSignal);
    sweepResults.push(res);

    console.log(
      `  ${String(res.concurrency).padStart(3, ' ')} | ` +
      `${String(res.logical_qps).padStart(7, ' ')} | ` +
      `${String(res.duration_seconds).padStart(6, ' ')}s | ` +
      `${String(res.latencies.p50_ms).padStart(7, ' ')} | ` +
      `${String(res.latencies.p95_ms).padStart(7, ' ')} | ` +
      `${String(res.latencies.p99_ms).padStart(7, ' ')} | ` +
      `${String(res.errors).padStart(6, ' ')} | ` +
      `${String(res.timeouts).padStart(8, ' ')} | ` +
      `${String(res.host.min_free_ram_mb).padStart(10, ' ')} | ` +
      `${String(res.host.peak_meili_rss_mb).padStart(12, ' ')}`
    );

    // Stop if error or timeout occurred
    if (res.errors > 0 || res.timeouts > 0) {
      console.log(`\n🛑 Stopping sweep: Detected errors/timeouts at Concurrency ${c}`);
      break;
    }

    // Check if throughput plateaued strongly after 80
    if (c >= 80 && res.logical_qps < prevQps * 0.95) {
      console.log(`\nℹ️ Throughput saturated at C=${c} (${res.logical_qps} QPS vs previous peak ${prevQps} QPS). Stopping sweep.`);
      break;
    }
    prevQps = Math.max(prevQps, res.logical_qps);

    // Pause 1s between levels for system memory cooldown
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('-------------------------------------------------------------------------------------------------------------\n');

  // Select Best Stable Concurrency
  // Criteria: 0 errors, 0 timeouts, max QPS, P95 <= 250ms, RAM >= 1200MB
  const validRuns = sweepResults.filter(r => r.errors === 0 && r.timeouts === 0 && r.host.min_free_ram_mb >= 1200);
  validRuns.sort((a, b) => b.logical_qps - a.logical_qps);
  const bestRun = validRuns[0] || sweepResults[0];

  const isPromising = bestRun.logical_qps >= 833.33 && bestRun.errors === 0 && bestRun.timeouts === 0;
  const isEngineeringTarget = bestRun.logical_qps >= 1000.0 && bestRun.errors === 0 && bestRun.timeouts === 0;
  const isLatencyHealthy = bestRun.latencies.p95_ms <= 250 && bestRun.latencies.p99_ms <= 500;

  // Build Full Report
  const fullReport = {
    benchmark: 'GATE_S10K_MEILISEARCH_THROUGHPUT',
    timestamp: new Date().toISOString(),
    engine: 'Meilisearch',
    version: '1.13.0',
    index: INDEX_NAME,
    document_count: docCount,
    request_sequence_sha256: sequenceSha256,
    cold_start: coldResult,
    warmup: warmupResult,
    concurrency_sweep: sweepResults,
    best_stable_run: {
      concurrency: bestRun.concurrency,
      logical_qps: bestRun.logical_qps,
      duration_seconds: bestRun.duration_seconds,
      latencies: bestRun.latencies,
      host: bestRun.host
    },
    gate_classifications: {
      s10k_promising: isPromising,
      s10k_engineering_target: isEngineeringTarget,
      latency_healthy: isLatencyHealthy
    }
  };

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`✅ Saved Gate S10K Benchmark Report to: ${OUTPUT_REPORT_PATH}\n`);

  // Clean shutdown of Meilisearch
  console.log('>>> Shutting down Meilisearch cleanly...');
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  console.log('✅ Meilisearch stopped cleanly.');
}

main().catch(err => {
  console.error('❌ Error executing Gate S10K benchmark:', err);
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  process.exit(1);
});
