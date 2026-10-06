import dotenv from 'dotenv';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

function parseDurationMs(durationStr) {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT([\d.]+)S/);
  if (match) return parseFloat(match[1]) * 1000;
  return 0;
}

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0, max: 0, min: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    min: Number(sorted[0].toFixed(2))
  };
}

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 20));
  }
}

async function createIndex(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const task = await res.json();
  return await waitForMeiliTask(task.taskUid);
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.2 — MEILI SUBMISSION BATCH SIZE MATRIX');
  console.log('Testing: 1,000, 2,500, 5,000, 10,000, 25,000 docs/task');
  console.log('Cohort: 50,000 docs per configuration with 20 QPS concurrent queries');
  console.log('================================================================\n');

  const BATCH_SIZES = [1000, 2500, 5000, 10000, 25000];
  const WORKLOAD = 50000;

  // Pre-generate raw documents
  const allDocs = [];
  for (let i = 0; i < WORKLOAD; i++) {
    allDocs.push({
      atlas_person_id: `batch_doc_${i}`,
      source_id: 'batch_test',
      source_person_id: `SRC_${i}`,
      projection_version: 1,
      display_name: `Candidate Candidate_${i}`,
      display_name_normalized: `candidate candidate_${i}`,
      organization: 'ATLAS BATCH MATRIX S.A.',
      role: 'DIRECTOR',
      profession: 'Ingeniero',
      search_text_normalized: `candidate candidate_${i} director atlas batch matrix s.a.`,
      created_at: new Date().toISOString()
    });
  }

  const results = [];

  for (const batchSize of BATCH_SIZES) {
    console.log(`\n🔬 Testing Submission Batch Size: ${batchSize.toLocaleString()} docs/task...`);
    const indexUid = `atlas_v22_sub_batch_${batchSize}`;
    await createIndex(indexUid);

    let queryLatencies = [];
    let queryErrors = 0;
    let queryTimeouts = 0;
    let running = true;
    let peakRss = 0;

    // Concurrent Query Load (20 QPS)
    const queryPromise = (async () => {
      while (running) {
        const qStart = performance.now();
        try {
          const qRes = await fetch(`${MEILI_URL}/indexes/${indexUid}/search`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ q: 'Candidate', limit: 20 })
          });
          if (!qRes.ok) queryErrors++;
          else queryLatencies.push(performance.now() - qStart);
        } catch (e) {
          queryErrors++;
        }
        await new Promise(r => setTimeout(r, 50));
      }
    })();

    const taskQueueWaits = [];
    const taskProcessTimes = [];

    const tStart = performance.now();

    for (let c = 0; c < WORKLOAD; c += batchSize) {
      const chunk = allDocs.slice(c, c + batchSize);
      const postRes = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(chunk)
      });
      const postMeta = await postRes.json();
      const task = await waitForMeiliTask(postMeta.taskUid);

      const enqueuedAt = new Date(task.enqueuedAt).getTime();
      const startedAt = new Date(task.startedAt).getTime();
      const finishedAt = new Date(task.finishedAt).getTime();

      taskQueueWaits.push(Math.max(0, startedAt - enqueuedAt));
      const procMs = parseDurationMs(task.duration) || Math.max(0, finishedAt - startedAt);
      taskProcessTimes.push(procMs);

      const rss = process.memoryUsage().rss / (1024 * 1024);
      if (rss > peakRss) peakRss = rss;
    }

    const tEnd = performance.now();
    running = false;
    await queryPromise;

    const wallSec = (tEnd - tStart) / 1000;
    const visibleDocsSec = Number((WORKLOAD / wallSec).toFixed(2));

    const qwPct = calcPercentiles(taskQueueWaits);
    const procPct = calcPercentiles(taskProcessTimes);
    const qPct = calcPercentiles(queryLatencies);

    const record = {
      SUBMISSION_BATCH_SIZE: batchSize,
      TASKS_COUNT: Math.ceil(WORKLOAD / batchSize),
      WALL_SEC: Number(wallSec.toFixed(2)),
      VISIBLE_DOCS_SEC: visibleDocsSec,
      TASK_QUEUE_WAIT_P50_MS: qwPct.P50,
      TASK_QUEUE_WAIT_P95_MS: qwPct.P95,
      TASK_PROCESS_P50_MS: procPct.P50,
      TASK_PROCESS_P95_MS: procPct.P95,
      MEMORY_RSS_PEAK_MB: Number(peakRss.toFixed(2)),
      QUERY_P50_MS: qPct.P50,
      QUERY_P95_MS: qPct.P95,
      QUERY_P99_MS: qPct.P99,
      ERRORS: queryErrors,
      TIMEOUTS: queryTimeouts
    };

    results.push(record);
    console.log(`  Visible Rate: ${visibleDocsSec} docs/sec | Process P50: ${procPct.P50}ms | Queue Wait P50: ${qwPct.P50}ms | Query P95: ${qPct.P95}ms | Errors: ${queryErrors}`);

    // Cleanup index
    await fetch(`${MEILI_URL}/indexes/${indexUid}`, { method: 'DELETE', headers: HEADERS });
  }

  // Selection Logic: Highest throughput with stable task queue wait (<100ms) and query P95 (<150ms)
  const candidates = [...results].filter(r => r.ERRORS === 0 && r.TASK_QUEUE_WAIT_P95_MS <= 250);
  candidates.sort((a, b) => b.VISIBLE_DOCS_SEC - a.VISIBLE_DOCS_SEC);
  const bestBatch = candidates.length ? candidates[0] : results[0];

  const report = {
    TIMESTAMP: new Date().toISOString(),
    WORKLOAD_PER_CONFIG: WORKLOAD,
    SELECTED_BEST_BATCH: bestBatch.SUBMISSION_BATCH_SIZE,
    BEST_BATCH_SUMMARY: bestBatch,
    RESULTS: results
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v22_meili_batch_size_matrix.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 BEST MEILI SUBMISSION BATCH RESULT');
  console.log('================================================================');
  console.log(`BEST_MEILI_SUBMISSION_BATCH : ${report.SELECTED_BEST_BATCH} docs/task`);
  console.log(`VISIBLE_DOCS_SEC            : ${bestBatch.VISIBLE_DOCS_SEC} docs/sec`);
  console.log(`TASK_QUEUE_WAIT_P50/P95     : ${bestBatch.TASK_QUEUE_WAIT_P50_MS}ms / ${bestBatch.TASK_QUEUE_WAIT_P95_MS}ms`);
  console.log(`TASK_PROCESS_P50/P95        : ${bestBatch.TASK_PROCESS_P50_MS}ms / ${bestBatch.TASK_PROCESS_P95_MS}ms`);
  console.log(`QUERY SLA (P50/P95/P99)     : ${bestBatch.QUERY_P50_MS}ms / ${bestBatch.QUERY_P95_MS}ms / ${bestBatch.QUERY_P99_MS}ms`);
  console.log('Saved to reports/atlas/search/atlas_v22_meili_batch_size_matrix.json\n');
}

main().catch(err => {
  console.error('Meili submission batch matrix failed:', err);
  process.exit(1);
});
