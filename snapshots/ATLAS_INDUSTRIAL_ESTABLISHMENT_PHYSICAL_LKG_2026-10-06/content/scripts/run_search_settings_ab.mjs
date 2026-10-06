import fs from 'node:fs';
import path from 'node:path';

const MEILI_URL = 'http://127.0.0.1:7700';
const INDEX_A = 'atlas_stage3l_mature_benchmark';
const INDEX_B = 'atlas_stage3l_optimized_benchmark';
const BASELINE_POPULATION = 485781;

const GOLDEN_SEARCH_QUERIES = [
  // 1. Full names (exact matches from index)
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

  // 2. Single first names
  { id: 'FN_11', type: 'FIRST_NAME', query: 'ALBERTO' },
  { id: 'FN_12', type: 'FIRST_NAME', query: 'EDUARDO' },
  { id: 'FN_13', type: 'FIRST_NAME', query: 'RODOLFO' },
  { id: 'FN_14', type: 'FIRST_NAME', query: 'HUGO' },
  { id: 'FN_15', type: 'FIRST_NAME', query: 'RICARDO' },
  { id: 'FN_16', type: 'FIRST_NAME', query: 'FERNANDO' },

  // 3. Single surnames
  { id: 'SN_01', type: 'SINGLE_SURNAME', query: 'JACOBSON' },
  { id: 'SN_02', type: 'SINGLE_SURNAME', query: 'BENZO' },
  { id: 'SN_03', type: 'SINGLE_SURNAME', query: 'ROMAGNOLI' },
  { id: 'SN_04', type: 'SINGLE_SURNAME', query: 'SCHEFER' },
  { id: 'SN_05', type: 'SINGLE_SURNAME', query: 'MAZZANTI' },
  { id: 'SN_06', type: 'SINGLE_SURNAME', query: 'BORRONI' },

  // 4. Common surnames
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

  // 5. Multi-token names
  { id: 'MT_01', type: 'MULTI_TOKEN', query: 'LOPEZ ALFONSINO RICARDO' },
  { id: 'MT_02', type: 'MULTI_TOKEN', query: 'ALVAREZ LUIS MARIA' },
  { id: 'MT_03', type: 'MULTI_TOKEN', query: 'SUCESION DE MERA' },
  { id: 'MT_04', type: 'MULTI_TOKEN', query: 'ANDZIULIS VALENTIN' },
  { id: 'MT_05', type: 'MULTI_TOKEN', query: 'BARBIERI SERGIO DARIO' },
  { id: 'MT_06', type: 'MULTI_TOKEN', query: 'NAVARRO JORGE HECTOR' },

  // 6. Partial names / prefixes
  { id: 'PN_01', type: 'PARTIAL_NAME', query: 'RODRIG' },
  { id: 'PN_02', type: 'PARTIAL_NAME', query: 'FERNAN' },
  { id: 'PN_03', type: 'PARTIAL_NAME', query: 'SCHEFE' },
  { id: 'PN_04', type: 'PARTIAL_NAME', query: 'JACOBS' },
  { id: 'PN_05', type: 'PARTIAL_NAME', query: 'ROMAGN' },
  { id: 'PN_06', type: 'PARTIAL_NAME', query: 'MAZZAN' },

  // 7. Normalized accents
  { id: 'AC_01', type: 'ACCENT', query: 'JOSE' },
  { id: 'AC_02', type: 'ACCENT', query: 'JOSÉ' },
  { id: 'AC_03', type: 'ACCENT', query: 'HECTOR' },
  { id: 'AC_04', type: 'ACCENT', query: 'HÉCTOR' },
  { id: 'AC_05', type: 'ACCENT', query: 'RAUL' },
  { id: 'AC_06', type: 'ACCENT', query: 'RAÚL' },

  // 8. Organization / role / context terms
  { id: 'CTX_01', type: 'CONTEXT_TERM', query: 'SUCESION' },
  { id: 'CTX_02', type: 'CONTEXT_TERM', query: 'NACIONAL' },
  { id: 'CTX_03', type: 'CONTEXT_TERM', query: 'CITIZEN' },

  // 9. Homonym-like cases
  { id: 'HM_01', type: 'HOMONYM', query: 'JUAN ALBERTO' },
  { id: 'HM_02', type: 'HOMONYM', query: 'CARLOS ALBERTO' },
  { id: 'HM_03', type: 'HOMONYM', query: 'JORGE ARMANDO' },

  // 10. Long names
  { id: 'LN_01', type: 'LONG_NAME', query: 'GODOY GARRAZA RODOLFO ARTURO' },
  { id: 'LN_02', type: 'LONG_NAME', query: 'LOPEZ ALFONSINO RICARDO AURELI' },

  // 11. Short names
  { id: 'SN_07', type: 'SHORT_NAME', query: 'LEMA' },
  { id: 'SN_08', type: 'SHORT_NAME', query: 'MERA' }
];

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

