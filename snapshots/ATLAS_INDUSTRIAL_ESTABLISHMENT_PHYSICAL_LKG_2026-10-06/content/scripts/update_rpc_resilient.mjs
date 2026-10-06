import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- UPDATING RESOLVE_AND_COMMIT_CANDIDATE_BATCH_V2 WITH RESILIENT FIELD EXTRACTION ---');

const ddl = `
CREATE OR REPLACE FUNCTION public.resolve_and_commit_candidate_batch_v2(
  p_candidates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $func$
DECLARE
  v_total_candidates    integer := 0;
  v_new_canonical       integer := 0;
  v_merge_existing      integer := 0;
  v_identity_conflicts  integer := 0;
  v_identity_inserted   integer := 0;
  v_identity_updated    integer := 0;
  v_create_events       integer := 0;
  v_update_events       integer := 0;
  v_suppressed_events   integer := 0;
BEGIN
  -- 1. Parse incoming candidate records with resilient field extraction (snake_case + camelCase)
  CREATE TEMP TABLE temp_incoming_batch ON COMMIT DROP AS
  SELECT DISTINCT ON (COALESCE(c->>'source_id', c->>'sourceId', 'ARCA_CONDICION_TRIBUTARIA'), (c->>'cuit'))
    (c->>'cuit') AS cuit,
    COALESCE(c->>'raw_name', c->>'rawName') AS raw_name,
    COALESCE(c->>'normalized_name', c->>'normalizedName') AS normalized_name,
    COALESCE(c->>'cuit_masked', c->>'cuitMasked') AS cuit_masked,
    COALESCE(c->>'identifier_value', c->>'identifierValue') AS identifier_value,
    COALESCE(c->>'candidate_atlas_person_id', c->>'atlasPersonId') AS candidate_atlas_person_id,
    COALESCE(c->>'source_id', c->>'sourceId', 'ARCA_CONDICION_TRIBUTARIA') AS source_id,
    COALESCE(c->>'source_person_id', c->>'sourcePersonId', (c->>'cuit')) AS source_person_id
  FROM jsonb_array_elements(p_candidates) AS c
  ORDER BY COALESCE(c->>'source_id', c->>'sourceId', 'ARCA_CONDICION_TRIBUTARIA'), (c->>'cuit');

  GET DIAGNOSTICS v_total_candidates = ROW_COUNT;

  -- 2. Check for Source Key Conflict & Resolve Identity
  CREATE TEMP TABLE temp_resolved_candidates ON COMMIT DROP AS
  SELECT 
    t.cuit,
    t.raw_name,
    t.normalized_name,
    t.cuit_masked,
    t.identifier_value,
    t.source_id,
    t.source_person_id,
    t.candidate_atlas_person_id,
    src_map.atlas_person_id AS existing_source_atlas_id,
    ident_match.atlas_person_id AS existing_ident_atlas_id,
    
    -- Conflict Detection:
    CASE 
      WHEN src_map.atlas_person_id IS NOT NULL 
       AND ident_match.atlas_person_id IS NOT NULL 
       AND src_map.atlas_person_id != ident_match.atlas_person_id
      THEN TRUE
      WHEN src_map.atlas_person_id IS NOT NULL 
       AND ident_match.atlas_person_id IS NULL 
       AND src_map.atlas_person_id != t.candidate_atlas_person_id
      THEN TRUE
      ELSE FALSE
    END AS is_conflict,

    -- Resolved canonical ID:
    COALESCE(
      src_map.atlas_person_id,
      ident_match.atlas_person_id,
      t.candidate_atlas_person_id
    ) AS resolved_atlas_person_id,

    -- Decision:
    CASE 
      WHEN src_map.atlas_person_id IS NULL AND ident_match.atlas_person_id IS NULL THEN 'NEW'
      ELSE 'MERGE'
    END AS resolution_type
  FROM temp_incoming_batch t
  LEFT JOIN LATERAL (
    SELECT atlas_person_id 
    FROM public.atlas_person_identity_map s 
    WHERE s.source_id = t.source_id 
      AND s.source_person_id = t.source_person_id 
    LIMIT 1
  ) src_map ON TRUE
  LEFT JOIN LATERAL (
    SELECT atlas_person_id 
    FROM public.atlas_person_identity_map i 
    WHERE i.identifier_type = 'NATIONAL_IDENTITY_HMAC' 
      AND i.identifier_value = t.identifier_value 
    ORDER BY i.observed_at ASC 
    LIMIT 1
  ) ident_match ON TRUE;

  -- Count conflicts & filter them out of mutations
  SELECT count(*) INTO v_identity_conflicts FROM temp_resolved_candidates WHERE is_conflict = TRUE;
  
  -- Count valid outcomes
  SELECT 
    count(*) FILTER (WHERE is_conflict = FALSE AND resolution_type = 'NEW'),
    count(*) FILTER (WHERE is_conflict = FALSE AND resolution_type = 'MERGE')
  INTO v_new_canonical, v_merge_existing
  FROM temp_resolved_candidates;

  -- 3. Bulk Insert into atlas_person_identity_map (Conflict rows excluded)
  -- IMMUTABILITY ENFORCED: ON CONFLICT DO UPDATE will NEVER modify atlas_person_id!
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
    WHERE is_conflict = FALSE
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET
      identifier_value  = EXCLUDED.identifier_value,
      confidence        = EXCLUDED.confidence,
      resolution_method = EXCLUDED.resolution_method,
      observed_at       = EXCLUDED.observed_at
    RETURNING (xmax = 0) AS is_inserted
  )
  SELECT 
    count(*) FILTER (WHERE is_inserted),
    count(*) FILTER (WHERE NOT is_inserted)
  INTO v_identity_inserted, v_identity_updated
  FROM inserted_map;

  -- 4. Search Event Semantics: CREATE, UPDATE, or SUPPRESSED
  CREATE TEMP TABLE temp_outbox_decisions ON COMMIT DROP AS
  SELECT 
    r.resolved_atlas_person_id,
    r.source_id,
    'rec_arca_' || r.cuit AS source_record_id,
    jsonb_build_object(
      'atlas_person_id', r.resolved_atlas_person_id,
      'display_name', r.normalized_name,
      'cuit_masked', r.cuit_masked,
      'source_surface_id', 'SURF_ARCA_RG1817',
      'entity_type', 'NATURAL_PERSON'
    ) AS new_payload,
    r.resolution_type,
    existing_outbox.payload AS existing_payload,
    CASE 
      WHEN r.resolution_type = 'NEW' AND existing_outbox.source_record_id IS NULL THEN 'CREATE_EVENT'
      WHEN existing_outbox.source_record_id IS NOT NULL 
       AND (existing_outbox.payload->>'display_name') != r.normalized_name THEN 'UPDATE_EVENT'
      ELSE 'SUPPRESSED_EQUIVALENT_EVENT'
    END AS event_action
  FROM temp_resolved_candidates r
  LEFT JOIN LATERAL (
    SELECT source_record_id, payload 
    FROM public.atlas_search_outbox o 
    WHERE o.source_id = r.source_id 
      AND o.source_record_id = ('rec_arca_' || r.cuit)
    LIMIT 1
  ) existing_outbox ON TRUE
  WHERE r.is_conflict = FALSE;

  -- Count event action types
  SELECT 
    count(*) FILTER (WHERE event_action = 'CREATE_EVENT'),
    count(*) FILTER (WHERE event_action = 'UPDATE_EVENT'),
    count(*) FILTER (WHERE event_action = 'SUPPRESSED_EQUIVALENT_EVENT')
  INTO v_create_events, v_update_events, v_suppressed_events
  FROM temp_outbox_decisions;

  -- B. Execute Outbox Mutations (CREATE_EVENT)
  INSERT INTO public.atlas_search_outbox (
    atlas_person_id, source_id, source_record_id, payload, payload_version,
    status, attempt_count, next_retry_at
  )
  SELECT 
    resolved_atlas_person_id,
    source_id,
    source_record_id,
    new_payload,
    1,
    'PENDING',
    0,
    now()
  FROM temp_outbox_decisions
  WHERE event_action = 'CREATE_EVENT'
  ON CONFLICT (source_id, source_record_id) DO NOTHING;

  -- C. Execute Outbox Mutations (UPDATE_EVENT)
  UPDATE public.atlas_search_outbox o
  SET 
    payload = d.new_payload,
    payload_version = o.payload_version + 1,
    status = 'PENDING',
    next_retry_at = now(),
    attempt_count = 0
  FROM temp_outbox_decisions d
  WHERE d.event_action = 'UPDATE_EVENT'
    AND o.source_id = d.source_id
    AND o.source_record_id = d.source_record_id;

  RETURN jsonb_build_object(
    'ok', true,
    'total_candidates', v_total_candidates,
    'new_canonical', v_new_canonical,
    'merge_existing', v_merge_existing,
    'identity_conflicts', v_identity_conflicts,
    'identity_inserted', v_identity_inserted,
    'identity_updated', v_identity_updated,
    'create_events', v_create_events,
    'update_events', v_update_events,
    'suppressed_events', v_suppressed_events
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$func$;
`;

await client.query(ddl);
console.log('✔ Function updated successfully.');
await client.end();
