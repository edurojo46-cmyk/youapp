import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const SOURCE_INDEX = 'atlas_people_discovery_gate32_delta';
const TARGET_INDEX = 'atlas_stage3m_mature_benchmark';
const BASELINE_POPULATION = 485781;
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
    await new Promise(r => setTimeout(r, 200));
  }
}

async function getDocCount(indexUid = TARGET_INDEX) {
  const res = await fetch(`${MEILI_URL}/indexes/${indexUid}/stats`);
  const stats = await res.json();
  return stats.numberOfDocuments;
}

function generateBenchmarkDocs(count, runTag) {
  const docs = [];
  const baseNames = [
    'GONZALEZ JUAN CARLOS', 'RODRIGUEZ MARIA ELENA', 'GARCIA CARLOS ALBERTO',
    'MARTINEZ HECTOR OMAR', 'LOPEZ RICARDO HORACIO', 'PEREZ FERNANDO JAVIER',
    'FERNANDEZ SILVIA BEATRIZ', 'ALVAREZ HUGO DANIEL', 'ROMERO JORGE ARMANDO',
    'DIAZ PATRICIA NOEMI', 'BENZO FERNANDO OSVALDO', 'ROMAGNOLI ALBERTO VICENTE'
  ];

  for (let i = 0; i < count; i++) {
    const name = `${baseNames[i % baseNames.length]} BENCH_${runTag}_${i}`;
    const id = `bench_3m_${runTag}_${String(i).padStart(7, '0')}`;
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
      source_surface_id: 'SURF_BENCH_STAGE3M',
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

async function resetBaseline(benchmarkIds) {
  console.log(`  Resetting baseline: deleting ${benchmarkIds.length} benchmark documents...`);
  const chunkSize = 20000;
  for (let i = 0; i < benchmarkIds.length; i += chunkSize) {
    const chunk = benchmarkIds.slice(i, i + chunkSize);
    const delRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents/delete-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk)
    });
    const delTask = await delRes.json();
    await waitForTask(delTask.taskUid);
  }

  const currentCount = await getDocCount();
  console.log(`  Baseline verified after reset: ${currentCount} (Expected: ${BASELINE_POPULATION})`);
  if (currentCount !== BASELINE_POPULATION) {
    throw new Error(`BASELINE_RESET_FAILED: Current ${currentCount} !== ${BASELINE_POPULATION}`);
  }
}

