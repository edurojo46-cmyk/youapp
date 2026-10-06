import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ResourceMonitor } from './atlas_stage3l_resource_monitor.mjs';

const MEILI_URL = 'http://127.0.0.1:7700';
const INDEX_UID = 'atlas_stage3l_mature_benchmark';
const BASELINE_POPULATION = 485781;

function parseDurationToMs(isoDuration) {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!match) return 0;
  const hours = parseFloat(match[1] || 0);
  const minutes = parseFloat(match[2] || 0);
  const seconds = parseFloat(match[3] || 0);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

async function waitForTask(taskUid) {
  const pollStart = performance.now();
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const task = await res.json();
    if (task.status === 'succeeded') {
      const queueMs = new Date(task.startedAt).getTime() - new Date(task.enqueuedAt).getTime();
      const indexMs = parseDurationToMs(task.duration);
      return {
        ok: true,
        queueMs: Math.max(0, queueMs),
        indexMs: indexMs > 0 ? indexMs : (performance.now() - pollStart),
        task
      };
    }
    if (task.status === 'failed') {
      throw new Error(`MEILI_TASK_FAILED: ${JSON.stringify(task.error)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

async function getDocCount() {
  const res = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/stats`);
  const stats = await res.json();
  return stats.numberOfDocuments;
}

// Generate representative production-schema benchmark documents
function generateBenchmarkDocs(count, runTag) {
  const docs = [];
  const baseNames = [
    'GONZALEZ JUAN CARLOS', 'RODRIGUEZ MARIA ELENA', 'GARCIA CARLOS ALBERTO',
    'MARTINEZ HECTOR OMAR', 'LOPEZ RICARDO HORACIO', 'PEREZ FERNANDO JAVIER',
    'FERNANDEZ SILVIA BEATRIZ', 'ALVAREZ HUGO DANIEL', 'ROMERO JORGE ARMANDO',
    'DIAZ PATRICIA NOEMI', 'BENZO FERNANDO OSVALDO', 'ROMAGNOLI ALBERTO VICENTE'
  ];

  for (let i = 0; i < count; i++) {
    const name = `${baseNames[i % baseNames.length]} BENCH ${i}`;
    const id = `bench_stage3l_${runTag}_${String(i).padStart(7, '0')}`;
    const cuitNum = 20000000000 + (i % 90000000);
    const cuitStr = String(cuitNum);

    docs.push({
      atlas_person_id: id,
      display_name: name,
      display_name_normalized: name,
      search_text_normalized: name,
      cuit_masked: `${cuitStr.slice(0, 2)}***${cuitStr.slice(-2)}`,
      entity_type: 'NATURAL_PERSON',
      source_id: 'BENCHMARK_PROD_SCHEMA_CLONE',
      source_record_id: `rec_bench_${id}`,
      source_surface_id: 'SURF_BENCH_STAGE3L',
      source_ids: ['BENCHMARK_PROD_SCHEMA_CLONE'],
      evidence_state: 'HIGH_CONFIDENCE_OFFICIAL_REGISTRY',
      geography: 'Argentina',
      province: 'Nacional',
      organization: 'NACIONAL',
      profession: 'PROFESSIONAL',
      role: 'CITIZEN',
      created_at: new Date().toISOString()
    });
  }
  return docs;
}

// Reset baseline by deleting all docs with IDs created during benchmark
async function resetBaseline(benchmarkIds) {
  console.log(`Resetting baseline: deleting ${benchmarkIds.length} benchmark documents...`);
  const chunkSize = 20000;
  for (let i = 0; i < benchmarkIds.length; i += chunkSize) {
    const chunk = benchmarkIds.slice(i, i + chunkSize);
    const delRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents/delete-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk)
    });
    const delTask = await delRes.json();
    await waitForTask(delTask.taskUid);
  }

  const currentCount = await getDocCount();
  console.log(`Document count after reset: ${currentCount} (Expected: ${BASELINE_POPULATION})`);
  if (currentCount !== BASELINE_POPULATION) {
    throw new Error(`BASELINE_RESET_FAILED: Current ${currentCount} !== ${BASELINE_POPULATION}`);
  }
}

