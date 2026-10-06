-- ═══════════════════════════════════════════════════════════════════════════
-- APLICAR EN SUPABASE DASHBOARD > SQL EDITOR
-- v3: SET-BASED PURA, SEGURA Y CON DEDUPLICACIÓN
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.commit_canonical_with_search_outbox(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox(
  p_identity_rows jsonb,
  p_outbox_rows   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_identity_total    integer := 0;
  v_identity_inserted integer := 0;
  v_identity_updated  integer := 0;
  v_outbox_total      integer := 0;
  v_outbox_inserted   integer := 0;
  v_outbox_updated    integer := 0;
  v_new_unique_people integer := 0;
BEGIN
  -- 1. SET-BASED UPSERT FOR IDENTITY MAP
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

  -- 2. SET-BASED UPSERT FOR OUTBOX
  WITH incoming_outbox AS (
    SELECT DISTINCT ON (source_id, source_record_id)
      atlas_person_id, source_id, source_record_id, payload,
      COALESCE(payload_version, 1) AS payload_version,
      'PENDING' AS status, 0 AS attempt_count, now() AS next_retry_at
    FROM jsonb_to_recordset(p_outbox_rows) AS x(
      atlas_person_id text, source_id text, source_record_id text,
      payload jsonb, payload_version integer
    )
    ORDER BY source_id, source_record_id, payload_version DESC
  ),
  upsert_outbox AS (
    INSERT INTO public.atlas_search_outbox (
      atlas_person_id, source_id, source_record_id, payload, payload_version,
      status, attempt_count, next_retry_at
    )
    SELECT * FROM incoming_outbox
    ON CONFLICT (source_id, source_record_id) DO UPDATE SET
      payload         = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN EXCLUDED.payload ELSE public.atlas_search_outbox.payload END,
      payload_version = GREATEST(EXCLUDED.payload_version, public.atlas_search_outbox.payload_version),
      
      -- RESET EVERYTHING ON NEW VERSION
      status          = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN 'PENDING' ELSE public.atlas_search_outbox.status END,
      attempt_count   = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN 0 ELSE public.atlas_search_outbox.attempt_count END,
      next_retry_at   = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN now() ELSE public.atlas_search_outbox.next_retry_at END,
      last_error      = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN NULL ELSE public.atlas_search_outbox.last_error END,
      processing_worker_id = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN NULL ELSE public.atlas_search_outbox.processing_worker_id END,
      processing_started_at = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN NULL ELSE public.atlas_search_outbox.processing_started_at END,
      published_at    = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN NULL ELSE public.atlas_search_outbox.published_at END,
      quarantined_at  = CASE
                          WHEN EXCLUDED.payload_version > public.atlas_search_outbox.payload_version
                          THEN NULL ELSE public.atlas_search_outbox.quarantined_at END
    RETURNING (xmax = 0) AS is_inserted
  )
  SELECT 
    count(*),
    count(*) FILTER (WHERE is_inserted),
    count(*) FILTER (WHERE NOT is_inserted)
  INTO v_outbox_total, v_outbox_inserted, v_outbox_updated
  FROM upsert_outbox;

  -- 3. RETURN METRICS
  RETURN jsonb_build_object(
    'ok', true,
    'identity_rows_processed', v_identity_total,
    'identity_rows_inserted', v_identity_inserted,
    'identity_rows_updated', v_identity_updated,
    'outbox_rows_created', v_outbox_inserted,
    'outbox_rows_requeued', v_outbox_updated,
    'NEW_UNIQUE_PEOPLE_INSERTED', v_new_unique_people
  );
EXCEPTION WHEN OTHERS THEN
  -- El RAISE propagaría el rollback al engine y terminaría la RPC con un status HTTP 500.
  -- Como la API actual del worker espera {"ok":false}, PostgreSQL hace rollback *implícito* del bloque
  -- al dispararse la EXCEPTION y saltar a este RETURN. Por ende, la ATOMICIDAD se preserva.
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

-- ENDURECIMIENTO DE SEGURIDAD
REVOKE ALL ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) TO service_role;
