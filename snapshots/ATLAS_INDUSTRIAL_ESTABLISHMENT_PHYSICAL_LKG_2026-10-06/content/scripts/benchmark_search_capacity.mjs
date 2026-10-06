const MEILI_URL = 'http://127.0.0.1:7700';
const TEST_INDEX = 'atlas_benchmark_search_capacity_v1';

console.log('=== BENCHMARKING MEILISEARCH SEARCH CAPACITY ===\n');

// 1. Create temporary benchmark index
const initRes = await fetch(`${MEILI_URL}/indexes`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ uid: TEST_INDEX, primaryKey: 'atlas_person_id' })
});
const initData = await initRes.json();
console.log('Index created task:', initData);

// Wait for task
await waitForTask(initData.taskUid);

// 2. Test batch sizes: 1,000, 2,000, 5,000
const testSizes = [1000, 2000, 5000];
const results = [];

for (const count of testSizes) {
  const docs = Array.from({ length: count }, (_, i) => ({
    atlas_person_id: `pe_bench_search_${count}_${i}`,
    display_name: `BENCHMARK TEST PERSON ${i}`,
    cuit_masked: `20***${String(i).padStart(4, '0')}`,
    source_surface_id: 'SURF_BENCH',
    entity_type: 'NATURAL_PERSON'
  }));

  const t0 = performance.now();
  const pushRes = await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(docs)
  });
  const pushData = await pushRes.json();
  const tPush = performance.now() - t0;

  // Poll task completion
  const tTask0 = performance.now();
  await waitForTask(pushData.taskUid);
  const tTask = performance.now() - tTask0;

  const totalTime = tPush + tTask;
  const docsPerSec = count / (totalTime / 1000);

  console.log(`Docs: ${count.toString().padStart(5)} | HTTP Push: ${tPush.toFixed(1)} ms | Index Task: ${tTask.toFixed(1)} ms | Total: ${totalTime.toFixed(1)} ms | Throughput: ${docsPerSec.toFixed(1)} docs/sec`);
  results.push({ count, tPush, tTask, totalTime, docsPerSec });
}

// 3. Clean up test index
const delRes = await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}`, { method: 'DELETE' });
const delData = await delRes.json();
await waitForTask(delData.taskUid);
console.log('\n✔ Cleaned up temporary benchmark index.');

async function waitForTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 50));
  }
}
