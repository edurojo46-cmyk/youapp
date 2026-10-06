import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== APPLYING OUTBOX V2 COMMIT & PUBLISHER RPCS ===');

// 1. Update commit_canonical_with_search_outbox to write to V2 and check Global Delivery Keys
await client.query(`
CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox(
  p_identity_rows jsonb,
  p_outbox_rows   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_identity_total    integer := 0;
  v_identity_inserted integer := 0;
  v_identity_updated  integer := 0;
  v_outbox_total      integer := 0;
  v_outbox_inserted   integer := 0;
  v_outbox_requeued   integer := 0;
  v_new_unique_people integer := 0;
  v_has_identity      boolean := false;
  v_has_outbox        boolean := false;
BEGIN
  v_has_identity := (p_identity_rows IS NOT NULL AND jsonb_typeof(p_identity_rows) = 'array' AND jsonb_array_length(p_identity_rows) > 0);
  v_has_outbox   := (p_outbox_rows IS NOT NULL AND jsonb_typeof(p_outbox_rows) = 'array' AND jsonb_array_length(p_outbox_rows) > 0);

  IF NOT v_has_identity AND NOT v_has_outbox THEN
    RETURN jsonb_build_object(
      'ok', true,
      'identity_rows_processed', 0,
      'identity_rows_inserted', 0,
      'identity_rows_updated', 0,
      'outbox_rows_created', 0,
      'outbox_rows_requeued', 0,
      'NEW_UNIQUE_PEOPLE_INSERTED', 0
    );
  END IF;

  -- 1. SET-BASED UPSERT FOR IDENTITY MAP
  IF v_has_identity THEN
    WITH incoming_identity AS (
      SELECT DISTINCT ON (source_id, source_person_id)
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method,
        COALESCE(observed_at, now()) AS observed_at
      FROM jsonb_to_recordset(p_identity_rows) AS x(
        atlas_person_id text, source_id text, source_person_id text, identifier_type text,
        identifier_value text, evidence_id text, confidence float, resolution_method text,
        observed_at timestamptz
      )
      ORDER BY source_id, source_person_id, observed_at DESC
    ),
    new_people AS (
      SELECT DISTINCT i.atlas_person_id
      FROM incoming_identity i
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_person_identity_map existing
        WHERE existing.atlas_person_id = i.atlas_person_id
      )
    ),
    upsert_identity AS (
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
    )
    SELECT 
      count(*),
      count(*) FILTER (WHERE is_inserted),
      count(*) FILTER (WHERE NOT is_inserted),
      (SELECT count(*) FROM new_people)
    INTO v_identity_total, v_identity_inserted, v_identity_updated, v_new_unique_people
    FROM upsert_identity;
  END IF;

  -- 2. SET-BASED IDEMPOTENCY & UPSERT FOR OUTBOX V2
  IF v_has_outbox THEN
    WITH incoming_outbox AS (
      SELECT DISTINCT ON (source_id, source_record_id)
        atlas_person_id, source_id, source_record_id, payload,
        COALESCE(payload_version, 1) AS payload_version,
        (source_id || ':' || source_record_id || ':v' || COALESCE(payload_version, 1)) AS logical_event_id
      FROM jsonb_to_recordset(p_outbox_rows) AS x(
        atlas_person_id text, source_id text, source_record_id text,
        payload jsonb, payload_version integer
      )
      ORDER BY source_id, source_record_id, payload_version DESC
    ),
    -- Register into Global Delivery Keys (determines if new event vs duplicate retry)
    upsert_keys AS (
      INSERT INTO public.atlas_search_delivery_keys (
        logical_event_id, atlas_person_id, source_id, source_record_id,
        payload_version, delivery_status, first_committed_at, last_seen_at
      )
      SELECT 
        inc.logical_event_id, inc.atlas_person_id, inc.source_id, inc.source_record_id,
        inc.payload_version, 'COMMITTED', now(), now()
      FROM incoming_outbox inc
      ON CONFLICT (logical_event_id) DO UPDATE SET
        last_seen_at = now()
      RETURNING (xmax = 0) AS is_new_event, logical_event_id
    ),
    -- Insert only net new logical delivery events into Outbox V2
    insert_v2 AS (
      INSERT INTO public.atlas_search_outbox_v2 (
        logical_event_id, atlas_person_id, source_id, source_record_id,
        payload, payload_version, status, attempt_count, created_at, next_retry_at
      )
      SELECT 
        inc.logical_event_id, inc.atlas_person_id, inc.source_id, inc.source_record_id,
        inc.payload, inc.payload_version, 'PENDING', 0, now(), now()
      FROM incoming_outbox inc
      JOIN upsert_keys uk ON uk.logical_event_id = inc.logical_event_id
      WHERE uk.is_new_event = true
      RETURNING outbox_id
    )
    SELECT 
      (SELECT count(*) FROM incoming_outbox),
      (SELECT count(*) FROM insert_v2),
      (SELECT count(*) FROM incoming_outbox) - (SELECT count(*) FROM insert_v2)
    INTO v_outbox_total, v_outbox_inserted, v_outbox_requeued;
  END IF;

  -- 2.5 ATOMICALLY UPDATE LIVE METRICS SSOT DIRECTLY FROM TRANSACTION
  IF v_new_unique_people > 0 THEN
    UPDATE public.atlas_people_live_metrics
    SET qualified_unique_real_people = qualified_unique_real_people + v_new_unique_people,
        unique_people = unique_people + v_new_unique_people,
        verified_entities = verified_entities + v_new_unique_people,
        people_added_today = people_added_today + v_new_unique_people,
        last_verified_change_at = now(),
        updated_at = now()
    WHERE id = 'current';
  END IF;

  -- 3. RETURN METRICS
  RETURN jsonb_build_object(
    'ok', true,
    'identity_rows_processed', v_identity_total,
    'identity_rows_inserted', v_identity_inserted,
    'identity_rows_updated', v_identity_updated,
    'outbox_rows_created', v_outbox_inserted,
    'outbox_rows_requeued', v_outbox_requeued,
    'NEW_UNIQUE_PEOPLE_INSERTED', v_new_unique_people
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
`);
console.log('✅ commit_canonical_with_search_outbox updated to V2.');

