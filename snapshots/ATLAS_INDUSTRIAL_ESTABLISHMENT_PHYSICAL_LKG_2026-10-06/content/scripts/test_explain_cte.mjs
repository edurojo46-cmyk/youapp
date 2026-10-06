import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const testRows = [];
for (let i = 0; i < 200; i++) {
  testRows.push({
    atlas_person_id: `per_bench_${i}`,
    source_id: 'BENCH',
    source_person_id: `rec_${i}`,
    identifier_type: 'NATIONAL_IDENTITY_HMAC',
    identifier_value: `hmac_${i}`,
    evidence_id: `ev_${i}`,
    confidence: 1.0,
    resolution_method: 'BENCH',
    observed_at: new Date().toISOString()
  });
}

const idJson = JSON.stringify(testRows);

const explainRes = await client.query(`
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
  SELECT count(*)
  FROM (
    SELECT DISTINCT i.atlas_person_id
    FROM incoming_identity i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atlas_person_identity_map existing
      WHERE existing.atlas_person_id = i.atlas_person_id
    )
  ) sub;
`, [idJson]);

console.log(explainRes.rows.map(r => r['QUERY PLAN']).join('\n'));
await client.end();