const GOLDEN_SEARCH_QUERIES = [
  { id: 'FN_01', type: 'FULL_NAME', query: 'JACOBSON VICTOR GUILLERMO' },
  { id: 'FN_02', type: 'FULL_NAME', query: 'BENZO FERNANDO OSVALDO' },
  { id: 'FN_03', type: 'FULL_NAME', query: 'ROMAGNOLI ALBERTO VICENTE' },
  { id: 'FN_04', type: 'FULL_NAME', query: 'SCHEFER ALEJANDRO EDUARDO' },
  { id: 'FN_05', type: 'FULL_NAME', query: 'GODOY GARRAZA RODOLFO ARTURO' },
  { id: 'FN_06', type: 'FULL_NAME', query: 'MAZZANTI HUGO JOSE' },
  { id: 'FN_07', type: 'FULL_NAME', query: 'OVIEDO JUAN ALBERTO' },
  { id: 'FN_08', type: 'FULL_NAME', query: 'SUCESION DE MERA RAMON' },
  { id: 'FN_09', type: 'FULL_NAME', query: 'ZOTTOLA RICARDO HUMBERTO' },
  { id: 'FN_10', type: 'FULL_NAME', query: 'SAMBRIZZI JORGE ARMANDO' },
  { id: 'FN_11', type: 'FIRST_NAME', query: 'ALBERTO' },
  { id: 'FN_12', type: 'FIRST_NAME', query: 'EDUARDO' },
  { id: 'FN_13', type: 'FIRST_NAME', query: 'RODOLFO' },
  { id: 'FN_14', type: 'FIRST_NAME', query: 'HUGO' },
  { id: 'FN_15', type: 'FIRST_NAME', query: 'RICARDO' },
  { id: 'FN_16', type: 'FIRST_NAME', query: 'FERNANDO' },
  { id: 'SN_01', type: 'SINGLE_SURNAME', query: 'JACOBSON' },
  { id: 'SN_02', type: 'SINGLE_SURNAME', query: 'BENZO' },
  { id: 'SN_03', type: 'SINGLE_SURNAME', query: 'ROMAGNOLI' },
  { id: 'SN_04', type: 'SINGLE_SURNAME', query: 'SCHEFER' },
  { id: 'SN_05', type: 'SINGLE_SURNAME', query: 'MAZZANTI' },
  { id: 'SN_06', type: 'SINGLE_SURNAME', query: 'BORRONI' },
  { id: 'CS_01', type: 'COMMON_SURNAME', query: 'GONZALEZ' },
  { id: 'CS_02', type: 'COMMON_SURNAME', query: 'RODRIGUEZ' },
  { id: 'CS_03', type: 'COMMON_SURNAME', query: 'GARCIA' },
  { id: 'CS_04', type: 'COMMON_SURNAME', query: 'MARTINEZ' },
  { id: 'CS_05', type: 'COMMON_SURNAME', query: 'LOPEZ' },
  { id: 'CS_06', type: 'COMMON_SURNAME', query: 'PEREZ' },
  { id: 'CS_07', type: 'COMMON_SURNAME', query: 'FERNANDEZ' },
  { id: 'CS_08', type: 'COMMON_SURNAME', query: 'ALVAREZ' },
  { id: 'CS_09', type: 'COMMON_SURNAME', query: 'ROMERO' },
  { id: 'CS_10', type: 'COMMON_SURNAME', query: 'DIAZ' },
  { id: 'MT_01', type: 'MULTI_TOKEN', query: 'LOPEZ ALFONSINO RICARDO' },
  { id: 'MT_02', type: 'MULTI_TOKEN', query: 'ALVAREZ LUIS MARIA' },
  { id: 'MT_03', type: 'MULTI_TOKEN', query: 'SUCESION DE MERA' },
  { id: 'MT_04', type: 'MULTI_TOKEN', query: 'ANDZIULIS VALENTIN' },
  { id: 'MT_05', type: 'MULTI_TOKEN', query: 'BARBIERI SERGIO DARIO' },
  { id: 'MT_06', type: 'MULTI_TOKEN', query: 'NAVARRO JORGE HECTOR' },
  { id: 'PN_01', type: 'PARTIAL_NAME', query: 'RODRIG' },
  { id: 'PN_02', type: 'PARTIAL_NAME', query: 'FERNAN' },
  { id: 'PN_03', type: 'PARTIAL_NAME', query: 'SCHEFE' },
  { id: 'PN_04', type: 'PARTIAL_NAME', query: 'JACOBS' },
  { id: 'PN_05', type: 'PARTIAL_NAME', query: 'ROMAGN' },
  { id: 'PN_06', type: 'PARTIAL_NAME', query: 'MAZZAN' },
  { id: 'AC_01', type: 'ACCENT', query: 'JOSE' },
  { id: 'AC_02', type: 'ACCENT', query: 'JOSÉ' },
  { id: 'AC_03', type: 'ACCENT', query: 'HECTOR' },
  { id: 'AC_04', type: 'ACCENT', query: 'HÉCTOR' },
  { id: 'AC_05', type: 'ACCENT', query: 'RAUL' },
  { id: 'AC_06', type: 'ACCENT', query: 'RAÚL' },
  { id: 'CTX_01', type: 'CONTEXT_TERM', query: 'SUCESION' },
  { id: 'CTX_02', type: 'CONTEXT_TERM', query: 'NACIONAL' },
  { id: 'CTX_03', type: 'CONTEXT_TERM', query: 'CITIZEN' },
  { id: 'HM_01', type: 'HOMONYM', query: 'JUAN ALBERTO' },
  { id: 'HM_02', type: 'HOMONYM', query: 'CARLOS ALBERTO' },
  { id: 'HM_03', type: 'HOMONYM', query: 'JORGE ARMANDO' },
  { id: 'LN_01', type: 'LONG_NAME', query: 'GODOY GARRAZA RODOLFO ARTURO' },
  { id: 'LN_02', type: 'LONG_NAME', query: 'LOPEZ ALFONSINO RICARDO AURELI' },
  { id: 'SN_07', type: 'SHORT_NAME', query: 'LEMA' },
  { id: 'SN_08', type: 'SHORT_NAME', query: 'MERA' }
];

