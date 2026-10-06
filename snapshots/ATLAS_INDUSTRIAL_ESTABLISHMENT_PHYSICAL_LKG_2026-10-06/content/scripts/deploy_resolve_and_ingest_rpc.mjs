import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const DDL = `
CREATE OR REPLACE FUNCTION public.atlas_resolve_and_ingest_batch_rpc(
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
  definitely_absent_count int,
  possibly_present_count int,
  resolved_items jsonb
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_inserted int := 0;
  v_outbox_inserted int := 0;
  v_new int := 0;
  v_merge int := 0;
  v_absent int := 0;
  v_possible int := 0;
  v_resolved_items jsonb;
BEGIN
  -- Temporary table for processing batch resolution and insertion
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

  -- Compute semantic counters
  SELECT 
    count(*) FILTER (WHERE decision = 'NEW'),
    count(*) FILTER (WHERE decision = 'MERGE'),
    count(*) FILTER (WHERE field_classification = 'DEFINITELY_ABSENT'),
    count(*) FILTER (WHERE field_classification = 'POSSIBLY_PRESENT')
  INTO 
    v_new, v_merge, v_absent, v_possible
  FROM tmp_resolved_batch;

  -- Build resolved items JSON for client-side field cache/reservation updates
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

  -- Statement 1: Identity Map insert
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

  -- Statement 2: Search Outbox insert
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

  RETURN QUERY SELECT
    v_id_inserted,
    v_outbox_inserted,
    v_new,
    v_merge,
    v_absent,
    v_possible,
    COALESCE(v_resolved_items, '[]'::jsonb);
END;
$$;
`;

export async function deployResolveRpc() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  try {
    console.log('Deploying public.atlas_resolve_and_ingest_batch_rpc ...');
    await client.query(DDL);
    console.log('✅ atlas_resolve_and_ingest_batch_rpc deployed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('deploy_resolve_and_ingest_rpc.mjs')) {
  deployResolveRpc().catch(err => {
    console.error('Failed to deploy RPC:', err);
    process.exit(1);
  });
}
