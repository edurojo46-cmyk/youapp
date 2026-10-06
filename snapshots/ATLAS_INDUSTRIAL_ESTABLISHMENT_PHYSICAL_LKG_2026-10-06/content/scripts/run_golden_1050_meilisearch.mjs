import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { performance } from 'perf_hooks';

// ============================================================
// CONSTANTS & PATHS
// ============================================================
const PROJECTION_DIR = path.resolve('reports/atlas/search');
const GOLDEN_SET_PATH = path.join(PROJECTION_DIR, 'atlas_gate_s_golden_set.json');
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_v2_golden_1050.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';
const EXPECTED_DOC_COUNT = 1001007;

// ============================================================
// HELPERS
// ============================================================
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function computeLatencyStats(latencies) {
  if (latencies.length === 0) return { p50_ms: 0, p95_ms: 0, p99_ms: 0, mean_ms: 0, max_ms: 0 };
  const sum = latencies.reduce((a, b) => a + b, 0);
  return {
    p50_ms: parseFloat(percentile(latencies, 50).toFixed(2)),
    p95_ms: parseFloat(percentile(latencies, 95).toFixed(2)),
    p99_ms: parseFloat(percentile(latencies, 99).toFixed(2)),
    mean_ms: parseFloat((sum / latencies.length).toFixed(2)),
    max_ms: parseFloat(Math.max(...latencies).toFixed(2))
  };
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

// ============================================================
// MAIN GOLDEN EVALUATION RUNNER
// ============================================================
async function main() {
  const startedAt = new Date().toISOString();
  console.log('============================================================');
  console.log('GOLDEN 1050 — MEILISEARCH V2 INDUSTRIAL QUALITY AUDIT');
  console.log(`Started at: ${startedAt}`);
  console.log('============================================================\n');

  // 1. Terminate previous instances and start Meilisearch
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}

  console.log(`>>> Starting Meilisearch pointing to: ${MEILI_DB_PATH}...`);
  const meiliProc = spawnMeili();
  const healthy = await waitForHealth();
  if (!healthy) {
    console.error('❌ Meilisearch failed to become healthy within timeout.');
    process.exit(1);
  }
  console.log(`✅ Meilisearch HEALTH = available on PID ${meiliProc.pid}`);

  // 2. Verify Exact Document Count
  const statsRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/stats`).then(r => r.json());
  const actualDocs = statsRes.numberOfDocuments || 0;
  const isIndexing = statsRes.isIndexing;

  console.log(`>>> Document Count: ${actualDocs.toLocaleString()} | isIndexing: ${isIndexing}`);
  if (actualDocs !== EXPECTED_DOC_COUNT) {
    console.error(`❌ FATAL: Document count is ${actualDocs}, expected exactly ${EXPECTED_DOC_COUNT}. ABORTING.`);
    meiliProc.kill();
    process.exit(1);
  }

  // 3. Load Golden Set
  if (!fs.existsSync(GOLDEN_SET_PATH)) {
    console.error(`❌ Golden set not found at ${GOLDEN_SET_PATH}`);
    meiliProc.kill();
    process.exit(1);
  }

  const rawGolden = JSON.parse(fs.readFileSync(GOLDEN_SET_PATH, 'utf8'));
  const goldenCases = rawGolden.cases || rawGolden;
  console.log(`>>> Loaded ${goldenCases.length} Golden test cases from ${GOLDEN_SET_PATH}\n`);

  // 4. Run Golden 1050 Queries
  const caseResults = [];
  const latencies = [];
  let passedCount = 0;
  let failedCount = 0;
  let errorsCount = 0;
  let timeoutsCount = 0;
  let duplicateCount = 0;
  let negativeFalsePositives = 0;
  const failuresList = [];

  const t0All = performance.now();

  for (let i = 0; i < goldenCases.length; i++) {
    const c = goldenCases[i];
    const q = (c.params?.query || '').trim();
    const limit = c.params?.limit || 10;
    const category = c.category || 'KNOWN_CANONICAL_MATCH';
    const isNegative = category === 'NEGATIVE_VERIFICATION' || category === 'NEGATIVE';
    const expectedPersonId = c.expected?.atlas_person_id || null;

    const t0 = performance.now();
    let hits = [];
    let errorMsg = null;
    let timedOut = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: q, limit: limit }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const sData = await res.json();
      hits = sData.hits || [];
    } catch (err) {
      if (err.name === 'AbortError') {
        timedOut = true;
        timeoutsCount++;
        errorMsg = 'TIMEOUT_EXCEEDED_5S';
      } else {
        errorsCount++;
        errorMsg = err.message;
      }
    }

    const elapsed = parseFloat((performance.now() - t0).toFixed(2));
    latencies.push(elapsed);

    // Check duplicates in hits
    const hitIds = hits.map(h => h.atlas_person_id || h.id);
    const hasDupes = new Set(hitIds).size !== hitIds.length;
    if (hasDupes) duplicateCount++;

    // Evaluate Pass / Fail
    let pass = false;
    let rank = null;
    let found = false;
    let failClassification = null;

    if (errorMsg) {
      pass = false;
      failClassification = 'ERROR';
    } else if (isNegative) {
      if (hits.length === 0) {
        pass = true;
      } else {
        pass = false;
        negativeFalsePositives++;
        failClassification = 'NEGATIVE_FALSE_POSITIVE';
      }
    } else {
      // Positive canonical case
      if (expectedPersonId) {
        const foundIdx = hitIds.indexOf(expectedPersonId);
        if (foundIdx !== -1) {
          found = true;
          rank = foundIdx + 1;
          pass = true;
        } else {
          found = false;
          pass = false;
          // Classify failure
          if (hits.length === 0) {
            failClassification = 'NOT_RETURNED';
          } else {
            failClassification = 'RANK_OUTSIDE_EXPECTED_WINDOW';
          }
        }
      } else {
        // Generic positive match (has hits)
        if (hits.length > 0) {
          pass = true;
          rank = 1;
          found = true;
        } else {
          pass = false;
          failClassification = 'NOT_RETURNED';
        }
      }
    }

    if (pass) {
      passedCount++;
    } else {
      failedCount++;
      failuresList.push({
        test_id: c.test_id,
        category: category,
        query: q,
        expected_atlas_person_id: expectedPersonId,
        expected_name: c.expected?.display_name || null,
        found_count: hits.length,
        found_ids: hitIds,
        rank: rank,
        latency_ms: elapsed,
        classification: failClassification,
        error: errorMsg
      });
    }

    caseResults.push({
      query_id: c.test_id,
      query_text: q,
      category: category,
      expected_atlas_person_id: expectedPersonId,
      found: found,
      rank: rank,
      latency_ms: elapsed,
      pass: pass,
      fail_classification: failClassification
    });

    if ((i + 1) % 200 === 0 || i === goldenCases.length - 1) {
      console.log(`  Progress: ${(i + 1).toString().padStart(4, ' ')} / ${goldenCases.length} | Passed: ${passedCount} | Failed: ${failedCount} | Current Avg Lat: ${(latencies.reduce((a,b)=>a+b,0)/latencies.length).toFixed(1)}ms`);
    }
  }

  const totalElapsedSec = parseFloat(((performance.now() - t0All) / 1000).toFixed(2));
  const stats = computeLatencyStats(latencies);
  const passRate = parseFloat(((passedCount / goldenCases.length) * 100).toFixed(2));

  // Determine Gate
  const isGatePass = (passedCount === goldenCases.length) && (errorsCount === 0) && (timeoutsCount === 0) && (duplicateCount === 0) && (negativeFalsePositives === 0);
  const goldenGate = isGatePass ? 'PASS' : 'FAIL';

  // Classification summary of failures
  const failureTypeCounts = {};
  failuresList.forEach(f => {
    failureTypeCounts[f.classification] = (failureTypeCounts[f.classification] || 0) + 1;
  });

  const finalReport = {
    benchmark: 'GOLDEN_1050_MEILISEARCH_V2',
    timestamp: new Date().toISOString(),
    engine: 'Meilisearch',
    version: '1.x (Native Windows)',
    index: INDEX_NAME,
    document_count: actualDocs,
    total_cases: goldenCases.length,
    passed: passedCount,
    failed: failedCount,
    pass_rate: `${passRate}%`,
    errors: errorsCount,
    timeouts: timeoutsCount,
    duplicates: duplicateCount,
    negative_false_positives: negativeFalsePositives,
    latency_stats: stats,
    total_execution_seconds: totalElapsedSec,
    golden_gate: goldenGate,
    failure_classification_counts: failureTypeCounts,
    failures_sample: failuresList.slice(0, 20),
    all_case_results: caseResults
  };

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(finalReport, null, 2));

  console.log('\n============================================================');
  console.log(`🏁 GOLDEN 1050 RESULTS: ${goldenGate === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`DOCUMENT_COUNT = ${actualDocs.toLocaleString()}`);
  console.log(`GOLDEN_TOTAL = ${goldenCases.length}`);
  console.log(`GOLDEN_PASSED = ${passedCount}`);
  console.log(`GOLDEN_FAILED = ${failedCount}`);
  console.log(`PASS_RATE = ${passRate}%`);
  console.log(`ERRORS = ${errorsCount}`);
  console.log(`TIMEOUTS = ${timeoutsCount}`);
  console.log(`DUPLICATES = ${duplicateCount}`);
  console.log(`NEGATIVE_FALSE_POSITIVES = ${negativeFalsePositives}`);
  console.log(`P50_MS = ${stats.p50_ms} ms`);
  console.log(`P95_MS = ${stats.p95_ms} ms`);
  console.log(`P99_MS = ${stats.p99_ms} ms`);
  console.log(`MEAN_MS = ${stats.mean_ms} ms`);
  console.log(`MAX_MS = ${stats.max_ms} ms`);
  console.log(`GOLDEN_GATE = ${goldenGate}`);
  console.log(`Report written to: ${OUTPUT_REPORT_PATH}`);
  console.log('============================================================\n');

  // Terminate Meilisearch cleanly
  meiliProc.kill();
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ FATAL GOLDEN BENCHMARK ERROR:', err);
  process.exit(1);
});
