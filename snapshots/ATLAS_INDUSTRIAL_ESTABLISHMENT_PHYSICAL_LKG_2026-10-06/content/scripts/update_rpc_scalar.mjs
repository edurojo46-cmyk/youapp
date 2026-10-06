import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- UPDATING RESOLVE_AND_COMMIT_CANDIDATE_BATCH_V1 WITH INDEX-SCAN SUBQUERY ---');

const ddl = `
CREATE OR REPLACE FUNCTION public.resolve_and_commit_candidate_batch_v1(
  p_candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $func$
DECLARE
  v_total_candidates  integer := 0;
  v_new_canonical     integer := 0;
  v_merge_existing    integer := 0;
  v_identity_inserted integer := 0;
  v_outbox_inserted   integer := 0;
BEGIN
  -- 1. Parse incoming candidate records with deduplication on (source_id, source_person_id)
  CREATE TEMP TABLE temp_incoming_batch ON COMMIT DROP AS
  SELECT DISTINCT ON (COALESCE(c->>'source_id', 'ARCA_PADRON_REDUCIDO'), COALESCE(c->>'source_person_id', 'arca_' || (c->>'cuit')))
    (c->>'cuit') AS cuit,
    (c->>'raw_name') AS raw_name,
    (c->>'normalized_name') AS normalized_name,
    (c->>'cuit_masked') AS cuit_masked,
    (c->>'identifier_value') AS identifier_value,
    (c->>'candidate_atlas_person_id') AS candidate_atlas_person_id,
    COALESCE(c->>'source_id', 'ARCA_PADRON_REDUCIDO') AS source_id,
    COALESCE(c->>'source_person_id', 'arca_' || (c->>'cuit')) AS source_person_id
  FROM jsonb_array_elements(p_candidates) AS c;

  GET DIAGNOSTICS v_total_candidates = ROW_COUNT;

  -- 2. Bulk Lookup Existing Identities using index on (identifier_type, identifier_value)
  CREATE TEMP TABLE temp_resolved_candidates ON COMMIT DROP AS
  SELECT 
    t.cuit,
    t.raw_name,
    t.normalized_name,
    t.cuit_masked,
    t.identifier_value,
    t.source_id,
    t.source_person_id,
    COALESCE(
      (SELECT existing.atlas_person_id 
       FROM public.atlas_person_identity_map existing 
       WHERE existing.identifier_type = 'NATIONAL_IDENTITY_HMAC'
         AND existing.identifier_value = t.identifier_value 
       ORDER BY existing.observed_at ASC
       LIMIT 1),
      t.candidate_atlas_person_id
    ) AS resolved_atlas_person_id,
    NOT EXISTS (
       SELECT 1 
       FROM public.atlas_person_identity_map existing 
       WHERE existing.identifier_type = 'NATIONAL_IDENTITY_HMAC'
         AND existing.identifier_value = t.identifier_value
    ) AS is_new_canonical
  FROM temp_incoming_batch t;

  -- Count outcomes
  SELECT 
    count(*) FILTER (WHERE is_new_canonical),
    count(*) FILTER (WHERE NOT is_new_canonical)
  INTO v_new_canonical, v_merge_existing
  FROM temp_resolved_candidates;

  -- 3. Bulk Insert into atlas_person_identity_map
  WITH inserted_map AS (
    INSERT INTO public.atlas_person_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT 
      resolved_atlas_person_id,
      source_id,
      source_person_id,
      'NATIONAL_IDENTITY_HMAC',
      identifier_value,
      'ev_arca_' || cuit,
      1.0,
      'DETERMINISTIC_CUIT_DNI_HMAC',
      now()
    FROM temp_resolved_candidates
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET
      identifier_value  = EXCLUDED.identifier_value,
      confidence        = EXCLUDED.confidence,
      resolution_method = EXCLUDED.resolution_method,
      observed_at       = EXCLUDED.observed_at
    RETURNING 1
  )
  SELECT count(*) INTO v_identity_inserted FROM inserted_map;

  -- 4. Bulk Insert into atlas_search_outbox (Only for NEW canonicals)
  WITH inserted_outbox AS (
    INSERT INTO public.atlas_search_outbox (
      atlas_person_id, source_id, source_record_id, payload, payload_version,
      status, attempt_count, next_retry_at
    )
    SELECT 
      resolved_atlas_person_id,
      source_id,
      'rec_arca_' || cuit,
      jsonb_build_object(
        'atlas_person_id', resolved_atlas_person_id,
        'display_name', normalized_name,
        'cuit_masked', cuit_masked,
        'source_surface_id', 'SURF_ARCA_RG1817',
        'entity_type', 'NATURAL_PERSON'
      ),
      1,
      'PENDING',
      0,
      now()
    FROM temp_resolved_candidates
    WHERE is_new_canonical = true
    ON CONFLICT (source_id, source_record_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_outbox_inserted FROM inserted_outbox;

  RETURN jsonb_build_object(
    'ok', true,
    'total_candidates', v_total_candidates,
    'new_canonical', v_new_canonical,
    'merge_existing', v_merge_existing,
    'identity_inserted', v_identity_inserted,
    'outbox_created', v_outbox_inserted
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$func$;
`;

await client.query(ddl);
console.log('✔ Function updated successfully with fast index-scan subqueries.');
await client.end();
