import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { performance } from 'node:perf_hooks';

dotenv.config();
const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
const client = await pool.connect();

const N = 2000;
const outboxIds = [], outboxSources = [], outboxRecords = [], outboxPayloads = [], outboxVersions = [], outboxStatuses = [], outboxAttempts = [];
for (let i = 0; i < N; i++) {
  const atlasId = `atlas_test_bench_${i}`;
  const source_id = 'BENCHMARK_TEST';
  const source_person_id = 'rec_bench_' + i;
  outboxIds.push(atlasId);
  outboxSources.push(source_id);
  outboxRecords.push(source_person_id);
  outboxPayloads.push({ atlas_person_id: atlasId, display_name: 'TEST ' + i });
  outboxVersions.push(1);
  outboxStatuses.push('PENDING');
  outboxAttempts.push(0);
}

console.log('Testing outbox generic ON CONFLICT DO NOTHING...');
await client.query('BEGIN');
let t0 = performance.now();
await client.query(`
  INSERT INTO public.atlas_search_outbox (atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count)
  SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::jsonb[], $5::int[], $6::text[], $7::int[])
  ON CONFLICT DO NOTHING
`, [outboxIds, outboxSources, outboxRecords, outboxPayloads, outboxVersions, outboxStatuses, outboxAttempts]);
let t1 = performance.now();
await client.query('ROLLBACK');
console.log(`Generic: ${(t1 - t0).toFixed(1)} ms`);

console.log('Testing outbox targeted ON CONFLICT (source_id, source_record_id) DO NOTHING...');
await client.query('BEGIN');
t0 = performance.now();
await client.query(`
  INSERT INTO public.atlas_search_outbox (atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count)
  SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::jsonb[], $5::int[], $6::text[], $7::int[])
  ON CONFLICT (source_id, source_record_id) DO NOTHING
`, [outboxIds, outboxSources, outboxRecords, outboxPayloads, outboxVersions, outboxStatuses, outboxAttempts]);
t1 = performance.now();
await client.query('ROLLBACK');
console.log(`Targeted: ${(t1 - t0).toFixed(1)} ms`);

client.release();
await pool.end();
