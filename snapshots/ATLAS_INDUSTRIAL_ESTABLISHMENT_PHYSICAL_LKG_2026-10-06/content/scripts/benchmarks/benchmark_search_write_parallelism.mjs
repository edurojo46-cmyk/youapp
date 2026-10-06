import dotenv from 'dotenv';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

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

async function runSubmissionLane({ indexUid, docs, batchSize }) {
  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const postRes = await fetch(`${MEILI_URL}/indexes/${indexUid}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(chunk)
    });
    const postMeta = await postRes.json();
    await waitForMeiliTask(postMeta.taskUid);
  }
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.2 — SEARCH WRITE PARALLELISM TEST');
  console.log('Comparing: 1 Submission Lane vs 2 Submission Lanes into Distinct Rotors');
  console.log('Cohort: 50,000 documents total per configuration');
  console.log('================================================================\n');

  const TOTAL_DOCS = 50000;
  const BATCH_SIZE = 5000;

  const docs = [];
  for (let i = 0; i < TOTAL_DOCS; i++) {
    docs.push({
      atlas_person_id: `wp_doc_${i}`,
      source_id: 'wp_test',
      source_person_id: `SRC_${i}`,
      projection_version: 1,
      display_name: `Candidate Candidate_${i}`,
      display_name_normalized: `candidate candidate_${i}`,
      organization: 'ATLAS PARALLEL S.A.',
      role: 'DIRECTOR',
      profession: 'Ingeniero',
      search_text_normalized: `candidate candidate_${i} director atlas parallel s.a.`,
      created_at: new Date().toISOString()
    });
  }

  // 1. Single Lane Benchmark
  console.log('🔬 Test 1: Single Lane (1 worker submitting 50,000 docs to 1 rotor)...');
  const index1 = 'atlas_v22_wp_single_lane';
  await createIndex(index1);

  const t1Start = performance.now();
  await runSubmissionLane({ indexUid: index1, docs, batchSize: BATCH_SIZE });
  const t1End = performance.now();
  const singleLaneWallSec = (t1End - t1Start) / 1000;
  const singleLaneRate = Number((TOTAL_DOCS / singleLaneWallSec).toFixed(2));
  console.log(`  Single Lane: ${singleLaneRate} docs/sec in ${singleLaneWallSec.toFixed(2)}s`);

  await fetch(`${MEILI_URL}/indexes/${index1}`, { method: 'DELETE', headers: HEADERS });

  // 2. Dual Lane Benchmark (2 workers submitting 25,000 docs each to distinct rotors)
  console.log('\n🔬 Test 2: Dual Lane (2 concurrent workers submitting 25,000 docs each to distinct rotors)...');
  const index2A = 'atlas_v22_wp_lane_a';
  const index2B = 'atlas_v22_wp_lane_b';
  await createIndex(index2A);
  await createIndex(index2B);

  const halfDocsA = docs.slice(0, TOTAL_DOCS / 2);
  const halfDocsB = docs.slice(TOTAL_DOCS / 2);

  const t2Start = performance.now();
  await Promise.all([
    runSubmissionLane({ indexUid: index2A, docs: halfDocsA, batchSize: BATCH_SIZE }),
    runSubmissionLane({ indexUid: index2B, docs: halfDocsB, batchSize: BATCH_SIZE })
  ]);
  const t2End = performance.now();
  const dualLaneWallSec = (t2End - t2Start) / 1000;
  const dualLaneRate = Number((TOTAL_DOCS / dualLaneWallSec).toFixed(2));
  console.log(`  Dual Lane: ${dualLaneRate} docs/sec in ${dualLaneWallSec.toFixed(2)}s`);

  await fetch(`${MEILI_URL}/indexes/${index2A}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${index2B}`, { method: 'DELETE', headers: HEADERS });

  const speedup = Number((dualLaneRate / singleLaneRate).toFixed(3));
  const parallelEffective = speedup >= 1.25;
  const writeParallelism = parallelEffective ? 2 : 1;

  const report = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_DOCS,
    BATCH_SIZE,
    SINGLE_LANE: {
      WALL_SEC: Number(singleLaneWallSec.toFixed(2)),
      VISIBLE_DOCS_SEC: singleLaneRate
    },
    DUAL_LANE: {
      WALL_SEC: Number(dualLaneWallSec.toFixed(2)),
      VISIBLE_DOCS_SEC: dualLaneRate
    },
    SPEEDUP_FACTOR: speedup,
    MEILI_WRITE_PARALLELISM: writeParallelism,
    VERDICT: parallelEffective
      ? 'PARALLEL_WRITES_VIABLE'
      : 'MEILISEARCH_SERIALIZES_WRITES_ACROSS_INDEXES'
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v22_write_parallelism_report.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 SEARCH WRITE PARALLELISM RESULT');
  console.log('================================================================');
  console.log(`SINGLE_LANE_RATE        : ${singleLaneRate} docs/sec`);
  console.log(`DUAL_LANE_RATE          : ${dualLaneRate} docs/sec`);
  console.log(`SPEEDUP_FACTOR          : ${speedup}x`);
  console.log(`MEILI_WRITE_PARALLELISM : ${writeParallelism}`);
  console.log(`VERDICT                 : ${report.VERDICT}`);
  console.log('Saved to reports/atlas/search/atlas_v22_write_parallelism_report.json\n');
}

main().catch(err => {
  console.error('Search write parallelism benchmark failed:', err);
  process.exit(1);
});
