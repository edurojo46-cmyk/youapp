import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  console.log('=== TESTING CTE OPTIMIZATION FOR NEW_CANDIDATES ===');

  // Sample 100 actual identity rows
  const sampleRes = await pool.query(`
    SELECT atlas_person_id, source_id, source_person_id, identifier_type, identifier_value
    FROM atlas_person_identity_map 
    WHERE id IN (
      SELECT id FROM atlas_person_identity_map TABLESAMPLE SYSTEM (0.1) LIMIT 100
    );
  `);
  const sampleRows = sampleRes.rows.map(r => ({
    atlas_person_id: r.atlas_person_id,
    source_id: r.source_id,
    source_person_id: r.source_person_id,
    identifier_type: r.identifier_type,
    identifier_value: r.identifier_value,
    confidence: 1.0,
    resolution_method: 'EXACT',
    observed_at: new Date().toISOString()
  }));

  // Option A: Original V4 pattern
  console.log('\n--- OPTION A: Original V4 NOT EXISTS ---');
  const t0 = performance.now();
  const resA = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
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
    ),
    new_candidates AS (
      SELECT DISTINCT i.atlas_person_id
      FROM incoming_identity i
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_person_identity_map existing
        WHERE existing.atlas_person_id = i.atlas_person_id
      )
    )
    SELECT count(*) FROM new_candidates;
  `, [JSON.stringify(sampleRows)]);
  const msA = performance.now() - t0;
  console.log(`Wall clock: ${msA.toFixed(1)}ms`);
  console.log(resA.rows.map(r => r['QUERY PLAN']).join('\n'));

  // Option B: Sorted distinct atlas_person_id before NOT EXISTS
  console.log('\n--- OPTION B: Sorted distinct atlas_person_id before NOT EXISTS ---');
  const t1 = performance.now();
  const resB = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
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
    ),
    distinct_incoming AS (
      SELECT DISTINCT atlas_person_id FROM incoming_identity ORDER BY atlas_person_id
    ),
    new_candidates AS (
      SELECT d.atlas_person_id
      FROM distinct_incoming d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_person_identity_map existing
        WHERE existing.atlas_person_id = d.atlas_person_id
      )
    )
    SELECT count(*) FROM new_candidates;
  `, [JSON.stringify(sampleRows)]);
  const msB = performance.now() - t1;
  console.log(`Wall clock: ${msB.toFixed(1)}ms`);
  console.log(resB.rows.map(r => r['QUERY PLAN']).join('\n'));

  await pool.end();
}

run().catch(console.error);
