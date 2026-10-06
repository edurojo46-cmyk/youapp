import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { performance } from 'node:perf_hooks';

dotenv.config();
const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
const client = await pool.connect();

const N = 2000;
for (let iter = 1; iter <= 3; iter++) {
  const mapIds = [], mapSources = [], mapPersonIds = [], mapTypes = [], mapValues = [], mapEvidences = [], mapConfidences = [], mapResolutions = [];
  const outboxIds = [], outboxSources = [], outboxRecords = [], outboxPayloads = [], outboxVersions = [], outboxStatuses = [], outboxAttempts = [];

  for (let i = 0; i < N; i++) {
    const atlasId = `atlas_test_bench_${crypto.randomBytes(8).toString('hex')}`;
    const cuit = `99${String(100000000 + iter * 10000 + i).slice(1)}`;
    const source_id = 'BENCHMARK_TEST';
    const source_person_id = 'rec_bench_' + cuit;
    const hmac = crypto.createHmac('sha256', 'test').update(cuit).digest('hex');

    mapIds.push(atlasId);
    mapSources.push(source_id);
    mapPersonIds.push(source_person_id);
    mapTypes.push('NATIONAL_IDENTITY_HMAC');
    mapValues.push(hmac);
    mapEvidences.push('ev_' + source_person_id);
    mapConfidences.push(1.0);
    mapResolutions.push('BENCHMARK');

    outboxIds.push(atlasId);
    outboxSources.push(source_id);
    outboxRecords.push(source_person_id);
    outboxPayloads.push({ atlas_person_id: atlasId, display_name: 'TEST PERSON ' + i });
    outboxVersions.push(1);
    outboxStatuses.push('PENDING');
    outboxAttempts.push(0);
  }

  await client.query('BEGIN');
  const t0 = performance.now();
  await client.query(`
    INSERT INTO public.atlas_person_identity_map (atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at)
    SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::float[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])]))
    ON CONFLICT DO NOTHING
  `, [mapIds, mapSources, mapPersonIds, mapTypes, mapValues, mapEvidences, mapConfidences, mapResolutions]);
  const t1 = performance.now();

  await client.query(`
    INSERT INTO public.atlas_search_outbox (atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count)
    SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::jsonb[], $5::int[], $6::text[], $7::int[])
    ON CONFLICT DO NOTHING
  `, [outboxIds, outboxSources, outboxRecords, outboxPayloads, outboxVersions, outboxStatuses, outboxAttempts]);
  const t2 = performance.now();

  await client.query('ROLLBACK');
  const t3 = performance.now();

  console.log(`[Iter ${iter}] Map Insert: ${(t1 - t0).toFixed(1)} ms | Outbox Insert: ${(t2 - t1).toFixed(1)} ms | Rollback: ${(t3 - t2).toFixed(1)} ms`);
}

client.release();
await pool.end();
