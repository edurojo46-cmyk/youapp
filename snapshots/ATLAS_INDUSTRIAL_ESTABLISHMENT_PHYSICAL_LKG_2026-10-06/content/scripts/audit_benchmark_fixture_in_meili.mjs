const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

async function main() {
  const searchRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: 'BENCHMARK CANDIDATE',
      limit: 10
    })
  });
  const data = await searchRes.json();
  console.log('Estimated hits for BENCHMARK CANDIDATE:', data.estimatedTotalHits);
  if (data.hits && data.hits.length > 0) {
    console.log('Sample hit:', data.hits[0]);
  }

  // Count exactly how many documents have source_id = 'GATE32C_BENCHMARK_FIXTURE'
  let benchmarkDocCount = 0;
  let offset = 0;
  const limit = 50000;
  const benchmarkIds = [];

  while (true) {
    const docsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?limit=${limit}&offset=${offset}&fields=atlas_person_id,source_id`);
    const docs = await docsRes.json();
    const list = docs.results || docs;
    if (!list || list.length === 0) break;
    for (const d of list) {
      if (d.source_id === 'GATE32C_BENCHMARK_FIXTURE') {
        benchmarkDocCount++;
        benchmarkIds.push(d.atlas_person_id);
      }
    }
    offset += list.length;
    if (list.length < limit) break;
  }

  console.log(`Total GATE32C_BENCHMARK_FIXTURE documents in Meili: ${benchmarkDocCount}`);
  console.log(`First 5 IDs:`, benchmarkIds.slice(0, 5));
}

main().catch(console.error);
