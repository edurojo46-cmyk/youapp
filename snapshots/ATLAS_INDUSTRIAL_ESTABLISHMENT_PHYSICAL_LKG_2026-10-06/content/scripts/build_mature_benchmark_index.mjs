import fs from 'node:fs';
import path from 'node:path';

const MEILI_URL = 'http://127.0.0.1:7700';
const SOURCE_INDEX = 'atlas_people_discovery_gate32_delta';
const TARGET_INDEX = 'atlas_stage3l_mature_benchmark';
const TARGET_DOCS = 485781;
const CHUNK_SIZE = 50000;

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
    await new Promise(r => setTimeout(r, 250));
  }
}

async function main() {
  console.log('================================================================');
  console.log(`🏗️  BUILDING ISOLATED MATURE BENCHMARK INDEX: ${TARGET_INDEX}`);
  console.log(`   Source Index: ${SOURCE_INDEX} (${TARGET_DOCS} documents)`);
  console.log(`   Target Population: ${TARGET_DOCS}`);
  console.log('================================================================\n');

  // 1. Delete if exists from previous run
  console.log(`Checking if index ${TARGET_INDEX} already exists...`);
  try {
    const delRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}`, { method: 'DELETE' });
    const delTask = await delRes.json();
    if (delTask.taskUid) {
      await waitForTask(delTask.taskUid);
      console.log(`Old index ${TARGET_INDEX} removed.`);
    }
  } catch {}

  // 2. Fetch source settings
  console.log(`Fetching settings from source ${SOURCE_INDEX}...`);
  const srcSettingsRes = await fetch(`${MEILI_URL}/indexes/${SOURCE_INDEX}/settings`);
  const srcSettings = await srcSettingsRes.json();

  // 3. Create target index with same primary key
  console.log(`Creating target index ${TARGET_INDEX} with primary key 'atlas_person_id'...`);
  const createRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: TARGET_INDEX, primaryKey: 'atlas_person_id' })
  });
  const createTask = await createRes.json();
  await waitForTask(createTask.taskUid);

  // 4. Apply exact settings
  console.log(`Applying exact settings to ${TARGET_INDEX}...`);
  const applySettingsRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(srcSettings)
  });
  const applyTask = await applySettingsRes.json();
  await waitForTask(applyTask.taskUid);
  console.log('✔ Target index created with identical settings.\n');

  // 5. Build Curve streaming
  const curveIncrements = [];
  let totalIndexed = 0;
  let offset = 0;
  let chunkIdx = 1;

  const totalBuildT0 = performance.now();

  while (offset < TARGET_DOCS) {
    const limit = Math.min(CHUNK_SIZE, TARGET_DOCS - offset);
    const chunkT0 = performance.now();

    // A. SOURCE_FETCH_TIME
    const fetchT0 = performance.now();
    const fetchRes = await fetch(`${MEILI_URL}/indexes/${SOURCE_INDEX}/documents?limit=${limit}&offset=${offset}`);
    const fetchJson = await fetchRes.json();
    const docs = fetchJson.results || fetchJson;
    const fetchMs = performance.now() - fetchT0;

    if (!Array.isArray(docs) || docs.length === 0) {
      throw new Error(`FETCH_EMPTY_AT_OFFSET_${offset}`);
    }

    // B. JSON_PREPARATION_TIME
    const prepT0 = performance.now();
    const payloadStr = JSON.stringify(docs);
    const prepMs = performance.now() - prepT0;

    // C. HTTP_SUBMIT_TIME
    const submitT0 = performance.now();
    const postRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadStr
    });
    const postTask = await postRes.json();
    const submitMs = performance.now() - submitT0;

    if (!postTask.taskUid) {
      throw new Error(`MEILI_POST_FAILED: ${JSON.stringify(postTask)}`);
    }

    // D. MEILI_QUEUE_TIME & MEILI_TASK_INDEX_TIME
    const taskResult = await waitForTask(postTask.taskUid);
    const queueMs = taskResult.queueMs;
    const indexMs = taskResult.indexMs;
    const chunkWallMs = performance.now() - chunkT0;

    totalIndexed += docs.length;
    offset += docs.length;

    const taskDocsSec = Number((docs.length / (indexMs / 1000)).toFixed(2));
    const wallDocsSec = Number((docs.length / (chunkWallMs / 1000)).toFixed(2));

    const incrementRecord = {
      chunk_index: chunkIdx++,
      chunk_docs: docs.length,
      population_start: totalIndexed - docs.length,
      population_end: totalIndexed,
      source_fetch_ms: Number(fetchMs.toFixed(1)),
      json_prep_ms: Number(prepMs.toFixed(1)),
      http_submit_ms: Number(submitMs.toFixed(1)),
      meili_queue_ms: Number(queueMs.toFixed(1)),
      meili_task_index_ms: Number(indexMs.toFixed(1)),
      total_chunk_wall_ms: Number(chunkWallMs.toFixed(1)),
      task_indexing_docs_sec: taskDocsSec,
      wall_docs_sec: wallDocsSec
    };

    curveIncrements.push(incrementRecord);

    console.log(`[Chunk ${incrementRecord.chunk_index}] Docs: ${docs.length} (Population: ${incrementRecord.population_start} -> ${incrementRecord.population_end}) | Task Index Time: ${(indexMs/1000).toFixed(2)}s (${taskDocsSec} docs/sec) | Wall: ${(chunkWallMs/1000).toFixed(2)}s (${wallDocsSec} docs/sec)`);
  }

  const totalBuildWallSec = (performance.now() - totalBuildT0) / 1000;
  const totalIndexTimeSec = curveIncrements.reduce((sum, c) => sum + c.meili_task_index_ms, 0) / 1000;
  const overallTaskDocsSec = Number((TARGET_DOCS / totalIndexTimeSec).toFixed(2));
  const overallWallDocsSec = Number((TARGET_DOCS / totalBuildWallSec).toFixed(2));

  // 6. Verify exact document parity
  const statsRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/stats`);
  const finalStats = await statsRes.json();

  console.log('\n================================================================');
  console.log('🏁 BUILD CURVE SUMMARY:');
  console.log(`   Final Document Count: ${finalStats.numberOfDocuments} / ${TARGET_DOCS}`);
  console.log(`   Total Indexing Duration: ${totalIndexTimeSec.toFixed(2)}s`);
  console.log(`   Total Wall Duration:     ${totalBuildWallSec.toFixed(2)}s`);
  console.log(`   Overall Indexing Rate:   ${overallTaskDocsSec} docs/sec`);
  console.log(`   Overall Wall Rate:       ${overallWallDocsSec} docs/sec`);
  console.log('================================================================\n');

  if (finalStats.numberOfDocuments !== TARGET_DOCS) {
    throw new Error(`PARITY_MISMATCH: ${finalStats.numberOfDocuments} !== ${TARGET_DOCS}`);
  }

  // 7. Write Fresh Rebuild artifact
  const stage3kProductionRate = 225.7; // certified Stage3K Phase B production rate
  const rebuildSpeedup = Number((overallTaskDocsSec / stage3kProductionRate).toFixed(2));
  const classification = rebuildSpeedup >= 1.5 
    ? 'INDEX_STATE_OR_FRAGMENTATION_EFFECT_PRESENT'
    : 'SIZE_SETTINGS_OR_HARDWARE_EFFECT_DOMINANT';

  const freshRebuildArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3L',
    mission: 'MATURE INDEX BUILD CURVE + FRESH REBUILD ANALYSIS',
    source_index: SOURCE_INDEX,
    target_index: TARGET_INDEX,
    baseline_population: TARGET_DOCS,
    chunk_size: CHUNK_SIZE,
    total_chunks: curveIncrements.length,
    build_curve_increments: curveIncrements,
    metrics: {
      total_documents: TARGET_DOCS,
      total_indexing_duration_sec: Number(totalIndexTimeSec.toFixed(2)),
      total_wall_duration_sec: Number(totalBuildWallSec.toFixed(2)),
      fresh_clone_indexing_docs_sec: overallTaskDocsSec,
      fresh_clone_wall_docs_sec: overallWallDocsSec,
      production_stage3k_effective_rate_docs_sec: stage3kProductionRate,
      fresh_rebuild_speedup_factor: rebuildSpeedup
    },
    classification,
    parity: {
      expected: TARGET_DOCS,
      actual: finalStats.numberOfDocuments,
      missing: 0,
      extra: 0,
      parity_exact: true
    }
  };

  const artifactPath = path.resolve('reports/atlas/discovery/atlas_stage3l_fresh_rebuild_comparison_v1.json');
  fs.writeFileSync(artifactPath, JSON.stringify(freshRebuildArtifact, null, 2));
  console.log(`✔ Artifact saved: ${artifactPath}`);
}

main().catch(err => {
  console.error('Build mature benchmark failed:', err);
  process.exit(1);
});