async function runSingleBatchTest(testName, count, isBurst = false, burstSubCount = 0) {
  console.log(`\n----------------------------------------------------------------`);
  console.log(`🧪 RUNNING TEST: ${testName} (Docs: ${count}${isBurst ? ' BURST' : ''})`);
  console.log(`----------------------------------------------------------------`);

  // MANDATORY CONTROL 1: Check baseline before EVERY run
  const initialCount = await getDocCount();
  console.log(`BASELINE_DOC_COUNT_BEFORE_EACH_RUN = ${initialCount}`);
  if (initialCount !== BASELINE_POPULATION) {
    throw new Error(`PRE_TEST_BASELINE_INVALID: ${initialCount} !== ${BASELINE_POPULATION}`);
  }

  const runTag = `${testName.toLowerCase()}_${Date.now()}`;
  const docs = generateBenchmarkDocs(count, runTag);
  const benchmarkIds = docs.map(d => d.atlas_person_id);

  const monitor = new ResourceMonitor(19724);
  monitor.start(1000);

  const runT0 = performance.now();
  let taskResults = [];
  let totalSubmitMs = 0;

  if (isBurst) {
    const half = burstSubCount;
    const batch1 = docs.slice(0, half);
    const batch2 = docs.slice(half);

    const sub1T0 = performance.now();
    const p1 = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch1)
    });
    const t1 = await p1.json();
    const sub1Ms = performance.now() - sub1T0;

    const sub2T0 = performance.now();
    const p2 = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch2)
    });
    const t2 = await p2.json();
    const sub2Ms = performance.now() - sub2T0;

    totalSubmitMs = sub1Ms + sub2Ms;

    console.log(`Submitted burst tasks: [uid=${t1.taskUid}, docs=${batch1.length}], [uid=${t2.taskUid}, docs=${batch2.length}]`);
    const r1 = await waitForTask(t1.taskUid);
    const r2 = await waitForTask(t2.taskUid);
    taskResults = [r1, r2];
  } else {
    const subT0 = performance.now();
    const p = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const t = await p.json();
    totalSubmitMs = performance.now() - subT0;

    console.log(`Submitted single task: [uid=${t.taskUid}, docs=${docs.length}]`);
    const r = await waitForTask(t.taskUid);
    taskResults = [r];
  }

  const totalWallMs = performance.now() - runT0;
  const resourceSummary = monitor.stop();

  const totalTaskIndexMs = taskResults.reduce((sum, r) => sum + r.indexMs, 0);
  const totalQueueMs = taskResults.reduce((sum, r) => sum + r.queueMs, 0);

  const effectiveTaskDocsSec = Number((count / (totalTaskIndexMs / 1000)).toFixed(2));
  const effectiveWallDocsSec = Number((count / (totalWallMs / 1000)).toFixed(2));

  console.log(`Result: Task Index Time = ${(totalTaskIndexMs/1000).toFixed(2)}s (${effectiveTaskDocsSec} docs/sec) | Wall = ${(totalWallMs/1000).toFixed(2)}s (${effectiveWallDocsSec} docs/sec)`);
  console.log(`Resource Summary: Meili CPU Avg = ${resourceSummary.meili_cpu_percent_normalized_avg}%, Total CPU Avg = ${resourceSummary.total_cpu_normalized_avg}%, Meili RSS Max = ${resourceSummary.meili_rss_mb_max}MB, Disk Write Max = ${resourceSummary.disk_write_mbs_max}MB/s`);

  // Verify doc count before reset
  const postAppendCount = await getDocCount();
  console.log(`Post-append count: ${postAppendCount} (Expected: ${BASELINE_POPULATION + count})`);

  // MANDATORY CONTROL 1: Reset baseline back to 485,781
  await resetBaseline(benchmarkIds);

  return {
    test_name: testName,
    document_count: count,
    is_burst: isBurst,
    task_count: taskResults.length,
    baseline_doc_count_before: initialCount,
    baseline_doc_count_after: await getDocCount(),
    http_submit_ms: Number(totalSubmitMs.toFixed(1)),
    meili_queue_ms: Number(totalQueueMs.toFixed(1)),
    meili_task_index_ms: Number(totalTaskIndexMs.toFixed(1)),
    total_wall_ms: Number(totalWallMs.toFixed(1)),
    task_indexing_docs_sec: effectiveTaskDocsSec,
    wall_docs_sec: effectiveWallDocsSec,
    resources: resourceSummary
  };
}

