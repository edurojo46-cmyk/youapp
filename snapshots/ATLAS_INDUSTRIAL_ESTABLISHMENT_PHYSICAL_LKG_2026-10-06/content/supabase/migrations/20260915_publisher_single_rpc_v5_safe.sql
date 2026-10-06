-- =========================================================================================
-- V5 FASE A - SAFE (Trigger Bypass)
-- =========================================================================================
-- Elimina el trigger row-by-row y mueve la llamada a public.normalize_search_document
-- directamente al INSERT/UPDATE set-based. Mantiene todos los índices GIN.
-- =========================================================================================

-- 1. Eliminar el trigger que causaba overhead row-by-row
DROP TRIGGER IF EXISTS trg_atlas_people_search_normalized ON public.atlas_people_discovery_candidates;

-- 2. Reemplazar la RPC para calcular el search_text_normalized nativamente
CREATE OR REPLACE FUNCTION public.process_search_outbox_batch(p_limit int, p_worker_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claimed_count int;
  v_inserted_count int := 0;
  v_updated_count int := 0;
  v_unchanged_count int := 0;
BEGIN
  -- 1. CLAIM BATCH
  CREATE TEMP TABLE tmp_batch ON COMMIT DROP AS
  WITH claimed AS (
    SELECT outbox_id
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
      AND next_retry_at <= now()
    ORDER BY next_retry_at ASC, outbox_id ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'PROCESSING',
      processing_started_at = now(),
      processing_worker_id = p_worker_id
    FROM claimed c
    WHERE o.outbox_id = c.outbox_id
    RETURNING o.outbox_id, o.payload, o.payload_version
  )
  SELECT * FROM updated;

  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;
  IF v_claimed_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'claimed', 0);
  END IF;

  -- 2. SEPARAR VALID / POISON
  CREATE TEMP TABLE tmp_valid_batch ON COMMIT DROP AS
  SELECT * FROM tmp_batch WHERE payload->>'discovery_id' IS NOT NULL;

  CREATE TEMP TABLE tmp_invalid_batch ON COMMIT DROP AS
  SELECT * FROM tmp_batch WHERE payload->>'discovery_id' IS NULL;

  -- 3. UPSERT ONLY VALID ROWS (Con V4 No-Op Optimization y V5 Trigger Bypass)
  IF EXISTS (SELECT 1 FROM tmp_valid_batch) THEN
    WITH upsert_results AS (
      INSERT INTO public.atlas_people_discovery_candidates (
        discovery_id,
        display_name,
        profession,
        role,
        organization,
        search_text_normalized,
        location_relation_type,
        neighborhood,
        geography_id,
        current_activity_state,
        last_seen_at,
        source_last_checked_at,
        source_id,
        source_record_id,
        person_source_url,
        location_source_url,
        location_evidence
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
        COALESCE(payload->>'location_relation_type', 'caba_comuna_6_caballito'),
        payload->>'neighborhood',
        payload->>'geography_id',
        COALESCE(payload->>'current_activity_state', 'ACTIVE'),
        COALESCE((payload->>'last_seen_at')::timestamptz, now()),
        COALESCE((payload->>'source_last_checked_at')::timestamptz, now()),
        COALESCE(payload->>'source_id', 'test_source'),
        COALESCE(payload->>'source_record_id', gen_random_uuid()::text),
        payload->>'person_source_url',
        payload->>'location_source_url',
        payload->>'location_evidence'
      FROM tmp_valid_batch
      ON CONFLICT (source_id, source_record_id) DO UPDATE SET
        discovery_id           = EXCLUDED.discovery_id,
        display_name           = EXCLUDED.display_name,
        profession             = EXCLUDED.profession,
        role                   = EXCLUDED.role,
        organization           = EXCLUDED.organization,
        search_text_normalized = EXCLUDED.search_text_normalized,
        location_relation_type = EXCLUDED.location_relation_type,
        neighborhood           = EXCLUDED.neighborhood,
        geography_id           = EXCLUDED.geography_id,
        current_activity_state = EXCLUDED.current_activity_state,
        last_seen_at           = EXCLUDED.last_seen_at,
        source_last_checked_at = EXCLUDED.source_last_checked_at,
        person_source_url      = EXCLUDED.person_source_url,
        location_source_url    = EXCLUDED.location_source_url,
        location_evidence      = EXCLUDED.location_evidence
      WHERE 
           atlas_people_discovery_candidates.display_name IS DISTINCT FROM EXCLUDED.display_name
        OR atlas_people_discovery_candidates.profession IS DISTINCT FROM EXCLUDED.profession
        OR atlas_people_discovery_candidates.role IS DISTINCT FROM EXCLUDED.role
        OR atlas_people_discovery_candidates.organization IS DISTINCT FROM EXCLUDED.organization
        OR atlas_people_discovery_candidates.neighborhood IS DISTINCT FROM EXCLUDED.neighborhood
        OR atlas_people_discovery_candidates.geography_id IS DISTINCT FROM EXCLUDED.geography_id
        OR atlas_people_discovery_candidates.location_relation_type IS DISTINCT FROM EXCLUDED.location_relation_type
        OR atlas_people_discovery_candidates.location_evidence IS DISTINCT FROM EXCLUDED.location_evidence
        OR atlas_people_discovery_candidates.location_source_url IS DISTINCT FROM EXCLUDED.location_source_url
        OR atlas_people_discovery_candidates.discovery_id IS DISTINCT FROM EXCLUDED.discovery_id
        OR atlas_people_discovery_candidates.person_source_url IS DISTINCT FROM EXCLUDED.person_source_url
        OR atlas_people_discovery_candidates.search_text_normalized IS DISTINCT FROM EXCLUDED.search_text_normalized
        OR atlas_people_discovery_candidates.current_activity_state IS DISTINCT FROM EXCLUDED.current_activity_state
      RETURNING xmax
    )
    SELECT 
      count(*) FILTER (WHERE xmax = 0),
      count(*) FILTER (WHERE xmax <> 0)
    INTO v_inserted_count, v_updated_count
    FROM upsert_results;

    v_unchanged_count := (SELECT count(*) FROM tmp_valid_batch) - v_inserted_count - v_updated_count;

    -- ACK VALID
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'PUBLISHED',
      published_at = now(),
      processing_worker_id = p_worker_id,
      last_error = NULL
    FROM tmp_valid_batch t
    WHERE o.outbox_id = t.outbox_id
      AND o.payload_version = t.payload_version;
  END IF;

  -- 4. QUARANTINE POISON ROWS
  IF EXISTS (SELECT 1 FROM tmp_invalid_batch) THEN
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'QUARANTINED',
      last_error = 'Missing discovery_id',
      next_retry_at = now() + interval '100 years'
    FROM tmp_invalid_batch t
    WHERE o.outbox_id = t.outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'claimed', v_claimed_count,
    'published', COALESCE(v_inserted_count + v_updated_count + v_unchanged_count, 0),
    'inserted', v_inserted_count,
    'updated', v_updated_count,
    'unchanged', v_unchanged_count,
    'quarantined', (SELECT count(*) FROM tmp_invalid_batch),
    'failed', 0
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- SEGURIDAD
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_search_outbox_batch(int, text) TO service_role;
