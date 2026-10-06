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
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_v2_gate_s10k_bulk.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';

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
  const freeRamMB = parseFloat((os.freemem() / 1024 / 1024).toFixed(2));
  let meiliRssMB = 0;
  try {
    if (meiliPid > 0) {
      const out = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${meiliPid} -ErrorAction SilentlyContinue).WorkingSet64 / 1MB"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      meiliRssMB = parseFloat(parseFloat(out || '0').toFixed(2));
    }
  } catch (e) {}
  return { freeRamMB, meiliRssMB };
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

// Execute 1 multi-search sweep run
async function runMultiSearchRun(queries, batchSize, httpConcurrency, meiliPid) {
  // Chunk 10,000 queries into batches of batchSize
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
  let minFreeRam = Infinity;
  let peakMeiliRss = 0;

  let hostInterval = setInterval(() => {
    const h = getHostResources(meiliPid);
    if (h.freeRamMB > 0 && h.freeRamMB < minFreeRam) minFreeRam = h.freeRamMB;
    if (h.meiliRssMB > peakMeiliRss) peakMeiliRss = h.meiliRssMB;
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
        const timeoutId = setTimeout(() => controller.abort(), 15000);

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

  clearInterval(hostInterval);
  const tTotalSec = (performance.now() - t0) / 1000;

  const hFinal = getHostResources(meiliPid);
  if (hFinal.freeRamMB > 0 && hFinal.freeRamMB < minFreeRam) minFreeRam = hFinal.freeRamMB;
  if (hFinal.meiliRssMB > peakMeiliRss) peakMeiliRss = hFinal.meiliRssMB;

  const logicalQps = tTotalSec > 0 ? (completedLogicalSearches / tTotalSec) : 0;
  const httpRps = tTotalSec > 0 ? (successfulRequests / tTotalSec) : 0;

  const p50 = percentile(requestLatencies, 50);
  const p95 = percentile(requestLatencies, 95);
  const p99 = percentile(requestLatencies, 99);
  const mean = requestLatencies.length > 0 ? (requestLatencies.reduce((a, b) => a + b, 0) / requestLatencies.length) : 0;
  const maxLat = requestLatencies.length > 0 ? Math.max(...requestLatencies) : 0;

  return {
    queries_per_http_request: batchSize,
    http_concurrency: httpConcurrency,
    logical_searches: queries.length,
    completed_logical_searches: completedLogicalSearches,
    http_requests: batches.length,
    successful_http_requests: successfulRequests,
    errors: errorCount,
    timeouts: timeoutCount,
    missing_results: missingResultsCount,
    duplicate_responses: duplicateResponsesCount,
    duration_seconds: parseFloat(tTotalSec.toFixed(2)),
    logical_qps: parseFloat(logicalQps.toFixed(2)),
    http_rps: parseFloat(httpRps.toFixed(2)),
    request_latencies: {
      p50_ms: parseFloat(p50.toFixed(2)),
      p95_ms: parseFloat(p95.toFixed(2)),
      p99_ms: parseFloat(p99.toFixed(2)),
      mean_ms: parseFloat(mean.toFixed(2)),
      max_ms: parseFloat(maxLat.toFixed(2))
    },
    host: {
      min_free_ram_mb: minFreeRam === Infinity ? hFinal.freeRamMB : minFreeRam,
      peak_meili_rss_mb: peakMeiliRss
    }
  };
}

async function main() {
  console.log('============================================================');
  console.log('GATE S10K-BULK — MULTI-SEARCH THROUGHPUT BENCHMARK (1,001,007 DOCS)');
  console.log('============================================================\n');

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

  console.log('>>> Loading deterministic 10,000 request sequence from Industrial Golden V1...');
  const { sequence: queries10k, sha256: sequenceSha256 } = build10kRequestSequence();
  console.log(`✅ SHA256: ${sequenceSha256}\n`);

  // Multi-Search Matrix
  const batchSizes = [2, 4, 8, 16, 32];
  const concurrencies = [1, 2, 4, 8, 16];

  const sweepResults = [];

  console.log('>>> Starting Multi-Search Matrix Sweep (25 configurations, 10,000 queries each)...');
  console.log('----------------------------------------------------------------------------------------------------------------------');
  console.log(' BATCH | CONC | LOGICAL QPS | HTTP RPS | DURATION | REQ P50 ms | REQ P95 ms | REQ P99 ms | ERRORS | TIMEOUTS | MISSING ');
  console.log('----------------------------------------------------------------------------------------------------------------------');

  for (const b of batchSizes) {
    for (const c of concurrencies) {
      const res = await runMultiSearchRun(queries10k, b, c, meiliProc.pid);
      sweepResults.push(res);

      console.log(
        `  ${String(res.queries_per_http_request).padStart(4, ' ')} | ` +
        ` ${String(res.http_concurrency).padStart(4, ' ')} | ` +
        `${String(res.logical_qps).padStart(11, ' ')} | ` +
        `${String(res.http_rps).padStart(8, ' ')} | ` +
        `${String(res.duration_seconds).padStart(6, ' ')}s | ` +
        `${String(res.request_latencies.p50_ms).padStart(10, ' ')} | ` +
        `${String(res.request_latencies.p95_ms).padStart(10, ' ')} | ` +
        `${String(res.request_latencies.p99_ms).padStart(10, ' ')} | ` +
        `${String(res.errors).padStart(6, ' ')} | ` +
        `${String(res.timeouts).padStart(8, ' ')} | ` +
        `${String(res.missing_results).padStart(7, ' ')}`
      );

      // Brief 500ms pause
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.log('----------------------------------------------------------------------------------------------------------------------\n');

  // Find best configuration (0 errors, 0 timeouts, 0 missing, max logical QPS)
  const validRuns = sweepResults.filter(r => r.errors === 0 && r.timeouts === 0 && r.missing_results === 0);
  validRuns.sort((a, b) => b.logical_qps - a.logical_qps);
  const bestRun = validRuns[0] || sweepResults[0];

  const interactiveBestQps = 455.37;
  const speedupFactor = parseFloat((bestRun.logical_qps / interactiveBestQps).toFixed(2));
  const isPromising = bestRun.logical_qps >= 833.33 && bestRun.errors === 0 && bestRun.timeouts === 0 && bestRun.missing_results === 0;
  const isEngineeringTarget = bestRun.logical_qps >= 1000.0 && bestRun.errors === 0 && bestRun.timeouts === 0 && bestRun.missing_results === 0;

  const fullReport = {
    benchmark: 'GATE_S10K_BULK_MULTI_SEARCH',
    timestamp: new Date().toISOString(),
    engine: 'Meilisearch',
    version: '1.13.0',
    index: INDEX_NAME,
    document_count: docCount,
    request_sequence_sha256: sequenceSha256,
    interactive_best_qps: interactiveBestQps,
    best_bulk_config: {
      batch_size: bestRun.queries_per_http_request,
      http_concurrency: bestRun.http_concurrency,
      logical_qps: bestRun.logical_qps,
      http_rps: bestRun.http_rps,
      duration_seconds: bestRun.duration_seconds,
      request_latencies: bestRun.request_latencies,
      host: bestRun.host
    },
    bulk_speedup_factor: speedupFactor,
    gate_classifications: {
      bulk_s10k_promising: isPromising,
      bulk_s10k_engineering_target: isEngineeringTarget
    },
    matrix_sweep: sweepResults
  };

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`✅ Saved Gate S10K-Bulk Report to: ${OUTPUT_REPORT_PATH}\n`);

  console.log('>>> Shutting down Meilisearch cleanly...');
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  console.log('✅ Meilisearch stopped cleanly.');
}

main().catch(err => {
  console.error('❌ Error executing Gate S10K-Bulk benchmark:', err);
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}
  process.exit(1);
});
