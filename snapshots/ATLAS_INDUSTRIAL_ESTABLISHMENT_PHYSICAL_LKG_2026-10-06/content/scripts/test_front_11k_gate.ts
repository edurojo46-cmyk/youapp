import 'dotenv/config';

async function runAcceptanceGate() {
  console.log('===============================================================');
  console.log('   ATLAS PEOPLE FRONT V2 — 11K VISIBILITY GATE ACCEPTANCE TEST');
  console.log('===============================================================\n');

  const BASE_URL = 'http://localhost:5173';

  // 1. Check Metrics API
  console.log('1. Checking GET /api/atlas/people-metrics...');
  const mRes = await fetch(`${BASE_URL}/api/atlas/people-metrics`);
  if (!mRes.ok) throw new Error(`HTTP Error ${mRes.status} from metrics endpoint`);
  const metrics = await mRes.json();
  console.log('   Received Metrics:', metrics);

  const expectedMetrics = {
    caba_universe_unique: 11247,
    current_direct_caba: 6223,
    recent_caba: 1083,
    associated_stale: 3941,
    canonical: 2091,
    discovery_rows: 21975,
    historical: 1117
  };

  for (const [key, val] of Object.entries(expectedMetrics)) {
    if (metrics[key] !== val) {
      throw new Error(`METRIC MISMATCH for ${key}: expected ${val}, got ${metrics[key]}`);
    }
  }
  console.log('   -> ALL 7 SCALE METRICS MATCH EXPECTED VALUES EXACTLY!\n');

  // 2. Physical search for OpenAlex Current: "Girardi Raúl"
  console.log('2. Testing Person Search: OpenAlex Current ("Girardi Raúl")...');
  const s1Res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Girardi Raúl', evidence_state: 'ALL_CABA' })
  });
  if (!s1Res.ok) throw new Error(`Search error: ${s1Res.status}`);
  const s1 = await s1Res.json();
  console.log(`   Matches: ${s1.total_matches}, DB Latency: ${s1.db_query_ms}ms`);
  const p1 = s1.results?.[0];
  console.log('   First result:', p1 ? { name: p1.display_name, org: p1.organization, state: p1.evidence_state, src: p1.source_id } : 'NONE');
  if (!p1 || p1.evidence_state !== 'CURRENT' || !p1.display_name.includes('Girardi')) {
    throw new Error('FAILED: Expected Girardi Raúl with CURRENT state');
  }

  // 3. Physical search for OpenAlex Recent: "Jesús Rodríguez Marín"
  console.log('\n3. Testing Person Search: OpenAlex Recent ("Jesús Rodríguez Marín")...');
  const s2Res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Jesús Rodríguez Marín', evidence_state: 'ALL_CABA' })
  });
  const s2 = await s2Res.json();
  console.log(`   Matches: ${s2.total_matches}, DB Latency: ${s2.db_query_ms}ms`);
  const p2 = s2.results?.[0];
  console.log('   First result:', p2 ? { name: p2.display_name, org: p2.organization, state: p2.evidence_state, src: p2.source_id } : 'NONE');
  if (!p2 || p2.evidence_state !== 'RECENT') {
    throw new Error('FAILED: Expected Jesús Rodríguez Marín with RECENT state');
  }

  // 4. Physical search for Wikidata Associated: "Grimanesa Lazaro"
  console.log('\n4. Testing Person Search: Wikidata Associated ("Grimanesa Lazaro")...');
  const s3Res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Grimanesa Lazaro', evidence_state: 'ALL_CABA' })
  });
  const s3 = await s3Res.json();
  console.log(`   Matches: ${s3.total_matches}, DB Latency: ${s3.db_query_ms}ms`);
  const p3 = s3.results?.[0];
  console.log('   First result:', p3 ? { name: p3.display_name, org: p3.organization, state: p3.evidence_state, src: p3.source_id } : 'NONE');
  if (!p3 || p3.evidence_state !== 'ASSOCIATED_STALE') {
    throw new Error('FAILED: Expected Grimanesa Lazaro with ASSOCIATED_STALE state');
  }

  // 5. Physical search for Canonical: "CESAR DANIEL LLANOS"
  console.log('\n5. Testing Person Search: Canonical baseline ("CESAR DANIEL LLANOS")...');
  const s4Res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'CESAR DANIEL LLANOS', evidence_state: 'CANONICAL' })
  });
  const s4 = await s4Res.json();
  console.log(`   Matches: ${s4.total_matches}, DB Latency: ${s4.db_query_ms}ms`);
  const p4 = s4.results?.[0];
  console.log('   First result:', p4 ? { name: p4.display_name, org: p4.organization, state: p4.evidence_state, src: p4.source_id } : 'NONE');
  if (!p4 || p4.evidence_state !== 'CANONICAL') {
    throw new Error('FAILED: Expected CESAR DANIEL LLANOS with CANONICAL state');
  }

  // 6. Test Default Tab ALL_CABA
  console.log('\n6. Checking Tab "Todas CABA" total matches...');
  const t1Res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidence_state: 'ALL_CABA', limit: 10 })
  });
  const t1 = await t1Res.json();
  console.log(`   Matches: ${t1.total_matches} (Expected: 11247), DB: ${t1.db_query_ms}ms, Total: ${t1.api_total_ms}ms`);
  if (t1.total_matches !== 11247) throw new Error(`Mismatch in ALL_CABA: ${t1.total_matches}`);

  // 7. Test Tab CURRENT
  console.log('\n7. Checking Tab "Actuales" total matches...');
  const tCurrRes = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidence_state: 'CURRENT', limit: 10 })
  });
  const tCurr = await tCurrRes.json();
  console.log(`   Matches: ${tCurr.total_matches} (Expected: 6223), DB: ${tCurr.db_query_ms}ms, Total: ${tCurr.api_total_ms}ms`);
  if (tCurr.total_matches !== 6223) throw new Error(`Mismatch in CURRENT: ${tCurr.total_matches}`);

  // 8. Test Tab RECENT
  console.log('\n8. Checking Tab "Recientes" total matches...');
  const t3Res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidence_state: 'RECENT', limit: 10 })
  });
  const t3 = await t3Res.json();
  console.log(`   Matches: ${t3.total_matches} (Expected: 1083), DB: ${t3.db_query_ms}ms, Total: ${t3.api_total_ms}ms`);
  if (t3.total_matches !== 1083) throw new Error(`Mismatch in RECENT: ${t3.total_matches}`);

  // 9. Test Tab ASSOCIATED_STALE
  console.log('\n9. Checking Tab "Asociadas" total matches...');
  const tStaleRes = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidence_state: 'ASSOCIATED_STALE', limit: 10 })
  });
  const tStale = await tStaleRes.json();
  console.log(`   Matches: ${tStale.total_matches} (Expected: 3941), DB: ${tStale.db_query_ms}ms, Total: ${tStale.api_total_ms}ms`);
  if (tStale.total_matches !== 3941) throw new Error(`Mismatch in ASSOCIATED_STALE: ${tStale.total_matches}`);

  // 10. Test Tab CANONICAL
  console.log('\n10. Checking Tab "Canónicas" total matches...');
  const t2Res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidence_state: 'CANONICAL', limit: 10 })
  });
  const t2 = await t2Res.json();
  console.log(`   Matches: ${t2.total_matches} (Expected: 2091), DB: ${t2.db_query_ms}ms, Total: ${t2.api_total_ms}ms`);
  if (t2.total_matches !== 2091) throw new Error(`Mismatch in CANONICAL: ${t2.total_matches}`);

  // 11. Test Tab HISTORICAL
  console.log('\n11. Checking Tab "Históricas" total matches...');
  const tHistRes = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evidence_state: 'HISTORICAL', limit: 10 })
  });
  const tHist = await tHistRes.json();
  console.log(`   Matches: ${tHist.total_matches} (Expected: 1117), DB: ${tHist.db_query_ms}ms, Total: ${tHist.api_total_ms}ms`);
  if (tHist.total_matches !== 1117) throw new Error(`Mismatch in HISTORICAL: ${tHist.total_matches}`);

  // 12. Test Multi-Field Search
  console.log('\n12. Testing Multi-Field Search (organization="Favaloro", source="OPENALEX")...');
  const mfRes = await fetch(`${BASE_URL}/api/atlas/people-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organization: 'Favaloro', source: 'OPENALEX', evidence_state: 'ALL_CABA' })
  });
  const mf = await mfRes.json();
  console.log(`   Matches: ${mf.total_matches}, First item: ${mf.results[0]?.display_name} (${mf.results[0]?.organization})`);
  if (mf.total_matches === 0 || !mf.results[0]?.organization.includes('Favaloro')) {
    throw new Error('FAILED: Multi-field search for Favaloro failed');
  }

  // 13. Test Cache Invalidation & Refresh Endpoint
  console.log('\n13. Testing POST /api/atlas/people-metrics/refresh...');
  const refRes = await fetch(`${BASE_URL}/api/atlas/people-metrics/refresh`, { method: 'POST' });
  if (!refRes.ok) throw new Error(`Refresh error: ${refRes.status}`);
  const refreshedMetrics = await refRes.json();
  console.log('   Refreshed Metrics calculated at:', refreshedMetrics.calculated_at);
  if (refreshedMetrics.caba_universe_unique !== 11247) {
    throw new Error(`Invalid refreshed metric: ${refreshedMetrics.caba_universe_unique}`);
  }

  // 14. Performance Latency Measurements (p50 / p95)
  console.log('\n14. Measuring Search Latency & Performance Matrix (p50 / p95)...');
  const latencies: { db: number[]; total: number[] } = { db: [], total: [] };
  const benchmarkQueries = [
    { query: 'Gomez', evidence_state: 'ALL_CABA' },
    { query: 'Lopez', evidence_state: 'ALL_CABA' },
    { query: 'Rodriguez', evidence_state: 'CURRENT' },
    { query: 'Alvarez', evidence_state: 'CANONICAL' },
    { organization: 'Hospital', evidence_state: 'ALL_CABA' },
    { role: 'Director', evidence_state: 'ALL_CABA' }
  ];

  for (const bq of benchmarkQueries) {
    const res = await fetch(`${BASE_URL}/api/atlas/people-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bq)
    });
    const data = await res.json();
    latencies.db.push(data.db_query_ms || 0);
    latencies.total.push(data.api_total_ms || 0);
  }

  latencies.db.sort((a, b) => a - b);
  latencies.total.sort((a, b) => a - b);

  const p50Db = latencies.db[Math.floor(latencies.db.length * 0.5)];
  const p95Db = latencies.db[Math.floor(latencies.db.length * 0.95)];
  const p50Total = latencies.total[Math.floor(latencies.total.length * 0.5)];
  const p95Total = latencies.total[Math.floor(latencies.total.length * 0.95)];

  console.log(`   LATENCY BENCHMARK:`);
  console.log(`   - DB_QUERY_MS:  p50 = ${p50Db}ms, p95 = ${p95Db}ms`);
  console.log(`   - API_TOTAL_MS: p50 = ${p50Total}ms, p95 = ${p95Total}ms`);

  console.log('\n===============================================================');
  console.log('   ATLAS_PEOPLE_FRONT_11K_GATE = PASS');
  console.log('===============================================================\n');
}

runAcceptanceGate().catch(err => {
  console.error('\nACCEPTANCE GATE FAILED:', err);
  process.exit(1);
});
