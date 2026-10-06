import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';
import os from 'node:os';

import dotenv from 'dotenv';
dotenv.config();

const MEILI_URL = process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const JSONL_PATH = 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl';

const BASE_SETTINGS = {
  searchableAttributes: [
    'display_name_normalized',
    'display_name',
    'search_text_normalized',
    'role',
    'profession',
    'organization'
  ],
  filterableAttributes: [
    'evidence_state',
    'geography',
    'province',
    'source_ids'
  ],
  rankingRules: [
    'words',
    'typo',
    'proximity',
    'attribute',
    'sort',
    'exactness'
  ],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 5,
      twoTypos: 9
    },
    disableOnWords: [],
    disableOnAttributes: []
  },
  pagination: {
    maxTotalHits: 1000
  }
};

async function meiliFetch(path, options = {}) {
  const headers = {
    'Authorization': `Bearer ${MEILI_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(`${MEILI_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Meili Error [${res.status} ${res.statusText}]: ${txt}`);
  }
  return res.json();
}

async function waitForTask(taskUid) {
  while (true) {
    const task = await meiliFetch(`/tasks/${taskUid}`);
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed' || task.status === 'canceled') {
      throw new Error(`Task ${taskUid} ended with status ${task.status}: ${JSON.stringify(task.error)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

async function waitForAllTasks(taskUids) {
  const completed = [];
  for (const uid of taskUids) {
    const t = await waitForTask(uid);
    completed.push(t);
  }
  return completed;
}

function parseDurationMs(durationStr) {
  if (!durationStr) return 0;
  // Format is ISO8601 like PT0.123S or PT1.234S or PT1M2.3S
  const match = durationStr.match(/PT(?:(\d+)M)?([\d.]+)S/);
  if (!match) return 0;
  const minutes = parseFloat(match[1] || '0');
  const seconds = parseFloat(match[2] || '0');
  return (minutes * 60 + seconds) * 1000;
}

function calculatePercentiles(arr) {
  if (arr.length === 0) return { p50: 0, p95: 0, avg: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const avg = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
  return { p50, p95, avg };
}

// Load documents slice from JSONL
async function loadSlice(startIdx, count) {
  console.log(`Loading ${count} docs starting at index ${startIdx} from JSONL...`);
  const docs = [];
  const fileStream = fs.createReadStream(JSONL_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let idx = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (idx >= startIdx && idx < startIdx + count) {
      docs.push(JSON.parse(line));
    }
    idx++;
    if (idx >= startIdx + count) break;
  }
  return docs;
}

async function setupIndex(indexUid, prefixSearchMode) {
  console.log(`Setting up index ${indexUid} (prefixSearch: ${prefixSearchMode})...`);
  // Delete if exists
  try {
    const delTask = await meiliFetch(`/indexes/${indexUid}`, { method: 'DELETE' });
    await waitForTask(delTask.taskUid);
  } catch (e) {
    // ignore 404
  }

  // Create
  const createRes = await meiliFetch('/indexes', {
    method: 'POST',
    body: JSON.stringify({ uid: indexUid, primaryKey: 'atlas_person_id' })
  });
  await waitForTask(createRes.taskUid);

  // Settings
  const settings = {
    ...BASE_SETTINGS,
    prefixSearch: prefixSearchMode
  };
  const setRes = await meiliFetch(`/indexes/${indexUid}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  await waitForTask(setRes.taskUid);
  console.log(`Index ${indexUid} configured successfully.`);
}

async function runBenchmark() {
  console.log('================================================================');
  console.log('⚡ ATLAS SEARCH: A/B BENCHMARK FOR PREFIXSEARCH');
  console.log('================================================================\n');

  // Load Base 50K and Delta 100K
  const baseDocs = await loadSlice(0, 50000);
  const deltaDocs = await loadSlice(50000, 100000);
  console.log(`Base Docs loaded: ${baseDocs.length} | Delta Docs loaded: ${deltaDocs.length}`);

  const testConfigs = [
    { name: 'INDEX_A_INDEXING_TIME', uid: 'atlas_shadow_a_indexing_time', mode: 'indexingTime' },
    { name: 'INDEX_B_PREFIX_DISABLED', uid: 'atlas_shadow_b_prefix_disabled', mode: 'disabled' }
  ];

  const results = {};

  for (const cfg of testConfigs) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`RUNNING BENCHMARK ON: ${cfg.name} (${cfg.mode})`);
    console.log(`----------------------------------------------------------------`);

    await setupIndex(cfg.uid, cfg.mode);

    // Populate Base 50K in chunks of 5000
    console.log(`Seeding 50K base documents into ${cfg.uid}...`);
    const seedTaskUids = [];
    for (let i = 0; i < baseDocs.length; i += 5000) {
      const chunk = baseDocs.slice(i, i + 5000);
      const res = await meiliFetch(`/indexes/${cfg.uid}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      seedTaskUids.push(res.taskUid);
    }
    await waitForAllTasks(seedTaskUids);
    console.log(`Base documents seeded.`);

    // Record stats prior to delta
    const preStats = await meiliFetch('/stats');
    const preDbSize = preStats.databaseSize;
    const preMem = process.memoryUsage().rss;

    // Run 100K Incremental Delta in batches of 5000
    console.log(`Posting 100,000 incremental delta documents into ${cfg.uid}...`);
    const deltaTaskUids = [];
    const tDeltaStart = performance.now();

    for (let i = 0; i < deltaDocs.length; i += 5000) {
      const chunk = deltaDocs.slice(i, i + 5000);
      const res = await meiliFetch(`/indexes/${cfg.uid}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      deltaTaskUids.push(res.taskUid);
    }

    const completedTasks = await waitForAllTasks(deltaTaskUids);
    const tDeltaEnd = performance.now();
    const wallSec = (tDeltaEnd - tDeltaStart) / 1000;

    const postStats = await meiliFetch('/stats');
    const postDbSize = postStats.databaseSize;
    const postMem = process.memoryUsage().rss;

    // Analyze task durations and queue wait
    const processingTimes = [];
    const queueWaits = [];

    for (const t of completedTasks) {
      const procMs = parseDurationMs(t.duration);
      processingTimes.push(procMs);
      const enqueuedAt = new Date(t.enqueuedAt).getTime();
      const startedAt = new Date(t.startedAt).getTime();
      queueWaits.push(Math.max(0, startedAt - enqueuedAt));
    }

    const procStats = calculatePercentiles(processingTimes);
    const waitStats = calculatePercentiles(queueWaits);

    const docsPerSec = deltaDocs.length / wallSec;
    const indexSizeDeltaBytes = postDbSize - preDbSize;
    const memDeltaMb = (postMem - preMem) / (1024 * 1024);

    console.log(`Completed ${cfg.name}:`);
    console.log(`  100K_INCREMENTAL_WALL_SEC : ${wallSec.toFixed(2)} s`);
    console.log(`  DOCS_SEC                  : ${docsPerSec.toFixed(2)} docs/s`);
    console.log(`  TASK_P50_MS               : ${procStats.p50.toFixed(1)} ms`);
    console.log(`  TASK_P95_MS               : ${procStats.p95.toFixed(1)} ms`);
    console.log(`  QUEUE_WAIT_P50_MS         : ${waitStats.p50.toFixed(1)} ms`);
    console.log(`  QUEUE_WAIT_P95_MS         : ${waitStats.p95.toFixed(1)} ms`);
    console.log(`  INDEX_SIZE_DELTA_MB       : ${(indexSizeDeltaBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  MEMORY_DELTA_MB           : ${memDeltaMb.toFixed(2)} MB`);

    results[cfg.name] = {
      prefixSearch: cfg.mode,
      delta_docs: deltaDocs.length,
      wall_sec: wallSec,
      docs_sec: docsPerSec,
      task_p50_ms: procStats.p50,
      task_p95_ms: procStats.p95,
      task_avg_ms: procStats.avg,
      queue_wait_p50_ms: waitStats.p50,
      queue_wait_p95_ms: waitStats.p95,
      index_size_delta_bytes: indexSizeDeltaBytes,
      memory_rss_mb: postMem / (1024 * 1024)
    };
  }

  const speedup = results['INDEX_B_PREFIX_DISABLED'].docs_sec / results['INDEX_A_INDEXING_TIME'].docs_sec;
  results.PREFIXSEARCH_SPEEDUP = speedup;

  console.log('\n================================================================');
  console.log(`PREFIXSEARCH_SPEEDUP: ${speedup.toFixed(2)}x`);
  console.log('================================================================\n');

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_search_prefix_ab_benchmark.json', JSON.stringify(results, null, 2));
  console.log('Report saved to reports/atlas/search/atlas_search_prefix_ab_benchmark.json');
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
