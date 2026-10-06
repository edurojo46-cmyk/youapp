-- ═══════════════════════════════════════════════════════════════════════════
-- APLICAR EN SUPABASE DASHBOARD > SQL EDITOR
-- URL: https://supabase.com/dashboard/project/jtnurafmngaxdwlzpvxv/sql/new
-- REEMPLAZO SET-BASED PARA LA RPC ATÓMICA
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox(
  p_identity_rows jsonb,
  p_outbox_rows   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity_count  integer := 0;
  v_outbox_count    integer := 0;
BEGIN
  -- 1. SET-BASED UPSERT FOR IDENTITY MAP
  WITH incoming_identity AS (
    SELECT 
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method,
      COALESCE(observed_at, now()) AS observed_at
    FROM jsonb_to_recordset(p_identity_rows) AS x(
      atlas_person_id text, source_id text, source_person_id text, identifier_type text,
      identifier_value text, evidence_id text, confidence float, resolution_method text,
      observed_at timestamptz
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
    RETURNING 1
  )
  SELECT count(*) INTO v_identity_count FROM upsert_identity;

  -- 2. SET-BASED UPSERT FOR OUTBOX
  WITH incoming_outbox AS (
    SELECT 
      atlas_person_id, source_id, source_record_id, payload,
      COALESCE(payload_version, 1) AS payload_version,
      'PENDING' AS status, 0 AS attempt_count, now() AS next_retry_at
    FROM jsonb_to_recordset(p_outbox_rows) AS x(
      atlas_person_id text, source_id text, source_record_id text,
      payload jsonb, payload_version integer
    )
  ),
  upsert_outbox AS (
    INSERT INTO public.atlas_search_outbox (
      atlas_person_id, source_id, source_record_id, payload, payload_version,
      status, attempt_count, next_retry_at
    )
    SELECT * FROM incoming_outbox
    ON CONFLICT (source_id, source_record_id) DO UPDATE SET
      payload         = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                          THEN EXCLUDED.payload ELSE atlas_search_outbox.payload END,
      payload_version = GREATEST(EXCLUDED.payload_version, atlas_search_outbox.payload_version),
      status          = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                               AND atlas_search_outbox.status = 'PUBLISHED'
                          THEN 'PENDING' ELSE atlas_search_outbox.status END,
      next_retry_at   = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                               AND atlas_search_outbox.status = 'PUBLISHED'
                          THEN now() ELSE atlas_search_outbox.next_retry_at END
    RETURNING 1
  )
  SELECT count(*) INTO v_outbox_count FROM upsert_outbox;

  RETURN jsonb_build_object('ok', true,
    'identity_upserted', v_identity_count, 'outbox_enqueued', v_outbox_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) TO service_role;

-- ── VERIFICACIÓN ──────────────────────────────────────────────────────────
SELECT public.commit_canonical_with_search_outbox('[]'::jsonb, '[]'::jsonb);
-- Esperado: {"ok": true, "identity_upserted": 0, "outbox_enqueued": 0}
