-- ═══════════════════════════════════════════════════════════════════════════
-- APLICAR EN SUPABASE DASHBOARD > SQL EDITOR
-- v2: SINGLE-RPC PUBLISHER (CLAIM + UPSERT + ACK)
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_total_processed int := 0;
  v_total_upserted  int := 0;
  v_total_acked     int := 0;
BEGIN
  -- 1. CLAIM BATCH
  -- Usamos una tabla temporal para retener los registros bloqueados durante esta transacción
  CREATE TEMP TABLE IF NOT EXISTS tmp_claimed_batch (
    outbox_id uuid,
    payload_version int,
    payload jsonb
  ) ON COMMIT DROP;
  
  -- Vaciar por si la conexión reusa la sesión
  TRUNCATE TABLE tmp_claimed_batch;

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

  SELECT count(*) INTO v_total_processed FROM tmp_claimed_batch;

  IF v_total_processed = 0 THEN
    RETURN jsonb_build_object('ok', true, 'total_processed', 0);
  END IF;

  -- 2. SEARCH UPSERT (100% Set-Based usando el payload idéntico de la factory)
  -- La factory ya generó el string de búsqueda normalizado y los campos de evidencia.
  -- Esta RPC NO inventa evidencia ni altera el search string.
  WITH upsert_candidates AS (
    INSERT INTO public.atlas_people_discovery_candidates (
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
    FROM tmp_claimed_batch
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
      person_source_url      = EXCLUDED.person_source_url,
      search_text_normalized = EXCLUDED.search_text_normalized,
      current_activity_state = EXCLUDED.current_activity_state,
      evidence_strength      = EXCLUDED.evidence_strength,
      social_profiles        = EXCLUDED.social_profiles,
      last_seen_at           = EXCLUDED.last_seen_at,
      source_last_checked_at = EXCLUDED.source_last_checked_at
    RETURNING 1
  )
  SELECT count(*) INTO v_total_upserted FROM upsert_candidates;

  -- 3. VERSION-SAFE ACK
  WITH acked AS (
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'PUBLISHED',
      published_at = now(),
      processing_worker_id = p_worker_id,
      last_error = NULL
    FROM tmp_claimed_batch t
    WHERE o.outbox_id = t.outbox_id
      AND o.payload_version = t.payload_version
    RETURNING 1
  )
  SELECT count(*) INTO v_total_acked FROM acked;

  RETURN jsonb_build_object(
    'ok', true,
    'total_processed', v_total_processed,
    'total_upserted', v_total_upserted,
    'total_acked', v_total_acked
  );
EXCEPTION WHEN OTHERS THEN
  -- POISON ROW PROTECTION: Si algo falla (ej. type cast), hace rollback de todo el batch.
  -- El worker Node recibirá ok:false y procederá a reducir el chunk size para aislar el registro (Quarantine).
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- SEGURIDAD
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM anon;
REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_search_outbox_batch(int, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- QUARANTINE POISON ROWS (AISLAR FILA TOXICA EXACTA)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.quarantine_exact_search_outbox_row(
  p_outbox_id uuid,
  p_payload_version int,
  p_error text,
  p_worker_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  UPDATE public.atlas_search_outbox
  SET 
    status = 'QUARANTINED',
    quarantined_at = now(),
    last_error = p_error,
    processing_worker_id = p_worker_id
  WHERE outbox_id = p_outbox_id
    AND payload_version = p_payload_version
    AND status IN ('PENDING', 'RETRY', 'PROCESSING')
  RETURNING true INTO v_updated;

  IF v_updated THEN
    RETURN jsonb_build_object('ok', true, 'quarantined_id', p_outbox_id);
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Row not found or version changed');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.quarantine_exact_search_outbox_row(uuid, int, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quarantine_exact_search_outbox_row(uuid, int, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.quarantine_exact_search_outbox_row(uuid, int, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_exact_search_outbox_row(uuid, int, text, text) TO service_role;
