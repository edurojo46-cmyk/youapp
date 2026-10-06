import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL for Safe EXPLAIN (BUFFERS, WAL).');

  // Generate 100 sample identity rows shaped like production batches
  const sampleRows = [];
  const now = new Date().toISOString();
  for (let i = 0; i < 100; i++) {
    sampleRows.push({
      atlas_person_id: `per_explain_sample_${i}_${Date.now()}`,
      source_id: 'SRC_OAI_INTA_DIGITAL',
      source_person_id: `inta_sample_${i}_${Date.now()}`,
      identifier_type: 'TAX_ID_AR',
      identifier_value: `20${10000000 + i}9`,
      evidence_id: `ev_${i}`,
      confidence: 0.9,
      resolution_method: 'SOURCE_OFFICIAL_RECORD',
      observed_at: now
    });
  }
  const jsonParam = JSON.stringify(sampleRows);

  try {
    await client.query('BEGIN');
    console.log('--- 1. EXPLAIN (ANALYZE, BUFFERS, WAL) ON IDENTITY LOOKUP ---');
    const lookupPlan = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, WAL)
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
      )
      SELECT count(*)
      FROM incoming_identity i
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_person_identity_map existing
        WHERE existing.atlas_person_id = i.atlas_person_id
      )
    `, [jsonParam]);
    console.log(lookupPlan.rows.map(r => r['QUERY PLAN']).join('\n'));

    console.log('\n--- 2. EXPLAIN (ANALYZE, BUFFERS, WAL) ON IDENTITY UPSERT ---');
    const upsertPlan = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, WAL)
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
      RETURNING (xmax = 0) AS is_inserted
    `, [jsonParam]);
    console.log(upsertPlan.rows.map(r => r['QUERY PLAN']).join('\n'));

  } finally {
    await client.query('ROLLBACK');
    console.log('\n✅ Safe ROLLBACK executed. Zero production changes committed.');
    await client.end();
  }
}

main().catch(err => {
  console.error('EXPLAIN profiling failed:', err);
  process.exit(1);
});
