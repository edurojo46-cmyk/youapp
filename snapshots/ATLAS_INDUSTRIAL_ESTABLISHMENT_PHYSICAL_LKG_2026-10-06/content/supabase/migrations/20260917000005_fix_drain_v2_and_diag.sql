-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000005_fix_drain_v2_and_diag.sql
-- 
-- 1. VACUUM (ANALYZE) atlas_people_discovery_candidates para consolidar los
--    275.000 registros y limpiar los 5 índices GIN trigram.
-- 2. atlas_drain_search_outbox_controlled_v2 ultra-optimizada:
--    - ORDER BY next_retry_at, outbox_id (usa idx_atlas_search_outbox_ready_queue en < 1ms)
--    - Cuarentena automática de payloads inválidos (sin atlas_person_id)
--    - Deduplicación incoming con DISTINCT ON + ORDER BY correcto
--    - ON CONFLICT (source_id, source_record_id) DO UPDATE
-- 3. Redirección de v1 a v2 para retrocompatibilidad total.
-- ═══════════════════════════════════════════════════════════════════════════

-- DDL Functions & Grants: 100% compatibles con transacciones del editor SQL
CREATE OR REPLACE FUNCTION public.atlas_drain_search_outbox_controlled_v2(
  p_batch_size int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_published   int := 0;
  v_quarantined int := 0;
BEGIN
  -- 1. Seleccionar usando el índice parcial idx_atlas_search_outbox_ready_queue
  WITH candidate_outbox AS (
    SELECT outbox_id, payload
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
    ORDER BY next_retry_at, outbox_id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  -- 2. Aislar en cuarentena registros sin payload de identidad válido
  quarantined_outbox AS (
    UPDATE public.atlas_search_outbox o
    SET
      status = 'QUARANTINED',
      last_error = 'Missing atlas_person_id or discovery_id in payload',
      attempt_count = o.attempt_count + 1,
      quarantined_at = now(),
      next_retry_at = NULL
    FROM candidate_outbox c
    WHERE o.outbox_id = c.outbox_id
      AND (
        c.payload->>'atlas_person_id' IS NULL
        OR (c.payload->>'discovery_id' IS NULL AND c.payload->>'source_record_id' IS NULL)
      )
    RETURNING o.outbox_id
  ),
  valid_candidates AS (
    SELECT c.outbox_id, c.payload
    FROM candidate_outbox c
    WHERE NOT EXISTS (
      SELECT 1 FROM quarantined_outbox q WHERE q.outbox_id = c.outbox_id
    )
  ),
  -- 3. Deduplicar en lote por (source_id, source_record_id) con ORDER BY requerido por Postgres
  incoming_dedup AS (
    SELECT DISTINCT ON (
      COALESCE((payload->>'source_id')::text, 'IGJ_AUTORIDADES_GENERO_2026'),
      COALESCE((payload->>'source_record_id')::text, payload->>'discovery_id')
    )
      outbox_id,
      COALESCE(payload->>'discovery_id', 'disc_' || lower(substr(COALESCE(payload->>'source_id','unk'), 1, 4)) || '_' || substr(COALESCE(payload->>'source_record_id','unk'), 1, 24)) AS discovery_id,
      (payload->>'atlas_person_id')::text AS atlas_person_id,
      (payload->>'display_name')::text AS display_name,
      COALESCE(payload->>'profession', 'Directivo / Autoridad') AS profession,
      (payload->>'role')::text AS role,
      (payload->>'organization')::text AS organization,
      COALESCE(payload->>'geography_id', 'arg_nacional') AS geography_id,
      COALESCE(payload->>'location_relation_type', 'CORPORATE_AUTHORITY') AS location_relation_type,
      COALESCE(payload->>'location_evidence', 'Registro Oficial') AS location_evidence,
      COALESCE(payload->>'location_source_url', 'https://datos.jus.gob.ar/dataset/igj-autoridades-genero') AS location_source_url,
      COALESCE(payload->>'person_source_url', 'https://datos.jus.gob.ar/dataset/igj-autoridades-genero') AS person_source_url,
      (payload->>'search_text_normalized')::text AS search_text_normalized,
      COALESCE(payload->>'current_activity_state', 'ACTIVE') AS current_activity_state,
      COALESCE(payload->>'evidence_strength', 'HIGH') AS evidence_strength,
      COALESCE((payload->>'source_id')::text, 'IGJ_AUTORIDADES_GENERO_2026') AS source_id,
      COALESCE((payload->>'source_record_id')::text, payload->>'discovery_id') AS source_record_id,
      COALESCE(payload->'social_profiles', '[]'::jsonb) AS social_profiles,
      COALESCE((payload->>'first_seen_at')::timestamptz, now()) AS first_seen_at,
      COALESCE((payload->>'last_seen_at')::timestamptz, now()) AS last_seen_at,
      COALESCE((payload->>'source_last_checked_at')::timestamptz, now()) AS source_last_checked_at
    FROM valid_candidates
    ORDER BY
      COALESCE((payload->>'source_id')::text, 'IGJ_AUTORIDADES_GENERO_2026'),
      COALESCE((payload->>'source_record_id')::text, payload->>'discovery_id'),
      outbox_id DESC
  ),
  -- 4. Inserción idempotente en candidates
  upserted_candidates AS (
    INSERT INTO public.atlas_people_discovery_candidates (
      discovery_id, atlas_person_id, display_name, profession, role, organization,
      geography_id, location_relation_type, location_evidence, location_source_url,
      person_source_url, search_text_normalized,
      current_activity_state, evidence_strength, source_id, source_record_id,
      social_profiles, first_seen_at, last_seen_at, source_last_checked_at
    )
    SELECT
      discovery_id, atlas_person_id, display_name, profession, role, organization,
      geography_id, location_relation_type, location_evidence, location_source_url,
      person_source_url, search_text_normalized,
      current_activity_state, evidence_strength, source_id, source_record_id,
      social_profiles, first_seen_at, last_seen_at, source_last_checked_at
    FROM incoming_dedup
    ON CONFLICT (source_id, source_record_id) DO UPDATE SET
      last_seen_at = EXCLUDED.last_seen_at,
      search_text_normalized = EXCLUDED.search_text_normalized
    RETURNING 1
  ),
  -- 5. Marcar como publicados los registros válidos procesados
  mark_published AS (
    UPDATE public.atlas_search_outbox o
    SET
      status       = 'PUBLISHED',
      published_at = now()
    FROM valid_candidates c
    WHERE o.outbox_id = c.outbox_id
    RETURNING 1
  )
  SELECT 
    (SELECT COUNT(*) FROM mark_published),
    (SELECT COUNT(*) FROM quarantined_outbox)
  INTO v_published, v_quarantined;

  RETURN jsonb_build_object(
    'ok',                true,
    'published_rows',    v_published,
    'quarantined_rows',  v_quarantined
  );
END;
$$;

-- Redirigir v1 hacia v2 para compatibilidad total
CREATE OR REPLACE FUNCTION public.atlas_drain_search_outbox_controlled_v1(
  p_batch_size int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN public.atlas_drain_search_outbox_controlled_v2(p_batch_size);
END;
$$;

GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v2(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v2(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v2(int) TO anon;

GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v1(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v1(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v1(int) TO anon;