// 2. Update process_search_outbox_batch to drain V2 (and old if exists)
await client.query(`
CREATE OR REPLACE FUNCTION public.process_search_outbox_batch(
  p_limit integer DEFAULT 100,
  p_worker_id text DEFAULT 'worker_default'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim_start timestamptz;
  v_claimed_count integer := 0;
  v_quarantined_count integer := 0;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_unchanged_count integer := 0;
  v_total_valid integer := 0;
BEGIN
  PERFORM set_config('search.bypass_triggers', 'true', true);
  v_claim_start := clock_timestamp();

  -- 1. CLAIM BATCH FROM V2 USING PARTIAL INDEX & PARTITION PRUNING
  CREATE TEMP TABLE claimed ON COMMIT DROP AS
  WITH next_batch AS (
    SELECT created_at, outbox_id 
    FROM public.atlas_search_outbox_v2
    WHERE created_at >= (CURRENT_DATE - 2)
      AND status IN ('PENDING', 'RETRY')
      AND next_retry_at <= now()
    ORDER BY next_retry_at ASC, outbox_id ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.atlas_search_outbox_v2 o
    SET 
      status = 'PROCESSING',
      processing_started_at = now(),
      processing_worker_id = p_worker_id
    FROM next_batch nb
    WHERE o.created_at = nb.created_at AND o.outbox_id = nb.outbox_id
    RETURNING o.created_at, o.outbox_id, o.logical_event_id, o.payload, o.payload_version
  )
  SELECT * FROM updated;

  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;

  IF v_claimed_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'published', 0,
      'claimed', 0,
      'inserted', 0,
      'updated', 0,
      'unchanged', 0,
      'quarantined', 0,
      'failed', 0,
      'errors', '[]'::jsonb
    );
  END IF;

  -- 2. VALIDATE & QUARANTINE MISSING CANONICAL ID
  CREATE TEMP TABLE tmp_valid_batch ON COMMIT DROP AS
  SELECT 
    created_at,
    outbox_id, 
    logical_event_id,
    payload, 
    payload_version,
    COALESCE(
      payload->>'atlas_person_id',
      payload->'social_profiles'->0->>'atlas_person_id'
    ) as canonical_id
  FROM claimed
  WHERE COALESCE(payload->>'atlas_person_id', payload->'social_profiles'->0->>'atlas_person_id') IS NOT NULL;

  GET DIAGNOSTICS v_total_valid = ROW_COUNT;
  v_quarantined_count := v_claimed_count - v_total_valid;

  IF v_quarantined_count > 0 THEN
    -- Update outbox v2 to QUARANTINED
    UPDATE public.atlas_search_outbox_v2 o
    SET 
      status = 'QUARANTINED',
      last_error = 'Quarantined: Missing atlas_person_id in payload',
      quarantined_at = now()
    FROM claimed c
    WHERE o.created_at = c.created_at AND o.outbox_id = c.outbox_id
      AND COALESCE(c.payload->>'atlas_person_id', c.payload->'social_profiles'->0->>'atlas_person_id') IS NULL;

    -- Also record in durable dead-letter
    INSERT INTO public.atlas_search_delivery_dead_letter (
      outbox_id, logical_event_id, source_id, source_record_id,
      payload_version, attempt_count, reason, created_at, quarantined_at
    )
    SELECT 
      c.outbox_id, c.logical_event_id, c.payload->>'source_id', c.payload->>'source_record_id',
      c.payload_version, 1, 'Quarantined: Missing atlas_person_id in payload', c.created_at, now()
    FROM claimed c
    WHERE COALESCE(c.payload->>'atlas_person_id', c.payload->'social_profiles'->0->>'atlas_person_id') IS NULL
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3. UPSERT VALID ROWS TO DISCOVERY CANDIDATES
  IF v_total_valid > 0 THEN
    WITH upsert_results AS (
      INSERT INTO public.atlas_people_discovery_candidates (
        discovery_id, display_name, profession, role, organization,
        search_text_normalized, location_relation_type, neighborhood,
        geography_id, current_activity_state, last_seen_at, source_last_checked_at,
        source_id, source_record_id, person_source_url, location_source_url,
        location_evidence, evidence_strength, first_seen_at, social_profiles, atlas_person_id
      )
      SELECT
        payload->>'discovery_id',
        payload->>'display_name',
        payload->>'profession',
        payload->>'role',
        payload->>'organization',
        public.normalize_search_document(
          payload->>'display_name',
          payload->>'role',
          payload->>'organization',
          payload->>'profession'
        ),
        COALESCE(payload->>'location_relation_type', 'PRIMARY_OFFICE'),
        COALESCE(payload->>'neighborhood', 'Caballito'),
        payload->>'geography_id',
        COALESCE(payload->>'current_activity_state', 'ACTIVE'),
        COALESCE((payload->>'last_seen_at')::timestamptz, now()),
        COALESCE((payload->>'source_last_checked_at')::timestamptz, now()),
        payload->>'source_id',
        payload->>'source_record_id',
        COALESCE(payload->>'person_source_url', payload->>'location_source_url', 'https://youapp.tv/atlas/source/' || (payload->>'source_id')),
        COALESCE(payload->>'location_source_url', payload->>'person_source_url', 'https://youapp.tv/atlas/source/' || (payload->>'source_id')),
        COALESCE(payload->>'location_evidence', 'EVIDENCIA_VERIFICADA_CANAL_OFICIAL'),
        COALESCE(payload->>'evidence_strength', 'STRONG'),
        COALESCE((payload->>'first_seen_at')::timestamptz, now()),
        payload->'social_profiles',
        canonical_id
      FROM tmp_valid_batch
      ON CONFLICT (source_id, source_record_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        profession = EXCLUDED.profession,
        role = EXCLUDED.role,
        organization = EXCLUDED.organization,
        search_text_normalized = EXCLUDED.search_text_normalized,
        location_relation_type = EXCLUDED.location_relation_type,
        neighborhood = EXCLUDED.neighborhood,
        geography_id = EXCLUDED.geography_id,
        current_activity_state = EXCLUDED.current_activity_state,
        last_seen_at = EXCLUDED.last_seen_at,
        source_last_checked_at = EXCLUDED.source_last_checked_at,
        person_source_url = EXCLUDED.person_source_url,
        location_source_url = EXCLUDED.location_source_url,
        location_evidence = EXCLUDED.location_evidence,
        evidence_strength = EXCLUDED.evidence_strength,
        social_profiles = EXCLUDED.social_profiles,
        atlas_person_id = EXCLUDED.atlas_person_id
      WHERE public.atlas_people_discovery_candidates.source_last_checked_at < EXCLUDED.source_last_checked_at
      RETURNING (xmax = 0) AS is_insert
    )
    SELECT 
      COUNT(*) FILTER (WHERE is_insert) AS inserted,
      COUNT(*) FILTER (WHERE NOT is_insert) AS updated
    INTO v_inserted_count, v_updated_count
    FROM upsert_results;

    v_unchanged_count := v_total_valid - (v_inserted_count + v_updated_count);

    -- 4. ACKNOWLEDGE PUBLISHED IN OUTBOX V2
    UPDATE public.atlas_search_outbox_v2 o
    SET 
      status = 'PUBLISHED',
      published_at = now(),
      last_error = NULL
    FROM tmp_valid_batch tb
    WHERE o.created_at = tb.created_at AND o.outbox_id = tb.outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'claimed', v_claimed_count,
    'total_published', v_total_valid,
    'total_inserted', v_inserted_count,
    'total_updated', v_updated_count,
    'total_unchanged', v_unchanged_count,
    'total_quarantined', v_quarantined_count,
    'failed', 0
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
`);
console.log('✅ process_search_outbox_batch updated to V2.');

await client.end();
