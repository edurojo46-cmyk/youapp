import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

for (const count of [50, 100, 200]) {
  const testRows = [];
  const outRows = [];
  for (let i = 0; i < count; i++) {
    const pid = `per_test_${Date.now()}_${i}`;
    testRows.push({
      atlas_person_id: pid,
      source_id: 'TEST_BENCH',
      source_person_id: `rec_test_${Date.now()}_${i}`,
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: `hmac_${Date.now()}_${i}`,
      evidence_id: `ev_${i}`,
      confidence: 1.0,
      resolution_method: 'BENCH',
      observed_at: new Date().toISOString()
    });
    outRows.push({
      atlas_person_id: pid,
      source_id: 'TEST_BENCH',
      source_record_id: `rec_test_${Date.now()}_${i}`,
      payload: { name: `Test ${i}` },
      payload_version: 1
    });
  }

  const idJson = JSON.stringify(testRows);
  const outJson = JSON.stringify(outRows);

  await client.query('BEGIN');
  const t0 = performance.now();
  const res = await client.query('SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) AS result', [idJson, outJson]);
  const tRpc = performance.now() - t0;
  await client.query('ROLLBACK');

  console.log(`RPC inside Postgres (${count} items): ${tRpc.toFixed(2)} ms (Throughput: ${(count / (tRpc / 1000)).toFixed(1)} rows/s)`);
}

await client.end();