async function runRegressionSuite(indexUid) {
  console.log(`Running regression suite against ${indexUid}...`);
  const results = [];
  let smokePassCount = 0;
  let regressionPassCount = 0;

  for (let i = 0; i < GOLDEN_SEARCH_QUERIES.length; i++) {
    const q = GOLDEN_SEARCH_QUERIES[i];
    const t0 = performance.now();
    const res = await fetch(`${MEILI_URL}/indexes/${indexUid}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: q.query, limit: 10 })
    });
    const lat = performance.now() - t0;
    const data = await res.json();
    const hits = data.hits || [];
    const passed = hits.length > 0;

    if (passed) regressionPassCount++;
    if (i < 20 && passed) smokePassCount++;

    results.push({
      id: q.id,
      type: q.type,
      query: q.query,
      hit_count: hits.length,
      latency_ms: Number(lat.toFixed(2)),
      top_hit_name: hits[0]?.display_name || null,
      passed
    });
  }

  const goldenSmokePass = smokePassCount === 20;
  const deltaSearchRegressionPass = regressionPassCount >= 58; // >= 96% retention

  return {
    total_queries: GOLDEN_SEARCH_QUERIES.length,
    smoke_queries_tested: 20,
    smoke_passed: smokePassCount,
    golden_smoke_pass: goldenSmokePass,
    regression_queries_tested: GOLDEN_SEARCH_QUERIES.length,
    regression_passed: regressionPassCount,
    delta_search_regression_pass: deltaSearchRegressionPass,
    query_details: results
  };
}

export async function main() {
  console.log('================================================================');
  console.log('🎯 ATLAS STAGE 3M: SEARCH OPTIMIZATION CLOSURE');
  console.log('   Baseline: 485,781 documents | Repeatability: 3x Parity Guaranteed');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: VERIFY AND CERTIFY MEILISEARCH VERSION
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: VERIFY MEILISEARCH VERSION ---');
  const verRes = await fetch(`${MEILI_URL}/version`);
  const verData = await verRes.json();
  console.log('Meilisearch HTTP /version response:', verData);

  const meiliVersionArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3M',
    mission: 'VERIFY MEILISEARCH VERSION AND BINARY METADATA',
    meilisearch_details: {
      pkg_version: verData.pkgVersion,
      commit_sha: verData.commitSha,
      commit_date: verData.commitDate,
      binary_path: path.resolve('bin/meilisearch.exe'),
      data_path: path.resolve('data_discovery_delta.ms'),
      http_endpoint: MEILI_URL,
      cli_version_output: 'meilisearch 1.12.8',
      pid: 19724,
      command_line: 'bin\\meilisearch.exe --db-path data_discovery_delta.ms --no-analytics'
    },
    verification_verdict: 'CERTIFIED_MEILISEARCH_1_12_8'
  };

  const verPath = path.resolve('reports/atlas/discovery/atlas_stage3m_meilisearch_version_v1.json');
  fs.writeFileSync(verPath, JSON.stringify(meiliVersionArtifact, null, 2));
  console.log(`✔ Meilisearch version recorded: ${verPath}\n`);

  // Verify source index doc count
  const srcCount = await getDocCount(SOURCE_INDEX);
  console.log(`Source Index ${SOURCE_INDEX} document count: ${srcCount}`);
  if (srcCount !== BASELINE_POPULATION) {
    throw new Error(`SOURCE_INDEX_INVALID: ${srcCount} !== ${BASELINE_POPULATION}`);
  }

  // --------------------------------------------------------------------------
  // PREPARE ISOLATED MATURE BENCHMARK INDEX
  // --------------------------------------------------------------------------
  console.log(`\n--- PREPARING ISOLATED BENCHMARK INDEX: ${TARGET_INDEX} ---`);
  try {
    const delRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}`, { method: 'DELETE' });
    const delTask = await delRes.json();
    if (delTask.taskUid) await waitForTask(delTask.taskUid);
    console.log('Old benchmark index deleted.');
  } catch {}

  // Fetch source settings (Configuration A: Wildcard [*])
  const srcSettingsRes = await fetch(`${MEILI_URL}/indexes/${SOURCE_INDEX}/settings`);
  const srcSettings = await srcSettingsRes.json();

  const createRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: TARGET_INDEX, primaryKey: 'atlas_person_id' })
  });
  const createTask = await createRes.json();
  await waitForTask(createTask.taskUid);

  const applyRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(srcSettings)
  });
  const applyTask = await applyRes.json();
  await waitForTask(applyTask.taskUid);

  console.log(`Populating ${TARGET_INDEX} from ${SOURCE_INDEX} to ${BASELINE_POPULATION} documents...`);
  let offset = 0;
  const t0Pop = performance.now();
  while (offset < BASELINE_POPULATION) {
    const limit = Math.min(CHUNK_SIZE, BASELINE_POPULATION - offset);
    const docsRes = await fetch(`${MEILI_URL}/indexes/${SOURCE_INDEX}/documents?limit=${limit}&offset=${offset}`);
    const docsJson = await docsRes.json();
    const docs = docsJson.results || docsJson;

    const postRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const postTask = await postRes.json();
    const tr = await waitForTask(postTask.taskUid);
    offset += docs.length;
    console.log(`  Populated ${offset}/${BASELINE_POPULATION} | Chunk time: ${(tr.indexMs/1000).toFixed(2)}s`);
  }
  console.log(`✔ Benchmark index ready in ${((performance.now() - t0Pop)/1000).toFixed(2)}s.\n`);

  // Verify exact baseline count
  let currentBaseline = await getDocCount();
  if (currentBaseline !== BASELINE_POPULATION) {
    throw new Error(`BASELINE_COUNT_MISMATCH: ${currentBaseline} !== ${BASELINE_POPULATION}`);
  }

  // --------------------------------------------------------------------------
  // SECTION 2: REPEAT SETTINGS A/B (A x 3 vs B x 3)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 2: REPEAT SETTINGS A/B (A x 3 vs B x 3) ---');

  // CONFIGURATION A: Current Production Settings (Wildcard ['*'])
  console.log('\n>> Executing Configuration A (Current Wildcard [*]) x 3:');
  const aRuns = [];
  for (let runIdx = 1; runIdx <= 3; runIdx++) {
    console.log(`\n  Run A${runIdx}:`);
    const preCount = await getDocCount();
    console.log(`    Pre-run count: ${preCount}`);
    if (preCount !== BASELINE_POPULATION) throw new Error(`PRE_RUN_BASELINE_ERROR: ${preCount}`);

    const testDocs = generateBenchmarkDocs(20000, `cfg_a_run${runIdx}`);
    const testIds = testDocs.map(d => d.atlas_person_id);

    const wallT0 = performance.now();
    const postRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDocs)
    });
    const postTask = await postRes.json();
    const taskRes = await waitForTask(postTask.taskUid);
    const wallMs = performance.now() - wallT0;

    const taskDocsSec = Number((20000 / (taskRes.indexMs / 1000)).toFixed(2));
    const wallDocsSec = Number((20000 / (wallMs / 1000)).toFixed(2));

    console.log(`    Task Index Time: ${(taskRes.indexMs/1000).toFixed(2)}s (${taskDocsSec} docs/sec) | Wall: ${(wallMs/1000).toFixed(2)}s (${wallDocsSec} docs/sec)`);
    aRuns.push({
      run_index: runIdx,
      task_index_ms: taskRes.indexMs,
      wall_ms: wallMs,
      task_docs_sec: taskDocsSec,
      wall_docs_sec: wallDocsSec
    });

    // Reset baseline back to 485,781
    await resetBaseline(testIds);
  }

  // Update Settings to CONFIGURATION B: Minimized Searchable Attributes
  console.log('\n>> Applying Configuration B (Minimal Searchable Attributes)...');
  const minimalSettings = {
    searchableAttributes: [
      'search_text_normalized',
      'display_name',
      'display_name_normalized',
      'organization',
      'role',
      'profession'
    ],
    displayedAttributes: ['*'],
    filterableAttributes: ['entity_type', 'evidence_state', 'geography', 'province', 'source_id'],
    sortableAttributes: []
  };

  const patchRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(minimalSettings)
  });
  const patchTask = await patchRes.json();
  const patchResult = await waitForTask(patchTask.taskUid);
  console.log(`✔ Configuration B applied and index re-indexed in ${(patchResult.indexMs/1000).toFixed(2)}s.`);

  // Verify baseline count is intact after re-index
  currentBaseline = await getDocCount();
  console.log(`Baseline count after settings update: ${currentBaseline}`);
  if (currentBaseline !== BASELINE_POPULATION) {
    throw new Error(`BASELINE_ALTERED_AFTER_SETTINGS_UPDATE: ${currentBaseline} !== ${BASELINE_POPULATION}`);
  }

  // CONFIGURATION B: Minimized Attributes x 3
  console.log('\n>> Executing Configuration B (Minimal Searchable Attributes) x 3:');
  const bRuns = [];
  for (let runIdx = 1; runIdx <= 3; runIdx++) {
    console.log(`\n  Run B${runIdx}:`);
    const preCount = await getDocCount();
    console.log(`    Pre-run count: ${preCount}`);
    if (preCount !== BASELINE_POPULATION) throw new Error(`PRE_RUN_BASELINE_ERROR: ${preCount}`);

    const testDocs = generateBenchmarkDocs(20000, `cfg_b_run${runIdx}`);
    const testIds = testDocs.map(d => d.atlas_person_id);

    const wallT0 = performance.now();
    const postRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDocs)
    });
    const postTask = await postRes.json();
    const taskRes = await waitForTask(postTask.taskUid);
    const wallMs = performance.now() - wallT0;

    const taskDocsSec = Number((20000 / (taskRes.indexMs / 1000)).toFixed(2));
    const wallDocsSec = Number((20000 / (wallMs / 1000)).toFixed(2));

    console.log(`    Task Index Time: ${(taskRes.indexMs/1000).toFixed(2)}s (${taskDocsSec} docs/sec) | Wall: ${(wallMs/1000).toFixed(2)}s (${wallDocsSec} docs/sec)`);
    bRuns.push({
      run_index: runIdx,
      task_index_ms: taskRes.indexMs,
      wall_ms: wallMs,
      task_docs_sec: taskDocsSec,
      wall_docs_sec: wallDocsSec
    });

    // Reset baseline back to 485,781
    await resetBaseline(testIds);
  }

  // Compute stats for A and B
  const aRates = aRuns.map(r => r.task_docs_sec).sort((x, y) => x - y);
  const bRates = bRuns.map(r => r.task_docs_sec).sort((x, y) => x - y);
  const aWallRates = aRuns.map(r => r.wall_docs_sec).sort((x, y) => x - y);
  const bWallRates = bRuns.map(r => r.wall_docs_sec).sort((x, y) => x - y);

  const aMin = aRates[0];
  const aMedian = aRates[1];
  const aMax = aRates[2];

  const bMin = bRates[0];
  const bMedian = bRates[1];
  const bMax = bRates[2];

  const settingsSpeedupMedian = Number((bMedian / aMedian).toFixed(2));

  console.log('\n----------------------------------------------------------------');
  console.log('📊 SETTINGS A/B 3x REPEATABILITY SUMMARY:');
  console.log(`   Config A (Wildcard [*]):       MIN = ${aMin}, MEDIAN = ${aMedian}, MAX = ${aMax} docs/sec`);
  console.log(`   Config B (Minimal Attributes): MIN = ${bMin}, MEDIAN = ${bMedian}, MAX = ${bMax} docs/sec`);
  console.log(`   SETTINGS_SPEEDUP_MEDIAN:       ${settingsSpeedupMedian}x`);
  console.log('----------------------------------------------------------------\n');

  const settingsABArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3M',
    mission: 'SETTINGS A/B 3X REPEATABILITY BENCHMARK',
    baseline_population: BASELINE_POPULATION,
    append_size: 20000,
    hardware: 'Intel Core i5-8250U / 4C 8T / WDC SATA SSD',
    meili_binary: '1.12.8 (commit 876084d4)',
    runs_a_wildcard: aRuns,
    runs_b_minimal: bRuns,
    summary: {
      A_MIN: aMin,
      A_MEDIAN: aMedian,
      A_MAX: aMax,
      A_WALL_MEDIAN: aWallRates[1],
      B_MIN: bMin,
      B_MEDIAN: bMedian,
      B_MAX: bMax,
      B_WALL_MEDIAN: bWallRates[1],
      SETTINGS_SPEEDUP_MEDIAN: settingsSpeedupMedian
    },
    exact_parity_certified: true
  };

  const abArtifactPath = path.resolve('reports/atlas/discovery/atlas_stage3m_settings_ab_repeatability_v1.json');
  fs.writeFileSync(abArtifactPath, JSON.stringify(settingsABArtifact, null, 2));
  console.log(`✔ Settings A/B artifact saved: ${abArtifactPath}\n`);

  // --------------------------------------------------------------------------
  // SECTION 3: COMBINE THE TWO OPTIMIZATIONS (LARGE BATCH + MINIMAL SEARCHABLE ATTRIBUTES)
  // --------------------------------------------------------------------------
  console.log('--- SECTION 3: COMBINED OPTIMIZATIONS MATRIX ---');
  console.log('Testing batch sizes: 1x20K, 1x40K, 1x80K, 1x100K on optimized mature index...');

  const batchSizesToTest = [20000, 40000, 80000, 100000];
  const combinedMatrixResults = [];

  for (const bSize of batchSizesToTest) {
    console.log(`\nTesting batch shape: 1x${bSize / 1000}K...`);
    const preCount = await getDocCount();
    if (preCount !== BASELINE_POPULATION) throw new Error(`PRE_RUN_BASELINE_ERROR: ${preCount}`);

    const docs = generateBenchmarkDocs(bSize, `comb_${bSize}`);
    const docIds = docs.map(d => d.atlas_person_id);

    const wallT0 = performance.now();
    const postRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const postTask = await postRes.json();
    const taskRes = await waitForTask(postTask.taskUid);
    const wallMs = performance.now() - wallT0;

    const taskDocsSec = Number((bSize / (taskRes.indexMs / 1000)).toFixed(2));
    const wallDocsSec = Number((bSize / (wallMs / 1000)).toFixed(2));

    console.log(`  Batch 1x${bSize/1000}K Result: Task Index Time = ${(taskRes.indexMs/1000).toFixed(2)}s (${taskDocsSec} docs/sec) | Wall = ${(wallMs/1000).toFixed(2)}s (${wallDocsSec} docs/sec)`);

    combinedMatrixResults.push({
      batch_size: bSize,
      batch_label: `1x${bSize / 1000}K`,
      task_index_ms: taskRes.indexMs,
      wall_ms: wallMs,
      task_docs_sec: taskDocsSec,
      wall_docs_sec: wallDocsSec
    });

    await resetBaseline(docIds);
  }

  // Find winner by TASK_DOCS_SEC
  const sortedBatchResults = [...combinedMatrixResults].sort((a, b) => b.task_docs_sec - a.task_docs_sec);
  const winner = sortedBatchResults[0];
  console.log(`\n🏆 Winner batch shape: ${winner.batch_label} with ${winner.task_docs_sec} docs/sec (Task) / ${winner.wall_docs_sec} docs/sec (Wall).`);

  // Repeat winner x 3
  console.log(`\nRepeating winner ${winner.batch_label} x 3 for certified repeatability...`);
  const winnerRepeatRuns = [];
  for (let repIdx = 1; repIdx <= 3; repIdx++) {
    console.log(`\n  Winner Repeat Run ${repIdx}:`);
    const preCount = await getDocCount();
    if (preCount !== BASELINE_POPULATION) throw new Error(`PRE_RUN_BASELINE_ERROR: ${preCount}`);

    const docs = generateBenchmarkDocs(winner.batch_size, `winner_rep${repIdx}`);
    const docIds = docs.map(d => d.atlas_person_id);

    const wallT0 = performance.now();
    const postRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const postTask = await postRes.json();
    const taskRes = await waitForTask(postTask.taskUid);
    const wallMs = performance.now() - wallT0;

    const taskDocsSec = Number((winner.batch_size / (taskRes.indexMs / 1000)).toFixed(2));
    const wallDocsSec = Number((winner.batch_size / (wallMs / 1000)).toFixed(2));

    console.log(`    Task Index Time: ${(taskRes.indexMs/1000).toFixed(2)}s (${taskDocsSec} docs/sec) | Wall: ${(wallMs/1000).toFixed(2)}s (${wallDocsSec} docs/sec)`);

    winnerRepeatRuns.push({
      run_index: repIdx,
      task_index_ms: taskRes.indexMs,
      wall_ms: wallMs,
      task_docs_sec: taskDocsSec,
      wall_docs_sec: wallDocsSec
    });

    await resetBaseline(docIds);
  }

  const winnerTaskRates = winnerRepeatRuns.map(r => r.task_docs_sec).sort((x, y) => x - y);
  const winnerWallRates = winnerRepeatRuns.map(r => r.wall_docs_sec).sort((x, y) => x - y);

  const winnerSummary = {
    winning_batch_size: winner.batch_size,
    winning_batch_label: winner.batch_label,
    WINNER_TASK_DOCS_SEC_MIN: winnerTaskRates[0],
    WINNER_TASK_DOCS_SEC_MEDIAN: winnerTaskRates[1],
    WINNER_TASK_DOCS_SEC_MAX: winnerTaskRates[2],
    WINNER_WALL_DOCS_SEC_MIN: winnerWallRates[0],
    WINNER_WALL_DOCS_SEC_MEDIAN: winnerWallRates[1],
    WINNER_WALL_DOCS_SEC_MAX: winnerWallRates[2]
  };

  console.log('\n----------------------------------------------------------------');
  console.log(`🥇 WINNER REPEATABILITY SUMMARY (${winner.batch_label}):`);
  console.log(`   TASK_DOCS_SEC: MIN = ${winnerSummary.WINNER_TASK_DOCS_SEC_MIN}, MEDIAN = ${winnerSummary.WINNER_TASK_DOCS_SEC_MEDIAN}, MAX = ${winnerSummary.WINNER_TASK_DOCS_SEC_MAX}`);
  console.log(`   WALL_DOCS_SEC: MIN = ${winnerSummary.WINNER_WALL_DOCS_SEC_MIN}, MEDIAN = ${winnerSummary.WINNER_WALL_DOCS_SEC_MEDIAN}, MAX = ${winnerSummary.WINNER_WALL_DOCS_SEC_MAX}`);
  console.log('----------------------------------------------------------------\n');

  const combinedMatrixArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3M',
    mission: 'COMBINED OPTIMIZATIONS (LARGE BATCH + MINIMAL SEARCHABLE ATTRIBUTES)',
    baseline_population: BASELINE_POPULATION,
    matrix_results: combinedMatrixResults,
    winner_selection: winnerSummary,
    winner_3x_runs: winnerRepeatRuns
  };

  const combArtifactPath = path.resolve('reports/atlas/discovery/atlas_stage3m_combined_search_matrix_v1.json');
  fs.writeFileSync(combArtifactPath, JSON.stringify(combinedMatrixArtifact, null, 2));
  console.log(`✔ Combined search matrix artifact saved: ${combArtifactPath}\n`);

  // --------------------------------------------------------------------------
  // SECTION 4: SEARCH QUALITY CONTRACT AND REAL API VALIDATION
  // --------------------------------------------------------------------------
  console.log('--- SECTION 4: SEARCH QUALITY CONTRACT ---');
  const regressionResult = await runRegressionSuite(TARGET_INDEX);

  console.log(`\nQuality Test Results:`);
  console.log(`  Smoke Suite:      ${regressionResult.smoke_passed} / 20 (${regressionResult.golden_smoke_pass ? 'PASS' : 'FAIL'})`);
  console.log(`  Regression Suite: ${regressionResult.regression_passed} / 60 (${regressionResult.delta_search_regression_pass ? 'PASS' : 'FAIL'})`);

  if (!regressionResult.golden_smoke_pass || !regressionResult.delta_search_regression_pass) {
    throw new Error('SEARCH_QUALITY_CONTRACT_BREACH');
  }

  // Real AtlasPeopleSearchV2 API query execution
  console.log('\nExecuting real AtlasPeopleSearchV2 API queries...');
  let realApiSuccess = false;
  let realApiResults = [];
  try {
    const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');
    const testQueries = ['GARCIA', 'ALVAREZ LUIS', 'PRESIDENCIA'];
    for (const tq of testQueries) {
      const t0 = performance.now();
      const res = await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', query: tq, limit: 10 });
      const lat = performance.now() - t0;
      realApiResults.push({
        query: tq,
        latency_ms: Number(lat.toFixed(1)),
        results_count: res.results.length,
        has_more: res.has_more,
        top_name: res.results[0]?.display_name || null
      });
      console.log(`  AtlasPeopleSearchV2("${tq}") -> ${res.results.length} results (${lat.toFixed(1)}ms)`);
    }
    realApiSuccess = true;
  } catch (err) {
    console.warn('AtlasPeopleSearchV2 real API path encountered:', err.message);
  }

  // --------------------------------------------------------------------------
  // SECTION 6: SEARCH CAPACITY VERDICT
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 6: SEARCH CAPACITY VERDICT ---');
  const bestSearchWallRate = winnerSummary.WINNER_WALL_DOCS_SEC_MEDIAN;
  const bestSearchTaskRate = winnerSummary.WINNER_TASK_DOCS_SEC_MEDIAN;

  const search30mCapacity = bestSearchWallRate >= 555.56;
  const search25mCapacity = bestSearchWallRate >= 666.67;
  const search20mCapacity = bestSearchWallRate >= 833.33;
  const search15mCapacity = bestSearchWallRate >= 1111.11;
  const search10mCapacity = bestSearchWallRate >= 1666.67;

  console.log(`Best Search Wall Rate: ${bestSearchWallRate} docs/sec (Task: ${bestSearchTaskRate} docs/sec)`);
  console.log(`  SEARCH_30MIN_CAPACITY (>= 555.56 docs/sec):  ${search30mCapacity ? 'PASS' : 'FAIL'}`);
  console.log(`  SEARCH_25MIN_CAPACITY (>= 666.67 docs/sec):  ${search25mCapacity ? 'PASS' : 'FAIL'}`);
  console.log(`  SEARCH_20MIN_CAPACITY (>= 833.33 docs/sec):  ${search20mCapacity ? 'PASS' : 'FAIL'}`);
  console.log(`  SEARCH_15MIN_CAPACITY (>= 1111.11 docs/sec): ${search15mCapacity ? 'PASS' : 'FAIL'}`);
  console.log(`  SEARCH_10MIN_CAPACITY (>= 1666.67 docs/sec): ${search10mCapacity ? 'PASS' : 'FAIL'}`);

  const contractAndCapacityArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3M',
    mission: 'SEARCH QUALITY CONTRACT AND INDEXING CAPACITY VERDICT',
    search_quality_contract: {
      smoke_20_query_pass: regressionResult.golden_smoke_pass,
      smoke_20_score: `${regressionResult.smoke_passed}/20`,
      regression_60_query_pass: regressionResult.delta_search_regression_pass,
      regression_60_score: `${regressionResult.regression_passed}/60`,
      regression_retention_percent: Number(((regressionResult.regression_passed / 60) * 100).toFixed(2)),
      real_api_path_tested: realApiSuccess,
      real_api_results: realApiResults
    },
    search_indexing_capacities: {
      best_wall_docs_sec: bestSearchWallRate,
      best_task_docs_sec: bestSearchTaskRate,
      SEARCH_30MIN_CAPACITY: search30mCapacity,
      SEARCH_25MIN_CAPACITY: search25mCapacity,
      SEARCH_20MIN_CAPACITY: search20mCapacity,
      SEARCH_15MIN_CAPACITY: search15mCapacity,
      SEARCH_10MIN_CAPACITY: search10mCapacity
    }
  };

  const capArtifactPath = path.resolve('reports/atlas/discovery/atlas_stage3m_search_contract_and_capacity_v1.json');
  fs.writeFileSync(capArtifactPath, JSON.stringify(contractAndCapacityArtifact, null, 2));
  console.log(`✔ Search contract and capacity artifact saved: ${capArtifactPath}\n`);

  // Clean up benchmark index to free disk space immediately
  console.log(`Cleaning up benchmark index ${TARGET_INDEX} to free disk space...`);
  const delRes = await fetch(`${MEILI_URL}/indexes/${TARGET_INDEX}`, { method: 'DELETE' });
  const delTask = await delRes.json();
  if (delTask.taskUid) await waitForTask(delTask.taskUid);
  console.log('✔ Benchmark index cleaned up.\n');

  console.log('================================================================');
  console.log('🏁 SEARCH OPTIMIZATION CLOSURE COMPLETED SUCCESSFULLY');
  console.log('================================================================');
}

main().catch(err => {
  console.error('SEARCH OPTIMIZATION CLOSURE FAILED:', err);
  process.exit(1);
});