export async function runMatureBatchMatrix() {
  console.log('================================================================');
  console.log(`🚀 STARTING MATURE INDEX BATCH MATRIX BENCHMARK`);
  console.log(`   Index: ${INDEX_UID}`);
  console.log(`   Required Fixed Baseline: ${BASELINE_POPULATION}`);
  console.log('================================================================\n');

  const matrixResults = [];

  // Shape 1: 1 x 20,000
  matrixResults.push(await runSingleBatchTest('1x20K', 20000));

  // Shape 2: 1 x 40,000
  matrixResults.push(await runSingleBatchTest('1x40K', 40000));

  // Shape 3: 1 x 80,000
  matrixResults.push(await runSingleBatchTest('1x80K', 80000));

  // Shape 4: 1 x 100,000 (with RAM guard)
  matrixResults.push(await runSingleBatchTest('1x100K', 100000));

  // Shape 5: 2 x 20,000 Burst
  matrixResults.push(await runSingleBatchTest('2x20K_BURST', 40000, true, 20000));

  // Shape 6: 2 x 40,000 Burst
  matrixResults.push(await runSingleBatchTest('2x40K_BURST', 80000, true, 40000));

  // Determine winner based on task_indexing_docs_sec
  const sorted = [...matrixResults].sort((a, b) => b.task_indexing_docs_sec - a.task_indexing_docs_sec);
  const winner = sorted[0];
  console.log(`\n🏆 WINNING BATCH SHAPE: ${winner.test_name} with ${winner.task_indexing_docs_sec} docs/sec!`);

  // Repeat winner 3 times for repeatability (MIN, MEDIAN, MAX)
  console.log(`\n================================================================`);
  console.log(`🔁 RUNNING 3 REPEATABILITY PROOFS FOR WINNER: ${winner.test_name}`);
  console.log('================================================================');

  const repeatabilityRuns = [];
  for (let r = 1; r <= 3; r++) {
    const isBurst = winner.is_burst;
    const subCount = isBurst ? (winner.document_count / 2) : 0;
    const repResult = await runSingleBatchTest(`${winner.test_name}_REP_${r}`, winner.document_count, isBurst, subCount);
    repeatabilityRuns.push(repResult);
  }

  const repRates = repeatabilityRuns.map(r => r.task_indexing_docs_sec).sort((a, b) => a - b);
  const minRate = repRates[0];
  const medianRate = repRates[1];
  const maxRate = repRates[2];

  console.log(`\nREPEATABILITY RESULTS for ${winner.test_name}:`);
  console.log(`   MIN:    ${minRate} docs/sec`);
  console.log(`   MEDIAN: ${medianRate} docs/sec`);
  console.log(`   MAX:    ${maxRate} docs/sec`);

  const artifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3L',
    mission: 'MATURE INDEX FIXED-BASELINE BATCH MATRIX V1',
    fixed_baseline_population: BASELINE_POPULATION,
    shapes_tested: matrixResults,
    winning_shape: {
      shape: winner.test_name,
      document_count: winner.document_count,
      is_burst: winner.is_burst,
      task_indexing_docs_sec: winner.task_indexing_docs_sec,
      wall_docs_sec: winner.wall_docs_sec
    },
    repeatability: {
      shape: winner.test_name,
      repeats: 3,
      rates_docs_sec: repRates,
      min_docs_sec: minRate,
      median_docs_sec: medianRate,
      max_docs_sec: maxRate,
      runs: repeatabilityRuns
    }
  };

  const artifactPath = path.resolve('reports/atlas/discovery/atlas_stage3l_mature_batch_matrix_v1.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`\n✔ Artifact saved: ${artifactPath}`);
  return artifact;
}

if (process.argv[1]?.includes('run_mature_batch_matrix.mjs')) {
  runMatureBatchMatrix().catch(err => {
    console.error('Batch matrix benchmark failed:', err);
    process.exit(1);
  });
}
