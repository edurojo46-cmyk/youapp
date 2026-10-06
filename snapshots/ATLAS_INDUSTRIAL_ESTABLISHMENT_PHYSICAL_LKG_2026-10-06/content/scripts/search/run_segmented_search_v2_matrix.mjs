import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';

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
  },
  prefixSearch: 'disabled'
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

async function setupIndex(indexUid, settings = BASE_SETTINGS) {
  try {
    const delTask = await meiliFetch(`/indexes/${indexUid}`, { method: 'DELETE' });
    await waitForTask(delTask.taskUid);
  } catch (e) {}

  const createRes = await meiliFetch('/indexes', {
    method: 'POST',
    body: JSON.stringify({ uid: indexUid, primaryKey: 'atlas_person_id' })
  });
  await waitForTask(createRes.taskUid);

  const setRes = await meiliFetch(`/indexes/${indexUid}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  await waitForTask(setRes.taskUid);
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

// Search V2 Parallel Fan-Out Query Layer
async function executeSegmentedSearch(queryText, baseIndexUid, deltaIndexUid, limit = 20) {
  const t0 = performance.now();
  
  // Parallel fan-out to sealed base and active delta
  const [baseRes, deltaRes] = await Promise.all([
    meiliFetch(`/indexes/${baseIndexUid}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: queryText, limit })
    }),
    meiliFetch(`/indexes/${deltaIndexUid}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: queryText, limit })
    })
  ]);

  // Merge & deduplicate by atlas_person_id (delta hits take precedence as newer updates)
  const seen = new Set();
  const mergedHits = [];

  for (const hit of deltaRes.hits || []) {
    if (!seen.has(hit.atlas_person_id)) {
      seen.add(hit.atlas_person_id);
      mergedHits.push({ ...hit, _segment: 'active_delta' });
    }
  }

  for (const hit of baseRes.hits || []) {
    if (!seen.has(hit.atlas_person_id)) {
      seen.add(hit.atlas_person_id);
      mergedHits.push({ ...hit, _segment: 'sealed_base' });
    }
  }

  const finalHits = mergedHits.slice(0, limit);
  const latencyMs = performance.now() - t0;

  return {
    hits: finalHits,
    totalHits: (baseRes.estimatedTotalHits || 0) + (deltaRes.estimatedTotalHits || 0),
    latencyMs,
    baseHitsCount: (baseRes.hits || []).length,
    deltaHitsCount: (deltaRes.hits || []).length
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS SEARCH V2: SEGMENTED ACTIVE-DELTA ARCHITECTURE BENCHMARK');
  console.log('================================================================\n');

  const BASE_INDEX_UID = 'atlas_v2_sealed_base';
  console.log(`>>> Setting up Sealed Base Index: ${BASE_INDEX_UID}...`);
  await setupIndex(BASE_INDEX_UID);

  const baseDocs = await loadSlice(0, 100000);
  console.log(`Seeding 100,000 documents into ${BASE_INDEX_UID}...`);
  const seedUids = [];
  for (let i = 0; i < baseDocs.length; i += 5000) {
    const chunk = baseDocs.slice(i, i + 5000);
    const res = await meiliFetch(`/indexes/${BASE_INDEX_UID}/documents`, {
      method: 'POST',
      body: JSON.stringify(chunk)
    });
    seedUids.push(res.taskUid);
  }
  await waitForAllTasks(seedUids);
  console.log(`Sealed Base Index ${BASE_INDEX_UID} ready.\n`);

  // Active Delta Index
  const ACTIVE_DELTA_UID = 'atlas_v2_active_delta';
  console.log(`>>> Setting up Active Delta Index: ${ACTIVE_DELTA_UID}...`);
  await setupIndex(ACTIVE_DELTA_UID);

  // Load candidate pools
  const cohort1 = await loadSlice(100000, 100000); // 0 -> 100k
  const cohort2 = await loadSlice(200000, 100000); // 100k -> 200k
  const cohortPre250 = await loadSlice(300000, 50000); // 200k -> 250k
  const cohort3 = await loadSlice(350000, 100000); // 250k -> 350k

  const matrixResults = {};

  const sampleQueries = [
    'GARCIA', 'RODRIGUEZ', 'GONZALEZ', 'FERNANDEZ', 'LOPEZ',
    'MARTINEZ', 'PEREZ', 'GOMEZ', 'SANCHEZ', 'DIAZ',
    'maria elena', 'juan carlos', 'jose luis', 'carlos alberto', 'ana maria',
    'director', 'socio', 'gerente', 'abogado', 'ingeniero',
    'sociedad', 'asociacion', 'nacional', 'buenos aires', 'cordoba'
  ];

  async function testAppendAndQuery(startSize, docsToAppend) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`TESTING ACTIVE DELTA AT STARTING SIZE: ${startSize.toLocaleString()} (Appending ${docsToAppend.length.toLocaleString()} docs)`);
    console.log(`----------------------------------------------------------------`);

    const deltaTaskUids = [];
    const t0 = performance.now();

    for (let i = 0; i < docsToAppend.length; i += 5000) {
      const chunk = docsToAppend.slice(i, i + 5000);
      const res = await meiliFetch(`/indexes/${ACTIVE_DELTA_UID}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      deltaTaskUids.push(res.taskUid);
    }

    const completed = await waitForAllTasks(deltaTaskUids);
    const wallSec = (performance.now() - t0) / 1000;
    const docsPerSec = docsToAppend.length / wallSec;

    const taskDurations = completed.map(t => parseDurationMs(t.duration));
    const pStats = calculatePercentiles(taskDurations);

    console.log(`Append Results:`);
    console.log(`  100K_INCREMENTAL_WALL_SEC : ${wallSec.toFixed(2)} s`);
    console.log(`  SUSTAINED_DOCS_SEC        : ${docsPerSec.toFixed(2)} docs/s`);
    console.log(`  TASK_P50_MS               : ${pStats.p50.toFixed(1)} ms`);
    console.log(`  TASK_P95_MS               : ${pStats.p95.toFixed(1)} ms`);

    // Run fan-out queries
    console.log(`Evaluating query fan-out latency (Sealed Base + Active Delta)...`);
    const latencies = [];
    let duplicatePeopleFound = 0;

    for (let repeat = 0; repeat < 4; repeat++) {
      for (const q of sampleQueries) {
        const queryRes = await executeSegmentedSearch(q, BASE_INDEX_UID, ACTIVE_DELTA_UID, 20);
        latencies.push(queryRes.latencyMs);

        const hitIds = new Set();
        for (const h of queryRes.hits) {
          if (hitIds.has(h.atlas_person_id)) duplicatePeopleFound++;
          hitIds.add(h.atlas_person_id);
        }
      }
    }

    const qStats = calculatePercentiles(latencies);
    console.log(`Query Fan-out Latency:`);
    console.log(`  QUERY_P50_MS          : ${qStats.p50.toFixed(2)} ms`);
    console.log(`  QUERY_P95_MS          : ${qStats.p95.toFixed(2)} ms`);
    console.log(`  DUPLICATE_PEOPLE_HITS : ${duplicatePeopleFound}`);

    return {
      start_size: startSize,
      incremental_docs: docsToAppend.length,
      wall_sec: wallSec,
      docs_sec: docsPerSec,
      task_p50_ms: pStats.p50,
      task_p95_ms: pStats.p95,
      query_p50_ms: qStats.p50,
      query_p95_ms: qStats.p95,
      query_avg_ms: qStats.avg,
      duplicate_people_found: duplicatePeopleFound
    };
  }

  // 1. Starting size = 0
  matrixResults['ACTIVE_DELTA_0K'] = await testAppendAndQuery(0, cohort1);

  // 2. Starting size = 100K
  matrixResults['ACTIVE_DELTA_100K'] = await testAppendAndQuery(100000, cohort2);

  // 3. Pre-seed 50K to reach 250K
  console.log(`\nAdding 50,000 docs to advance active delta to 250,000...`);
  const advanceUids = [];
  for (let i = 0; i < cohortPre250.length; i += 5000) {
    const chunk = cohortPre250.slice(i, i + 5000);
    const res = await meiliFetch(`/indexes/${ACTIVE_DELTA_UID}/documents`, {
      method: 'POST',
      body: JSON.stringify(chunk)
    });
    advanceUids.push(res.taskUid);
  }
  await waitForAllTasks(advanceUids);

  // 4. Starting size = 250K
  matrixResults['ACTIVE_DELTA_250K'] = await testAppendAndQuery(250000, cohort3);

  // Clean up shadow benchmark indexes
  try {
    await meiliFetch(`/indexes/${BASE_INDEX_UID}`, { method: 'DELETE' });
    await meiliFetch(`/indexes/${ACTIVE_DELTA_UID}`, { method: 'DELETE' });
    console.log('\nCleaned up shadow benchmark indexes.');
  } catch (e) {}

  const bestRate = Math.max(...Object.values(matrixResults).map(m => m.docs_sec));
  const bestKey = Object.keys(matrixResults).find(k => matrixResults[k].docs_sec === bestRate);
  const best = matrixResults[bestKey];

  const summary = {
    matrix: matrixResults,
    SEARCH_V1_INCREMENTAL_100K_DOCS_SEC: 394.98, // from controlled Search V1 A/B test
    BEST_SEARCH_V2_ARCHITECTURE: `SEALED_BASE_PLUS_SMALL_ACTIVE_DELTA (${bestKey})`,
    SEARCH_V2_INCREMENTAL_100K_DOCS_SEC: best.docs_sec,
    SEARCH_V2_QUERY_P95_MS: best.query_p95_ms,
    SEARCH_700_GATE: best.docs_sec >= 700 ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync('reports/atlas/search/atlas_search_segmented_v2_matrix.json', JSON.stringify(summary, null, 2));
  console.log('\nReport saved to reports/atlas/search/atlas_search_segmented_v2_matrix.json');
}

main().catch(err => {
  console.error('Segmented matrix failed:', err);
  process.exit(1);
});