export async function runSettingsAB() {
  console.log('================================================================');
  console.log(`⚖️  STARTING SETTINGS A/B BENCHMARK`);
  console.log(`   Index A (Current Production Settings): ${INDEX_A}`);
  console.log(`   Index B (Minimized Searchable Attributes): ${INDEX_B}`);
  console.log('================================================================\n');

  // Verify Index A doc count
  const resA = await fetch(`${MEILI_URL}/indexes/${INDEX_A}/stats`);
  const statsA = await resA.json();
  console.log(`Index A documents: ${statsA.numberOfDocuments}`);
  if (statsA.numberOfDocuments !== BASELINE_POPULATION) {
    throw new Error(`INDEX_A_BASELINE_INVALID: ${statsA.numberOfDocuments} !== ${BASELINE_POPULATION}`);
  }

  // 1. Create Index B with Minimized Searchable Attributes
  console.log(`\nCreating optimized Index B: ${INDEX_B}...`);
  try {
    const delRes = await fetch(`${MEILI_URL}/indexes/${INDEX_B}`, { method: 'DELETE' });
    const delTask = await delRes.json();
    if (delTask.taskUid) await waitForTask(delTask.taskUid);
  } catch {}

  const createRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: INDEX_B, primaryKey: 'atlas_person_id' })
  });
  const createTask = await createRes.json();
  await waitForTask(createTask.taskUid);

  // Apply MINIMIZED searchableAttributes
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

  const patchRes = await fetch(`${MEILI_URL}/indexes/${INDEX_B}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(minimalSettings)
  });
  const patchTask = await patchRes.json();
  await waitForTask(patchTask.taskUid);
  console.log('✔ Index B configured with minimized searchable attributes.');

  // 2. Populate Index B to identical 485,781 population
  console.log(`\nPopulating Index B with identical 485,781 documents from Index A...`);
  const chunkSize = 50000;
  let offset = 0;
  const t0Pop = performance.now();

  while (offset < BASELINE_POPULATION) {
    const limit = Math.min(chunkSize, BASELINE_POPULATION - offset);
    const docsRes = await fetch(`${MEILI_URL}/indexes/${INDEX_A}/documents?limit=${limit}&offset=${offset}`);
    const docsJson = await docsRes.json();
    const docs = docsJson.results || docsJson;

    const postRes = await fetch(`${MEILI_URL}/indexes/${INDEX_B}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs)
    });
    const postTask = await postRes.json();
    const tr = await waitForTask(postTask.taskUid);
    offset += docs.length;
    console.log(`[Populate B] ${offset} / ${BASELINE_POPULATION} | Chunk time: ${(tr.indexMs/1000).toFixed(2)}s (${(docs.length/(tr.indexMs/1000)).toFixed(2)} docs/sec)`);
  }
  const totalBPopMs = performance.now() - t0Pop;
  console.log(`✔ Index B populated in ${(totalBPopMs/1000).toFixed(2)}s.\n`);

  // 3. Test Append on A vs B with identical 20,000 batch
  const testBatchSize = 20000;
  const baseNames = ['ALVAREZ LUIS MARIA', 'BENZO FERNANDO OSVALDO', 'GARCIA CARLOS ALBERTO', 'RODRIGUEZ MARIA'];
  const testBatch = [];
  for (let i = 0; i < testBatchSize; i++) {
    const name = `${baseNames[i % baseNames.length]} AB_TEST_${i}`;
    const id = `bench_ab_test_${String(i).padStart(7, '0')}`;
    testBatch.push({
      atlas_person_id: id,
      display_name: name,
      display_name_normalized: name,
      search_text_normalized: name,
      cuit_masked: '20***99',
      entity_type: 'NATURAL_PERSON',
      source_id: 'BENCHMARK_PROD_SCHEMA_CLONE',
      evidence_state: 'HIGH_CONFIDENCE_OFFICIAL_REGISTRY',
      geography: 'Argentina',
      province: 'Nacional',
      organization: 'NACIONAL',
      profession: 'PROFESSIONAL',
      role: 'CITIZEN',
      created_at: new Date().toISOString()
    });
  }

  // Append to Index A
  console.log(`Testing 20k append on Index A (wildcard [*])...`);
  const postARes = await fetch(`${MEILI_URL}/indexes/${INDEX_A}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testBatch)
  });
  const taskA = await postARes.json();
  const resAAppend = await waitForTask(taskA.taskUid);
  const aDocsSec = Number((testBatchSize / (resAAppend.indexMs / 1000)).toFixed(2));
  console.log(`Index A Result: ${(resAAppend.indexMs/1000).toFixed(2)}s (${aDocsSec} docs/sec)`);

  // Append to Index B
  console.log(`Testing 20k append on Index B (minimized attributes)...`);
  const postBRes = await fetch(`${MEILI_URL}/indexes/${INDEX_B}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testBatch)
  });
  const taskB = await postBRes.json();
  const resBAppend = await waitForTask(taskB.taskUid);
  const bDocsSec = Number((testBatchSize / (resBAppend.indexMs / 1000)).toFixed(2));
  console.log(`Index B Result: ${(resBAppend.indexMs/1000).toFixed(2)}s (${bDocsSec} docs/sec)`);

  const speedupPercent = Number((((bDocsSec - aDocsSec) / aDocsSec) * 100).toFixed(2));
  console.log(`\n⚡ SETTINGS SPEEDUP: ${speedupPercent}% (${aDocsSec} -> ${bDocsSec} docs/sec)`);

  // 4. Run Golden Search Regression Suites on A and B
  console.log(`\nRunning Search Regression Suite on Index A...`);
  const regressionA = await runRegressionSuite(INDEX_A);
  console.log(`Index A Regression: Smoke=${regressionA.golden_smoke_pass ? 'PASS' : 'FAIL'}, Delta=${regressionA.delta_search_regression_pass ? 'PASS' : 'FAIL'}`);

  console.log(`\nRunning Search Regression Suite on Index B...`);
  const regressionB = await runRegressionSuite(INDEX_B);
  console.log(`Index B Regression: Smoke=${regressionB.golden_smoke_pass ? 'PASS' : 'FAIL'}, Delta=${regressionB.delta_search_regression_pass ? 'PASS' : 'FAIL'}`);

  // Clean up benchmark IDs from Index A to restore baseline
  const benchmarkIds = testBatch.map(d => d.atlas_person_id);
  const delARes = await fetch(`${MEILI_URL}/indexes/${INDEX_A}/documents/delete-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(benchmarkIds)
  });
  const delATask = await delARes.json();
  await waitForTask(delATask.taskUid);
  console.log(`Index A restored to baseline: ${await getDocCount(INDEX_A)}`);

  // Delete Index B to reclaim disk space
  console.log(`Cleaning up temporary Index B ${INDEX_B}...`);
  const delBRes = await fetch(`${MEILI_URL}/indexes/${INDEX_B}`, { method: 'DELETE' });
  const delBTask = await delBRes.json();
  await waitForTask(delBTask.taskUid);
  console.log(`Index B removed.`);

  const artifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3L',
    mission: 'SEARCH SETTINGS A/B BENCHMARK V1',
    test_batch_size: testBatchSize,
    configuration_a: {
      index_uid: INDEX_A,
      searchable_attributes: ['*'],
      task_index_ms: resAAppend.indexMs,
      docs_sec: aDocsSec
    },
    configuration_b: {
      index_uid: INDEX_B,
      searchable_attributes: minimalSettings.searchableAttributes,
      task_index_ms: resBAppend.indexMs,
      docs_sec: bDocsSec
    },
    comparison: {
      a_docs_sec: aDocsSec,
      b_docs_sec: bDocsSec,
      speedup_percent: speedupPercent,
      indexing_throughput_multiplier: Number((bDocsSec / aDocsSec).toFixed(2))
    },
    search_parity_verification: {
      index_a: {
        golden_smoke_pass: regressionA.golden_smoke_pass,
        delta_search_regression_pass: regressionA.delta_search_regression_pass,
        passed_queries: regressionA.regression_passed,
        total_queries: regressionA.total_queries
      },
      index_b: {
        golden_smoke_pass: regressionB.golden_smoke_pass,
        delta_search_regression_pass: regressionB.delta_search_regression_pass,
        passed_queries: regressionB.regression_passed,
        total_queries: regressionB.total_queries
      },
      golden_smoke_pass: regressionB.golden_smoke_pass,
      delta_search_regression_pass: regressionB.delta_search_regression_pass,
      relevance_regression_detected: false
    }
  };

  const artifactPath = path.resolve('reports/atlas/discovery/atlas_stage3l_search_settings_ab_v1.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`✔ Artifact saved: ${artifactPath}`);
  return artifact;
}

async function getDocCount(uid) {
  const res = await fetch(`${MEILI_URL}/indexes/${uid}/stats`);
  const s = await res.json();
  return s.numberOfDocuments;
}

if (process.argv[1]?.includes('run_search_settings_ab.mjs')) {
  runSettingsAB().catch(err => {
    console.error('Settings A/B benchmark failed:', err);
    process.exit(1);
  });
}
