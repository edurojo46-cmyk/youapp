import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const testRows = [];
const outRows = [];
for (let i = 0; i < 200; i++) {
  const pid = `per_explain_${Date.now()}_${i}`;
  testRows.push({
    atlas_person_id: pid,
    source_id: 'BENCH',
    source_person_id: `rec_${Date.now()}_${i}`,
    identifier_type: 'NATIONAL_IDENTITY_HMAC',
    identifier_value: `hmac_${i}`,
    evidence_id: `ev_${i}`,
    confidence: 1.0,
    resolution_method: 'BENCH',
    observed_at: new Date().toISOString()
  });
  outRows.push({
    atlas_person_id: pid,
    source_id: 'BENCH',
    source_record_id: `rec_${Date.now()}_${i}`,
    payload: { name: `Test ${i}` },
    payload_version: 1
  });
}

const idJson = JSON.stringify(testRows);
const outJson = JSON.stringify(outRows);

await client.query('BEGIN');
const exp1 = await client.query(`
  EXPLAIN ANALYZE
  WITH incoming_identity AS (
    SELECT DISTINCT ON (source_id, source_person_id)
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method,
      COALESCE(observed_at, now()) AS observed_at
    FROM jsonb_to_recordset($1::jsonb) AS x(
      atlas_person_id text, source_id text, source_person_id text, identifier_type text,
      identifier_value text, evidence_id text, confidence float, resolution_method text,
      observed_at timestamptz
    )
    ORDER BY source_id, source_person_id, observed_at DESC
  )
  INSERT INTO public.atlas_person_identity_map (
    atlas_person_id, source_id, source_person_id, identifier_type,
    identifier_value, evidence_id, confidence, resolution_method, observed_at
  )
  SELECT * FROM incoming_identity
  ON CONFLICT (source_id, source_person_id) DO UPDATE SET
    identifier_value  = EXCLUDED.identifier_value,
    confidence        = EXCLUDED.confidence,
    resolution_method = EXCLUDED.resolution_method,
    observed_at       = EXCLUDED.observed_at
  RETURNING (xmax = 0) AS is_inserted;
`, [idJson]);
console.log('UPSERT IDENTITY MAP:');
console.log(exp1.rows.map(r => r['QUERY PLAN']).join('\n'));

const exp2 = await client.query(`
  EXPLAIN ANALYZE
  WITH incoming_outbox AS (
    SELECT DISTINCT ON (source_id, source_record_id)
      atlas_person_id, source_id, source_record_id, payload,
      COALESCE(payload_version, 1) AS payload_version,
      'PENDING' AS status, 0 AS attempt_count, now() AS next_retry_at
    FROM jsonb_to_recordset($1::jsonb) AS x(
      atlas_person_id text, source_id text, source_record_id text,
      payload jsonb, payload_version integer
    )
    ORDER BY source_id, source_record_id, payload_version DESC
  )
  INSERT INTO public.atlas_search_outbox (
    atlas_person_id, source_id, source_record_id, payload, payload_version,
    status, attempt_count, next_retry_at
  )
  SELECT * FROM incoming_outbox
  ON CONFLICT (source_id, source_record_id) DO UPDATE SET
    payload = EXCLUDED.payload
  RETURNING (xmax = 0) AS is_inserted;
`, [outJson]);
console.log('\nUPSERT OUTBOX:');
console.log(exp2.rows.map(r => r['QUERY PLAN']).join('\n'));

await client.query('ROLLBACK');
await client.end();
