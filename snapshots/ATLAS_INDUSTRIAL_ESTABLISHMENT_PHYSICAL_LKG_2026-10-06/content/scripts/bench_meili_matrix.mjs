import { performance } from 'node:perf_hooks';

const MEILI_URL = 'http://127.0.0.1:7700';
const BENCH_INDEX = 'bench_perf_temp';

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const data = await res.json();
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
      return data;
    }
    await new Promise(r => setTimeout(r, 20));
  }
}

function generateDocs(count, offset = 0) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const id = `bench_per_${offset + i}`;
    const name = `TEST CANDIDATE NUMBER ${offset + i}`;
    docs.push({
      atlas_person_id: id,
      display_name: name,
      display_name_normalized: name,
      search_text_normalized: name,
      source_id: 'ARCA_CONDICION_TRIBUTARIA',
      source_record_id: `rec_bench_${offset + i}`
    });
  }
  return docs;
}

async function run() {
  console.log('=== BENCHMARKING MEILISEARCH THROUGHPUT ON IDENTICAL SETTINGS ===\n');

  // 1. Delete bench index if exists
  await fetch(`${MEILI_URL}/indexes/${BENCH_INDEX}`, { method: 'DELETE' });
  await new Promise(r => setTimeout(r, 500));

  // 2. Create index with same primary key
  const createRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: BENCH_INDEX, primaryKey: 'atlas_person_id' })
  });
  const createJson = await createRes.json();
  await waitForMeiliTask(createJson.taskUid);

  // 3. Apply identical settings
  const settings = {
    searchableAttributes: [
      "display_name",
      "display_name_normalized",
      "organization",
      "role",
      "profession",
      "search_text_normalized"
    ]
  };
  const setRes = await fetch(`${MEILI_URL}/indexes/${BENCH_INDEX}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  const setJson = await setRes.json();
  await waitForMeiliTask(setJson.taskUid);
  console.log('Index bench_perf_temp configured with identical settings.');

  const configurations = [
    { name: 'Batch 2000, sequential (1 task in flight)', batchSize: 2000, batches: 5, pipeline: 1 },
    { name: 'Batch 4000, sequential (1 task in flight)', batchSize: 4000, batches: 3, pipeline: 1 },
    { name: 'Batch 5000, sequential (1 task in flight)', batchSize: 5000, batches: 3, pipeline: 1 },
    { name: 'Batch 5000, pipelined (2 tasks in flight)', batchSize: 5000, batches: 4, pipeline: 2 },
    { name: 'Batch 10000, sequential (1 task in flight)', batchSize: 10000, batches: 2, pipeline: 1 }
  ];

  const results = [];

  for (const cfg of configurations) {
    console.log(`\nTesting: ${cfg.name}...`);
    const totalDocs = cfg.batchSize * cfg.batches;
    let docsOffset = 0;
    const t0 = performance.now();
    let totalEnqueueMs = 0;

    if (cfg.pipeline === 1) {
      for (let b = 0; b < cfg.batches; b++) {
        const docs = generateDocs(cfg.batchSize, docsOffset);
        docsOffset += cfg.batchSize;
        const te0 = performance.now();
        const pRes = await fetch(`${MEILI_URL}/indexes/${BENCH_INDEX}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(docs)
        });
        const pJson = await pRes.json();
        totalEnqueueMs += (performance.now() - te0);
        const task = await waitForMeiliTask(pJson.taskUid);
        if (task.status !== 'succeeded') throw new Error(`Task failed: ${JSON.stringify(task.error)}`);
      }
    } else {
      // Pipelined: keep `pipeline` tasks enqueued
      const activeTasks = [];
      for (let b = 0; b < cfg.batches; b++) {
        const docs = generateDocs(cfg.batchSize, docsOffset);
        docsOffset += cfg.batchSize;
        const te0 = performance.now();
        const pRes = await fetch(`${MEILI_URL}/indexes/${BENCH_INDEX}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(docs)
        });
        const pJson = await pRes.json();
        totalEnqueueMs += (performance.now() - te0);
        activeTasks.push(waitForMeiliTask(pJson.taskUid));
        if (activeTasks.length >= cfg.pipeline) {
          await activeTasks.shift();
        }
      }
      await Promise.all(activeTasks);
    }

    const elapsedTotalMs = performance.now() - t0;
    const docsPerSec = (totalDocs / (elapsedTotalMs / 1000));
    const enqueueDocsSec = (totalDocs / (totalEnqueueMs / 1000));
    console.log(`-> Total Docs: ${totalDocs} in ${elapsedTotalMs.toFixed(1)} ms`);
    console.log(`-> Enqueue Rate: ${enqueueDocsSec.toFixed(1)} docs/sec`);
    console.log(`-> Effective E2E Rate: ${docsPerSec.toFixed(1)} docs/sec`);
    results.push({
      name: cfg.name,
      batchSize: cfg.batchSize,
      pipeline: cfg.pipeline,
      totalDocs,
      totalMs: elapsedTotalMs,
      docsPerSec: Number(docsPerSec.toFixed(1)),
      enqueueDocsSec: Number(enqueueDocsSec.toFixed(1))
    });
  }

  // Cleanup bench index
  await fetch(`${MEILI_URL}/indexes/${BENCH_INDEX}`, { method: 'DELETE' });
  console.log('\nBench index cleaned up.');
  console.log('\n=== SUMMARY ===');
  console.table(results);
}

run().catch(console.error);
