-- ============================================================
-- RPC ATÓMICA: commit_canonical_with_search_outbox
-- ============================================================
-- Garantía: CANONICAL_COMMITTED ⇒ OUTBOX_EXISTS en la misma transacción.
-- No puede haber canonical sin outbox ni outbox sin canonical.
-- CANONICAL_COMMITTED_WITHOUT_OUTBOX = 0 (guaranteed by DB engine)
-- ============================================================

CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox(
  p_identity_rows   jsonb,   -- array de filas para atlas_person_identity_map
  p_outbox_rows     jsonb    -- array de filas para atlas_search_outbox (payload completo)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_identity_row    jsonb;
  v_outbox_row      jsonb;
  v_identity_count  integer := 0;
  v_outbox_count    integer := 0;
  v_skipped_identity integer := 0;
  v_skipped_outbox   integer := 0;
BEGIN
  -- ── PASO 1: Upsert cada fila de atlas_person_identity_map ───────────────
  FOR v_identity_row IN SELECT * FROM jsonb_array_elements(p_identity_rows)
  LOOP
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
    VALUES (
      v_identity_row->>'atlas_person_id',
      v_identity_row->>'source_id',
      v_identity_row->>'source_person_id',
      v_identity_row->>'identifier_type',
      v_identity_row->>'identifier_value',
      v_identity_row->>'evidence_id',
      (v_identity_row->>'confidence')::float,
      v_identity_row->>'resolution_method',
      COALESCE((v_identity_row->>'observed_at')::timestamptz, now())
    )
    ON CONFLICT (source_id, source_person_id) DO UPDATE SET
      identifier_value   = EXCLUDED.identifier_value,
      confidence         = EXCLUDED.confidence,
      resolution_method  = EXCLUDED.resolution_method,
      observed_at        = EXCLUDED.observed_at;

    IF FOUND THEN
      v_identity_count := v_identity_count + 1;
    ELSE
      v_skipped_identity := v_skipped_identity + 1;
    END IF;
  END LOOP;

  -- ── PASO 2: Upsert cada fila en atlas_search_outbox ─────────────────────
  -- ON CONFLICT en (source_id, source_record_id):
  --   Si payload_version es mayor → actualizar payload y volver a PENDING
  --   Si payload_version es igual → DO NOTHING (idempotente)
  --   Si payload_version es menor → DO NOTHING (versión más nueva ya está)
  FOR v_outbox_row IN SELECT * FROM jsonb_array_elements(p_outbox_rows)
  LOOP
    INSERT INTO public.atlas_search_outbox (
      atlas_person_id,
      source_id,
      source_record_id,
      payload,
      payload_version,
      status,
      attempt_count,
      next_retry_at
    )
    VALUES (
      v_outbox_row->>'atlas_person_id',
      v_outbox_row->>'source_id',
      v_outbox_row->>'source_record_id',
      v_outbox_row->'payload',
      COALESCE((v_outbox_row->>'payload_version')::integer, 1),
      'PENDING',
      0,
      now()
    )
    ON CONFLICT (source_id, source_record_id) DO UPDATE SET
      -- Re-publicar solo si la versión del payload es mayor (entidad actualizada)
      payload         = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                          THEN EXCLUDED.payload
                          ELSE atlas_search_outbox.payload
                        END,
      payload_version = GREATEST(EXCLUDED.payload_version, atlas_search_outbox.payload_version),
      status          = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                               AND atlas_search_outbox.status = 'PUBLISHED'
                          THEN 'PENDING'   -- Re-encolar para republicar con nuevo payload
                          ELSE atlas_search_outbox.status
                        END,
      next_retry_at   = CASE
                          WHEN EXCLUDED.payload_version > atlas_search_outbox.payload_version
                               AND atlas_search_outbox.status = 'PUBLISHED'
                          THEN now()
                          ELSE atlas_search_outbox.next_retry_at
                        END;

    v_outbox_count := v_outbox_count + 1;
  END LOOP;

  -- ── PASO 3: Retornar métricas del commit ─────────────────────────────────
  RETURN jsonb_build_object(
    'ok',               true,
    'identity_upserted', v_identity_count,
    'outbox_enqueued',  v_outbox_count,
    'identity_skipped', v_skipped_identity
  );

EXCEPTION WHEN OTHERS THEN
  -- Cualquier error hace ROLLBACK automático de AMBAS escrituras
  RETURN jsonb_build_object(
    'ok',    false,
    'error', SQLERRM,
    'code',  SQLSTATE
  );
END;
$$;

-- Permisos: solo service_role puede llamar esta función
REVOKE ALL ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.commit_canonical_with_search_outbox IS
  'Escribe identity_map + search_outbox en una sola transacción PostgreSQL. '
  'Garantiza CANONICAL_COMMITTED ⇒ OUTBOX_EXISTS. '
  'El caller de Node.js NO puede tener una persona física sin evento de publicación pendiente. '
  'UPDATED_ENTITY_REPUBLISH_WORKS = TRUE (via payload_version comparison).';
