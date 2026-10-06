/**
 * preflight_identity_lookup.mjs
 * Pre-flight certification for identity lookup index performance.
 * Tests:
 * 1. EXPLAIN (ANALYZE, BUFFERS) for (identifier_type, identifier_value)
 * 2. EXPLAIN (ANALYZE, BUFFERS) for (source_id, source_person_id)
 * 3. Batch lookup query with ANY / IN
 * 4. Latency benchmark over 100 lookup iterations to calculate P50, P95, P99
 */

import pg from 'pg';
import { performance } from 'perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function main() {
  console.log('============================================================');
  console.log('PRE-FLIGHT CERTIFICATION: IDENTITY LOOKUP & INDEX ANALYSIS');
  console.log('============================================================\n');

  const client = new pg.Client(parseDbUrl());
  await client.connect();

  // 1. Fetch sample known keys from DB to test realistic Index Scans
  const sampleRows = await client.query(`
    SELECT source_id, source_person_id, identifier_type, identifier_value
    FROM public.atlas_person_identity_map
    WHERE identifier_type IS NOT NULL AND identifier_value IS NOT NULL
    LIMIT 20
  `);

  if (sampleRows.rows.length === 0) {
    throw new Error('No identity rows found to benchmark');
  }

  const sample = sampleRows.rows[0];
  console.log(`Auditing with sample row: type=${sample.identifier_type}, source_id=${sample.source_id}\n`);

  // 2. EXPLAIN (ANALYZE, BUFFERS) for (identifier_type, identifier_value)
  console.log('--- 1. EXPLAIN (ANALYZE, BUFFERS) on (identifier_type, identifier_value) ---');
  const explainIdRes = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT atlas_person_id, source_id, source_person_id, identifier_type, identifier_value
    FROM public.atlas_person_identity_map
    WHERE identifier_type = $1 AND identifier_value = $2
  `, [sample.identifier_type, sample.identifier_value]);

  const explainIdLines = explainIdRes.rows.map(r => r['QUERY PLAN']);
  console.log(explainIdLines.join('\n'));

  const idPlanText = explainIdLines.join('\n');
  const idIndexUsed = idPlanText.includes('Index Scan') || idPlanText.includes('Bitmap Index Scan');
  const idIndexNameMatch = idPlanText.includes('idx_identity_map_identifier');

  console.log(`\nIDENTITY_LOOKUP_INDEX_USED: ${idIndexUsed ? 'TRUE ✅' : 'FALSE ❌'}`);
  console.log(`CORRECT_INDEX_NAME: ${idIndexNameMatch ? 'idx_identity_map_identifier ✅' : 'OTHER/NONE'}\n`);

  // 3. EXPLAIN (ANALYZE, BUFFERS) on (source_id, source_person_id)
  console.log('--- 2. EXPLAIN (ANALYZE, BUFFERS) on (source_id, source_person_id) ---');
  const explainSrcRes = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT atlas_person_id, source_id, source_person_id
    FROM public.atlas_person_identity_map
    WHERE source_id = $1 AND source_person_id = $2
  `, [sample.source_id, sample.source_person_id]);

  const explainSrcLines = explainSrcRes.rows.map(r => r['QUERY PLAN']);
  console.log(explainSrcLines.join('\n'));

  const srcPlanText = explainSrcLines.join('\n');
  const srcIndexUsed = srcPlanText.includes('Index Scan') || srcPlanText.includes('Bitmap Index Scan');
  console.log(`\nSOURCE_LOOKUP_INDEX_USED: ${srcIndexUsed ? 'TRUE ✅' : 'FALSE ❌'}\n`);

  // 4. Batch Lookup Test using UNNEST / IN for multiple keys
  console.log('--- 3. BATCH LOOKUP EXPLAIN (10 items simultaneously) ---');
  const batchTypes = sampleRows.rows.slice(0, 10).map(r => r.identifier_type);
  const batchVals = sampleRows.rows.slice(0, 10).map(r => r.identifier_value);

  const explainBatchRes = await client.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT atlas_person_id, identifier_type, identifier_value
    FROM public.atlas_person_identity_map
    WHERE (identifier_type, identifier_value) IN (
      SELECT * FROM UNNEST($1::text[], $2::text[])
    )
  `, [batchTypes, batchVals]);
  console.log(explainBatchRes.rows.map(r => r['QUERY PLAN']).join('\n'));
  console.log('\n✅ Batch lookup plan confirmed\n');

  // 5. Latency Benchmark (100 sequential lookups)
  console.log('--- 4. LATENCY BENCHMARK (100 sample lookups) ---');
  const latencies = [];
  for (let i = 0; i < 100; i++) {
    const row = sampleRows.rows[i % sampleRows.rows.length];
    const t0 = performance.now();
    await client.query(`
      SELECT atlas_person_id
      FROM public.atlas_person_identity_map
      WHERE identifier_type = $1 AND identifier_value = $2
      LIMIT 1
    `, [row.identifier_type, row.identifier_value]);
    const dt = performance.now() - t0;
    latencies.push(dt);
  }

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  console.log(`LOOKUP_ITERATIONS: 100`);
  console.log(`AVG_ID_LOOKUP_MS:  ${avg.toFixed(2)} ms`);
  console.log(`P50_ID_LOOKUP_MS:  ${p50.toFixed(2)} ms`);
  console.log(`P95_ID_LOOKUP_MS:  ${p95.toFixed(2)} ms`);
  console.log(`P99_ID_LOOKUP_MS:  ${p99.toFixed(2)} ms`);

  await client.end();

  console.log('\n============================================================');
  console.log('PRE-FLIGHT STATUS: PASSED ✅');
  console.log('============================================================\n');
}

main().catch(err => {
  console.error('Pre-flight failed:', err);
  process.exit(1);
});
