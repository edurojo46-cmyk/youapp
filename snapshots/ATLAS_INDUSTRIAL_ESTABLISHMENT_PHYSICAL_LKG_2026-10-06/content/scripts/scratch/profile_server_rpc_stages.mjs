import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const SOURCE_FILE = process.env.SOURCE_FILE_PATH || 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';

const INSTRUMENTED_DDL = `
CREATE OR REPLACE FUNCTION public.atlas_resolve_and_ingest_batch_instrumented_rpc(
  p_source_id text,
  p_source_person_ids text[],
  p_identifier_types text[],
  p_identifier_values text[],
  p_display_names text[],
  p_name_norms text[],
  p_field_classifications text[],
  p_proposed_atlas_ids text[],
  p_evidence_ids text[],
  p_confidences numeric[],
  p_resolution_methods text[]
)
RETURNS TABLE (
  identity_rows_inserted int,
  outbox_rows_inserted int,
  new_count int,
  merge_count int,
  server_fallback_ms numeric,
  server_resolution_ms numeric,
  server_identity_insert_ms numeric,
  server_outbox_insert_ms numeric,
  server_other_ms numeric,
  server_total_ms numeric,
  resolved_items jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  t_total_0 timestamptz := clock_timestamp();
  t_stage_0 timestamptz;
  
  v_fallback_ms numeric := 0;
  v_resolution_ms numeric := 0;
  v_id_insert_ms numeric := 0;
  v_outbox_insert_ms numeric := 0;
  v_other_ms numeric := 0;
  v_total_ms numeric := 0;

  v_id_inserted int := 0;
  v_outbox_inserted int := 0;
  v_new int := 0;
  v_merge int := 0;
  v_absent int := 0;
  v_possible int := 0;
  v_resolved_items jsonb;
BEGIN
  -- A & B: Fallback Lookup & Deterministic Resolution Preparation
  t_stage_0 := clock_timestamp();

  CREATE TEMP TABLE tmp_resolved_batch ON COMMIT DROP AS
  WITH input_candidates AS (
    SELECT 
      ord::int AS idx,
      p_source_person_ids[ord] AS source_person_id,
      p_identifier_types[ord] AS identifier_type,
      p_identifier_values[ord] AS identifier_value,
      p_display_names[ord] AS display_name,
      p_name_norms[ord] AS name_norm,
      p_field_classifications[ord] AS field_classification,
      p_proposed_atlas_ids[ord] AS proposed_atlas_id,
      p_evidence_ids[ord] AS evidence_id,
      p_confidences[ord] AS confidence,
      p_resolution_methods[ord] AS resolution_method
    FROM generate_subscripts(p_source_person_ids, 1) AS ord
  ),
  existing_matches AS (
    SELECT DISTINCT ON (m.identifier_type, m.identifier_value)
      b.idx,
      m.atlas_person_id AS matched_atlas_id
    FROM input_candidates b
    JOIN public.atlas_person_identity_map m
      ON m.identifier_type = b.identifier_type
     AND m.identifier_value = b.identifier_value
    WHERE b.field_classification = 'POSSIBLY_PRESENT'
    ORDER BY m.identifier_type, m.identifier_value, m.observed_at ASC
  )
  SELECT 
    b.idx,
    b.source_person_id,
    b.identifier_type,
    b.identifier_value,
    b.display_name,
    b.name_norm,
    b.field_classification,
    COALESCE(em.matched_atlas_id, b.proposed_atlas_id) AS final_atlas_id,
    CASE 
      WHEN em.matched_atlas_id IS NOT NULL THEN 'MERGE'
      ELSE 'NEW'
    END AS decision,
    b.evidence_id,
    b.confidence,
    b.resolution_method
  FROM input_candidates b
  LEFT JOIN existing_matches em ON b.idx = em.idx
  ORDER BY b.idx;

  v_resolution_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - t_stage_0)) * 1000)::numeric, 2);

  -- Stage: Other prep (counters & client items)
  t_stage_0 := clock_timestamp();
  SELECT 
    count(*) FILTER (WHERE decision = 'NEW'),
    count(*) FILTER (WHERE decision = 'MERGE'),
    count(*) FILTER (WHERE field_classification = 'DEFINITELY_ABSENT'),
    count(*) FILTER (WHERE field_classification = 'POSSIBLY_PRESENT')
  INTO 
    v_new, v_merge, v_absent, v_possible
  FROM tmp_resolved_batch;

  SELECT jsonb_agg(
    jsonb_build_object(
      'idx', idx,
      'source_person_id', source_person_id,
      'final_atlas_id', final_atlas_id,
      'decision', decision
    )
  )
  INTO v_resolved_items
  FROM tmp_resolved_batch;
  v_other_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - t_stage_0)) * 1000)::numeric, 2);

  -- Stage C: Identity Map insert
  t_stage_0 := clock_timestamp();
  INSERT INTO public.atlas_person_identity_map (
    atlas_person_id,
    source_id,
    source_person_id,
    identifier_type,
    identifier_value,
    evidence_id,
    confidence,
    resolution_method,
    observed_at
  )
  SELECT
    final_atlas_id,
    p_source_id,
    source_person_id,
    identifier_type,
    identifier_value,
    evidence_id,
    confidence,
    resolution_method,
    NOW()
  FROM tmp_resolved_batch
  ON CONFLICT (source_id, source_person_id) DO NOTHING;

  GET DIAGNOSTICS v_id_inserted = ROW_COUNT;
  v_id_insert_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - t_stage_0)) * 1000)::numeric, 2);

  -- Stage D: Search Outbox insert
  t_stage_0 := clock_timestamp();
  INSERT INTO public.atlas_search_outbox (
    atlas_person_id,
    source_id,
    source_record_id,
    payload,
    payload_version,
    status,
    attempt_count
  )
  SELECT
    final_atlas_id,
    p_source_id,
    source_person_id,
    jsonb_build_object(
      'atlas_person_id', final_atlas_id,
      'display_name', display_name,
      'display_name_normalized', name_norm,
      'search_text_normalized', name_norm,
      'source_id', p_source_id,
      'source_record_id', source_person_id
    ),
    1,
    'PENDING',
    0
  FROM tmp_resolved_batch
  ON CONFLICT (source_id, source_record_id) DO NOTHING;

  GET DIAGNOSTICS v_outbox_inserted = ROW_COUNT;
  v_outbox_insert_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - t_stage_0)) * 1000)::numeric, 2);

  v_total_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - t_total_0)) * 1000)::numeric, 2);
  v_fallback_ms := v_resolution_ms; -- resolution CTE executes the fallback query internally

  RETURN QUERY SELECT 
    v_id_inserted,
    v_outbox_inserted,
    v_new,
    v_merge,
    v_fallback_ms,
    v_resolution_ms,
    v_id_insert_ms,
    v_outbox_insert_ms,
    v_other_ms,
    v_total_ms,
    v_resolved_items;
END;
$$;
`;

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    console.log('Deploying instrumented RPC variant...');
    await client.query(INSTRUMENTED_DDL);
    console.log('Instrumented RPC deployed.\n');

    // Fetch a 2,000-candidate test cohort from a fresh line
    console.log('Loading 2,000 test candidates from source file...');
    const candidates = [];
    for await (const batch of streamChunkedCandidates(SOURCE_FILE, { startLine: 3500000, limit: 2000, batchSize: 2000 })) {
      candidates.push(...batch);
      if (candidates.length >= 2000) break;
    }

    const testSlice = candidates.slice(0, 2000);
    const p_source_person_ids = testSlice.map(c => 'prof_' + c.source_person_id);
    const p_identifier_types = testSlice.map(() => 'NATIONAL_IDENTITY_HMAC');
    const p_identifier_values = testSlice.map(c => c.identifier_value);
    const p_display_names = testSlice.map(c => c.raw_name);
    const p_name_norms = testSlice.map(c => c.name_norm);
    const p_field_classifications = testSlice.map((_, i) => i % 10 === 0 ? 'POSSIBLY_PRESENT' : 'DEFINITELY_ABSENT');
    const p_proposed_atlas_ids = testSlice.map(() => 'atlas_prof_' + crypto.randomBytes(8).toString('hex'));
    const p_evidence_ids = testSlice.map(c => 'ev_prof_' + c.source_person_id);
    const p_confidences = testSlice.map(() => 1.0);
    const p_resolution_methods = testSlice.map(() => 'DETERMINISTIC');

    console.log('Invoking instrumented RPC on 2,000-candidate batch...');
    const rpcRes = await client.query(`
      SELECT * FROM public.atlas_resolve_and_ingest_batch_instrumented_rpc(
        $1::text, $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::numeric[],
        $11::text[]
      );
    `, [
      'ARCA_CONDICION_TRIBUTARIA',
      p_source_person_ids,
      p_identifier_types,
      p_identifier_values,
      p_display_names,
      p_name_norms,
      p_field_classifications,
      p_proposed_atlas_ids,
      p_evidence_ids,
      p_confidences,
      p_resolution_methods
    ]);

    const row = rpcRes.rows[0];
    console.log('\n================================================================');
    console.log('📊 SERVER-SIDE RPC STAGE PROFILING (2,000 Candidates)');
    console.log('================================================================');
    console.log(`SERVER_FALLBACK_MS          : ${row.server_fallback_ms} ms`);
    console.log(`SERVER_RESOLUTION_MS        : ${row.server_resolution_ms} ms`);
    console.log(`SERVER_IDENTITY_INSERT_MS   : ${row.server_identity_insert_ms} ms`);
    console.log(`SERVER_OUTBOX_INSERT_MS     : ${row.server_outbox_insert_ms} ms`);
    console.log(`SERVER_OTHER_MS             : ${row.server_other_ms} ms`);
    console.log(`SERVER_TOTAL_MS             : ${row.server_total_ms} ms`);
    console.log(`IDENTITY_ROWS_INSERTED      : ${row.identity_rows_inserted}`);
    console.log(`OUTBOX_ROWS_INSERTED        : ${row.outbox_rows_inserted}`);
    console.log('================================================================\n');

    // Section 7: EXPLAIN (ANALYZE, BUFFERS, WAL) on dominant statements
    console.log('Running EXPLAIN (ANALYZE, BUFFERS, WAL) on Identity Map INSERT...');
    const explainIdRes = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, WAL)
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
        evidence_id, confidence, resolution_method, observed_at
      )
      SELECT
        'atlas_prof_exp_' || i,
        'ARCA_CONDICION_TRIBUTARIA',
        'exp_' || i,
        'NATIONAL_IDENTITY_HMAC',
        'hmac_' || i,
        'ev_exp_' || i,
        1.0,
        'DETERMINISTIC',
        NOW()
      FROM generate_series(1, 2000) AS i
      ON CONFLICT (source_id, source_person_id) DO NOTHING;
    `);
    console.log('--- Identity Map INSERT EXPLAIN ---');
    console.log(explainIdRes.rows.map(r => r['QUERY PLAN']).join('\n'));

    console.log('\nRunning EXPLAIN (ANALYZE, BUFFERS, WAL) on Outbox INSERT...');
    const explainOutboxRes = await client.query(`
      EXPLAIN (ANALYZE, BUFFERS, WAL)
      INSERT INTO public.atlas_search_outbox (
        atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count
      )
      SELECT
        'atlas_prof_exp_' || i,
        'ARCA_CONDICION_TRIBUTARIA',
        'exp_' || i,
        jsonb_build_object(
          'atlas_person_id', 'atlas_prof_exp_' || i,
          'display_name', 'TEST ' || i,
          'display_name_normalized', 'test ' || i
        ),
        1,
        'PENDING',
        0
      FROM generate_series(1, 2000) AS i
      ON CONFLICT (source_id, source_record_id) DO NOTHING;
    `);
    console.log('--- Outbox INSERT EXPLAIN ---');
    console.log(explainOutboxRes.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Clean up test rows
    await client.query(`DELETE FROM public.atlas_person_identity_map WHERE source_person_id LIKE 'prof_%' OR source_person_id LIKE 'exp_%'`);
    await client.query(`DELETE FROM public.atlas_search_outbox WHERE source_record_id LIKE 'prof_%' OR source_record_id LIKE 'exp_%'`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Profiling error:', err);
  process.exit(1);
});
