-- APLICAR EN SUPABASE DASHBOARD > SQL EDITOR
-- v4: SINGLE-RPC PUBLISHER WITH NO-OP UPSERT ELIMINATION
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.process_search_outbox_batch(
  p_limit int,
  p_worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_total_claimed     int := 0;
  v_total_valid       int := 0;
  v_total_inserted    int := 0;
  v_total_updated     int := 0;
  v_total_unchanged   int := 0;
  v_total_acked       int := 0;
  v_total_quarantined int := 0;
  
  -- Timing variables
  t_start             timestamp;
  t_claim             timestamp;
  t_validate_quar     timestamp;
  t_upsert            timestamp;
  t_ack               timestamp;
  
  ms_claim            numeric;
  ms_validate_quar    numeric;
  ms_upsert           numeric;
  ms_ack              numeric;
  ms_total            numeric;
BEGIN
  t_start := clock_timestamp();

  -- 1. CLAIM BATCH
  CREATE TEMP TABLE IF NOT EXISTS tmp_claimed_batch (
    outbox_id uuid,
    payload_version int,
    payload jsonb
  ) ON COMMIT DROP;
  
  CREATE TEMP TABLE IF NOT EXISTS tmp_valid_batch (
    outbox_id uuid,
    payload_version int,
    payload jsonb
  ) ON COMMIT DROP;

  CREATE TEMP TABLE IF NOT EXISTS tmp_invalid_batch (
    outbox_id uuid,
    payload_version int,
    payload jsonb
  ) ON COMMIT DROP;

  TRUNCATE TABLE tmp_claimed_batch, tmp_valid_batch, tmp_invalid_batch;

  WITH claimed AS (
    SELECT outbox_id, payload_version, payload
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
      AND next_retry_at <= now()
    ORDER BY next_retry_at ASC, outbox_id ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  INSERT INTO tmp_claimed_batch (outbox_id, payload_version, payload)
  SELECT outbox_id, payload_version, payload FROM claimed;

  SELECT count(*) INTO v_total_claimed FROM tmp_claimed_batch;

  t_claim := clock_timestamp();
  ms_claim := extract(epoch from (t_claim - t_start)) * 1000;

  IF v_total_claimed = 0 THEN
    RETURN jsonb_build_object(
      'ok', true, 
      'total_claimed', 0,
      'total_valid', 0,
      'total_published', 0,
      'total_quarantined', 0,
      'total_failed', 0,
      'timings', jsonb_build_object(
        'claim_ms', ms_claim,
        'total_rpc_ms', ms_claim
      )
    );
  END IF;

  -- 2. VALIDATE
  INSERT INTO tmp_valid_batch
  SELECT * FROM tmp_claimed_batch
  WHERE (payload->>'discovery_id') IS NOT NULL 
    AND btrim(payload->>'discovery_id') <> '';

  INSERT INTO tmp_invalid_batch
  SELECT * FROM tmp_claimed_batch
  WHERE (payload->>'discovery_id') IS NULL 
     OR btrim(payload->>'discovery_id') = '';

  SELECT count(*) INTO v_total_valid FROM tmp_valid_batch;

  -- 3. QUARANTINE INVALID ROWS SET-BASED
  WITH q AS (
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'QUARANTINED',
      quarantined_at = now(),
      last_error = 'MISSING_DISCOVERY_ID_UNRECOVERABLE',
      processing_worker_id = p_worker_id
    FROM tmp_invalid_batch t
    WHERE o.outbox_id = t.outbox_id
      AND o.payload_version = t.payload_version
    RETURNING 1
  )
  SELECT count(*) INTO v_total_quarantined FROM q;

  t_validate_quar := clock_timestamp();
  ms_validate_quar := extract(epoch from (t_validate_quar - t_claim)) * 1000;

  -- 4. SEARCH UPSERT ONLY VALID (ELIMINATING NO-OP UPSERTS)
  IF v_total_valid > 0 THEN
    WITH upsert_candidates AS (
      INSERT INTO public.atlas_people_discovery_candidates AS target (
        discovery_id,
        display_name,
        profession,
        role,
        organization,
        geography_id,
        neighborhood,
        location_relation_type,
        location_evidence,
        location_source_url,
        source_id,
        source_record_id,
        person_source_url,
        search_text_normalized,
        current_activity_state,
        evidence_strength,
        social_profiles,
        first_seen_at,
        last_seen_at,
        source_last_checked_at
      )
      SELECT 
        payload->>'discovery_id',
        payload->>'display_name',
        payload->>'profession',
        payload->>'role',
        payload->>'organization',
        payload->>'geography_id',
        payload->>'neighborhood',
        payload->>'location_relation_type',
        payload->>'location_evidence',
        payload->>'location_source_url',
        payload->>'source_id',
        payload->>'source_record_id',
        payload->>'person_source_url',
        payload->>'search_text_normalized',
        payload->>'current_activity_state',
        payload->>'evidence_strength',
        CASE 
          WHEN payload->'social_profiles' IS NOT NULL THEN payload->'social_profiles'
          ELSE '[]'::jsonb 
        END,
        (payload->>'first_seen_at')::timestamptz,
        (payload->>'last_seen_at')::timestamptz,
        (payload->>'source_last_checked_at')::timestamptz
      FROM tmp_valid_batch
      ON CONFLICT (source_id, source_record_id) DO UPDATE SET
        discovery_id           = EXCLUDED.discovery_id,
        display_name           = EXCLUDED.display_name,
        profession             = EXCLUDED.profession,
        role                   = EXCLUDED.role,
        organization           = EXCLUDED.organization,
        geography_id           = EXCLUDED.geography_id,
        neighborhood           = EXCLUDED.neighborhood,
        location_relation_type = EXCLUDED.location_relation_type,
        location_evidence      = EXCLUDED.location_evidence,
        location_source_url    = EXCLUDED.location_source_url,
        source_id              = EXCLUDED.source_id,
        source_record_id       = EXCLUDED.source_record_id,
        person_source_url      = EXCLUDED.person_source_url,
        search_text_normalized = EXCLUDED.search_text_normalized,
        current_activity_state = EXCLUDED.current_activity_state,
        evidence_strength      = EXCLUDED.evidence_strength,
        social_profiles        = EXCLUDED.social_profiles,
        last_seen_at           = LEAST(target.last_seen_at, EXCLUDED.last_seen_at),
        source_last_checked_at = EXCLUDED.source_last_checked_at
      WHERE 
           target.display_name IS DISTINCT FROM EXCLUDED.display_name
        OR target.profession IS DISTINCT FROM EXCLUDED.profession
        OR target.role IS DISTINCT FROM EXCLUDED.role
        OR target.organization IS DISTINCT FROM EXCLUDED.organization
        OR target.geography_id IS DISTINCT FROM EXCLUDED.geography_id
        OR target.neighborhood IS DISTINCT FROM EXCLUDED.neighborhood
        OR target.location_relation_type IS DISTINCT FROM EXCLUDED.location_relation_type
        OR target.location_evidence IS DISTINCT FROM EXCLUDED.location_evidence
        OR target.location_source_url IS DISTINCT FROM EXCLUDED.location_source_url
        OR target.discovery_id IS DISTINCT FROM EXCLUDED.discovery_id
        OR target.person_source_url IS DISTINCT FROM EXCLUDED.person_source_url
        OR target.search_text_normalized IS DISTINCT FROM EXCLUDED.search_text_normalized
        OR target.current_activity_state IS DISTINCT FROM EXCLUDED.current_activity_state
        OR target.evidence_strength IS DISTINCT FROM EXCLUDED.evidence_strength
        OR target.social_profiles IS DISTINCT FROM EXCLUDED.social_profiles
        OR target.source_last_checked_at IS DISTINCT FROM EXCLUDED.source_last_checked_at
      RETURNING xmax
    )
    SELECT 
      count(*) FILTER (WHERE xmax::text = '0'),
      count(*) FILTER (WHERE xmax::text <> '0')
    INTO v_total_inserted, v_total_updated
    FROM upsert_candidates;
    
    v_total_unchanged := v_total_valid - (v_total_inserted + v_total_updated);

    t_upsert := clock_timestamp();
    ms_upsert := extract(epoch from (t_upsert - t_validate_quar)) * 1000;

    -- 5. VERSION-SAFE ACK ONLY VALID (MÍNIMO)
    WITH acked AS (
      UPDATE public.atlas_search_outbox o
      SET 
        status = 'PUBLISHED',
        published_at = now(),
        processing_worker_id = p_worker_id,
        last_error = NULL
      FROM tmp_valid_batch t
      WHERE o.outbox_id = t.outbox_id
        AND o.payload_version = t.payload_version
      RETURNING 1
    )
    SELECT count(*) INTO v_total_acked FROM acked;
  ELSE
    t_upsert := t_validate_quar;
    ms_upsert := 0;
  END IF;

  t_ack := clock_timestamp();
  ms_ack := extract(epoch from (t_ack - t_upsert)) * 1000;
  ms_total := extract(epoch from (t_ack - t_start)) * 1000;

  RETURN jsonb_build_object(
    'ok', true,
    'total_claimed', v_total_claimed,
    'total_valid', v_total_valid,
    'total_inserted', v_total_inserted,
    'total_updated', v_total_updated,
    'total_unchanged', v_total_unchanged,
    'total_published', v_total_acked,
    'total_quarantined', v_total_quarantined,
    'total_failed', 0,
    'timings', jsonb_build_object(
      'claim_ms', ms_claim,
      'validate_quarantine_ms', ms_validate_quar,
      'search_upsert_ms', ms_upsert,
      'ack_ms', ms_ack,
      'total_rpc_ms', ms_total
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Fallback protection
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- SEGURIDAD
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_search_outbox_batch(int, text) TO service_role;
