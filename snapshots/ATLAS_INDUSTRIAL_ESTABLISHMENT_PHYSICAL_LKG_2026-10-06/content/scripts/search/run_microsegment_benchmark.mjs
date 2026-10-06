import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
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
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (MEILI_KEY) {
    headers['Authorization'] = `Bearer ${MEILI_KEY}`;
  }
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
    await new Promise(r => setTimeout(r, 150));
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

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { p50: 0, p95: 0, p99: 0, avg: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    p95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    p99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    avg: Number((sorted.reduce((sum, v) => sum + v, 0) / sorted.length).toFixed(2))
  };
}

async function loadPublicationCohort(count = 100000, skip = 100000) {
  console.log(`Loading ${count.toLocaleString()} publication documents from JSONL (offset: ${skip.toLocaleString()})...`);
  const docs = [];
  const fileStream = fs.createReadStream(JSONL_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let idx = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (idx >= skip && idx < skip + count) {
      docs.push(JSON.parse(line));
    }
    idx++;
    if (idx >= skip + count) break;
  }
  console.log(`Loaded ${docs.length.toLocaleString()} documents into memory.`);
  return docs;
}

async function createSegmentIndex(indexUid, settings = BASE_SETTINGS) {
  try {
    const del = await meiliFetch(`/indexes/${indexUid}`, { method: 'DELETE' });
    await waitForTask(del.taskUid);
  } catch (_) {}

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

// Multi-segment parallel fan-out query
async function fanoutSearch(queryText, segmentUids, limit = 20) {
  const t0 = performance.now();
  const searchPromises = segmentUids.map(uid =>
    meiliFetch(`/indexes/${uid}/search`, {
      method: 'POST',
      body: JSON.stringify({ q: queryText, limit })
    }).catch(() => ({ hits: [] }))
  );

  const results = await Promise.all(searchPromises);
  const latencyMs = performance.now() - t0;

  // Deduplicate by atlas_person_id (last segment takes precedence as newest)
  const seen = new Set();
  const mergedHits = [];
  let duplicatesFound = 0;

  // Reverse iterate so newest segments come first
  for (let i = results.length - 1; i >= 0; i--) {
    for (const hit of (results[i].hits || [])) {
      if (seen.has(hit.atlas_person_id)) {
        duplicatesFound++;
      } else {
        seen.add(hit.atlas_person_id);
        mergedHits.push(hit);
      }
    }
  }

  return {
    hits: mergedHits.slice(0, limit),
    totalHits: results.reduce((acc, r) => acc + (r.estimatedTotalHits || 0), 0),
    latencyMs,
    duplicatesFound
  };
}

const REPRESENTATIVE_QUERIES = [
  // Exact names
  'GARCIA', 'RODRIGUEZ', 'GONZALEZ', 'FERNANDEZ', 'LOPEZ',
  // Normalized full names
  'maria elena', 'juan carlos', 'jose luis', 'carlos alberto', 'ana maria',
  // Prefix queries
  'garc', 'rodr', 'gonz', 'fern', 'lop',
  // Organizations
  'sociedad', 'asociacion', 'nacional', 'buenos aires', 'cordoba',
  // Roles
  'director', 'socio', 'gerente', 'presidente', 'apoderado',
  // Professions
  'abogado', 'ingeniero', 'contador', 'medico', 'arquitecto'
];

export async function runMicrosegmentBenchmark() {
  console.log('================================================================');
  console.log('⚡ SEARCH V2: MICROSEGMENT ARCHITECTURE BENCHMARK');
  console.log('Thresholds to test: 25K, 50K, 75K, 100K | Publication Cohort: 100,000');
  console.log('================================================================\n');

  const cohortDocs = await loadPublicationCohort(100000, 100000);
  const thresholds = [25000, 50000, 75000, 100000];
  const benchmarkResults = {};

  for (const threshold of thresholds) {
    const thresholdLabel = `${threshold / 1000}K`;
    console.log(`\n================================================================`);
    console.log(`🔬 TESTING MICROSEGMENT THRESHOLD: ${thresholdLabel} (${threshold} docs/segment)`);
    console.log(`================================================================`);

    // Plan segments for exactly 100,000 docs
    const segments = [];
    let remaining = cohortDocs.length;
    let segIdx = 0;
    while (remaining > 0) {
      const take = Math.min(remaining, threshold);
      const start = segIdx * threshold;
      segments.push({
        segIndex: segIdx + 1,
        uid: `atlas_v2_seg_${thresholdLabel.toLowerCase()}_${segIdx + 1}`,
        docs: cohortDocs.slice(start, start + take)
      });
      remaining -= take;
      segIdx++;
    }

    console.log(`Planned ${segments.length} segment(s):`);
    segments.forEach(s => console.log(`  - [${s.uid}]: ${s.docs.length.toLocaleString()} documents`));

    let totalSegmentCreationMs = 0;
    let totalIndexingMs = 0;
    let totalSealSwitchMs = 0;
    const activeSegmentUids = [];

    const tCohortStart = performance.now();

    for (const seg of segments) {
      console.log(`\n  ▶ Segment ${seg.segIndex}/${segments.length}: ${seg.uid} (${seg.docs.length.toLocaleString()} docs)`);

      // 1. Creation
      const tCreate0 = performance.now();
      await createSegmentIndex(seg.uid);
      const createMs = performance.now() - tCreate0;
      totalSegmentCreationMs += createMs;
      activeSegmentUids.push(seg.uid);

      // 2. Indexing
      const tIndex0 = performance.now();
      const taskUids = [];
      const CHUNK_SIZE = 5000;
      for (let i = 0; i < seg.docs.length; i += CHUNK_SIZE) {
        const chunk = seg.docs.slice(i, i + CHUNK_SIZE);
        const res = await meiliFetch(`/indexes/${seg.uid}/documents`, {
          method: 'POST',
          body: JSON.stringify(chunk)
        });
        taskUids.push(res.taskUid);
      }
      await waitForAllTasks(taskUids);
      const indexMs = performance.now() - tIndex0;
      totalIndexingMs += indexMs;

      // 3. Seal / Switch Cost
      const tSeal0 = performance.now();
      // Seal verification: read index stats to confirm document count
      const stats = await meiliFetch(`/indexes/${seg.uid}/stats`);
      const sealMs = performance.now() - tSeal0;
      totalSealSwitchMs += sealMs;

      console.log(`    Segment Creation : ${createMs.toFixed(1)} ms`);
      console.log(`    Indexing Time    : ${indexMs.toFixed(1)} ms (${(seg.docs.length / (indexMs / 1000)).toFixed(1)} docs/sec)`);
      console.log(`    Seal / Switch    : ${sealMs.toFixed(1)} ms (Confirmed ${stats.numberOfDocuments.toLocaleString()} docs)`);
    }

    const tCohortEnd = performance.now();
    const totalWallMs = tCohortEnd - tCohortStart;
    const totalWallSec = Number((totalWallMs / 1000).toFixed(2));
    const sustainedDocsSec = Number((cohortDocs.length / totalWallSec).toFixed(2));

    console.log(`\n  📊 Publication Cohort Complete:`);
    console.log(`  TOTAL_100K_WALL_SEC  : ${totalWallSec} s`);
    console.log(`  SUSTAINED_DOCS_SEC   : ${sustainedDocsSec} docs/s`);
    console.log(`  SEGMENT_CREATION_MS  : ${totalSegmentCreationMs.toFixed(1)} ms`);
    console.log(`  INDEXING_MS          : ${totalIndexingMs.toFixed(1)} ms`);
    console.log(`  SEAL_SWITCH_MS       : ${totalSealSwitchMs.toFixed(1)} ms`);

    // 4. Query Fan-Out Evaluation
    console.log(`\n  🔍 Evaluating Multi-Segment Query Fan-Out (${activeSegmentUids.length} segments)...`);
    const queryLatencies = [];
    let totalVisibleDuplicates = 0;

    for (const q of REPRESENTATIVE_QUERIES) {
      const qRes = await fanoutSearch(q, activeSegmentUids, 20);
      queryLatencies.push(qRes.latencyMs);
      totalVisibleDuplicates += qRes.duplicatesFound;
    }

    const queryP = calcPercentiles(queryLatencies);
    console.log(`  QUERY_FANOUT_P50     : ${queryP.p50} ms`);
    console.log(`  QUERY_FANOUT_P95     : ${queryP.p95} ms`);
    console.log(`  VISIBLE_DUPLICATES   : ${totalVisibleDuplicates}`);

    // Verify document completeness across segments
    let totalIndexedDocs = 0;
    for (const uid of activeSegmentUids) {
      const stats = await meiliFetch(`/indexes/${uid}/stats`);
      totalIndexedDocs += stats.numberOfDocuments;
    }
    const missingDocs = cohortDocs.length - totalIndexedDocs;
    console.log(`  TOTAL_INDEXED_DOCS   : ${totalIndexedDocs.toLocaleString()}`);
    console.log(`  MISSING              : ${missingDocs}`);

    const thresholdResult = {
      THRESHOLD: thresholdLabel,
      SEGMENTS_COUNT: segments.length,
      TOTAL_100K_WALL_SEC: totalWallSec,
      SUSTAINED_DOCS_SEC: sustainedDocsSec,
      SEGMENT_CREATION_MS: Number(totalSegmentCreationMs.toFixed(2)),
      INDEXING_MS: Number(totalIndexingMs.toFixed(2)),
      SEAL_SWITCH_MS: Number(totalSealSwitchMs.toFixed(2)),
      QUERY_FANOUT_P50: queryP.p50,
      QUERY_FANOUT_P95: queryP.p95,
      VISIBLE_DUPLICATES: totalVisibleDuplicates,
      MISSING: missingDocs,
      SEARCH_700_GATE: sustainedDocsSec >= 700 ? 'PASS' : 'FAIL'
    };

    benchmarkResults[thresholdLabel] = thresholdResult;

    // Cleanup test indexes
    console.log(`  Cleaning up ${activeSegmentUids.length} test indexes...`);
    for (const uid of activeSegmentUids) {
      try {
        const del = await meiliFetch(`/indexes/${uid}`, { method: 'DELETE' });
        await waitForTask(del.taskUid);
      } catch (_) {}
    }
  }

  // Find best threshold
  const bestThresholdEntry = Object.entries(benchmarkResults).reduce((best, [k, v]) => {
    return v.SUSTAINED_DOCS_SEC > best.rate ? { threshold: k, rate: v.SUSTAINED_DOCS_SEC, data: v } : best;
  }, { threshold: '', rate: 0, data: null });

  const finalSummary = {
    TIMESTAMP: new Date().toISOString(),
    THRESHOLDS: benchmarkResults,
    BEST_SEARCH_SEGMENT_THRESHOLD: bestThresholdEntry.threshold,
    BEST_SUSTAINED_DOCS_SEC: bestThresholdEntry.rate,
    TARGET_700: 700,
    SEARCH_700_GATE: bestThresholdEntry.rate >= 700 ? 'PASS' : 'FAIL'
  };

  console.log('\n================================================================');
  console.log('🏆 SEARCH V2 MICROSEGMENT MATRIX SUMMARY');
  console.log('================================================================');
  for (const [th, r] of Object.entries(benchmarkResults)) {
    console.log(`Threshold: ${th.padEnd(5)} | Wall: ${r.TOTAL_100K_WALL_SEC}s | Rate: ${r.SUSTAINED_DOCS_SEC} docs/s | Q_P95: ${r.QUERY_FANOUT_P95}ms | Gate: ${r.SEARCH_700_GATE}`);
  }
  console.log(`\nBEST_SEARCH_SEGMENT_THRESHOLD: ${finalSummary.BEST_SEARCH_SEGMENT_THRESHOLD} (${finalSummary.BEST_SUSTAINED_DOCS_SEC} docs/s)`);
  console.log(`SEARCH_700_GATE              : ${finalSummary.SEARCH_700_GATE}`);
  console.log('================================================================\n');

  fs.writeFileSync(
    'reports/atlas/search/atlas_microsegment_benchmark.json',
    JSON.stringify(finalSummary, null, 2)
  );

  return finalSummary;
}

runMicrosegmentBenchmark().catch(err => {
  console.error('Microsegment benchmark failed:', err);
  process.exit(1);
});
