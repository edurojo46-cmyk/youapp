-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000006_optimize_reconcile_bottleneck.sql
--
-- OPTIMIZACIÓN QUIRÚRGICA DE LA ESTACIÓN RECONCILE (Cuello de botella)
--
-- Hallazgos del Sweep Empírico (5k - 50k):
-- 1. STAGE es ultra-rápido: 10k filas en 2.571 ms (~4.000 rows/s).
-- 2. PUBLISH y SEARCH están sanos: Search P99 < 722 ms, Timeouts = 0.
-- 3. RECONCILE era el cuello de botella: tomaba 4.637 ms en 5k y >8.000 ms
--    (statement timeout) en 10k+.
--
-- Causas físicas resueltas aquí:
-- a) Eliminar índice duplicado de 286 MB en atlas_person_identity_map:
--    idx_identity_map_source_lookup es idéntico a uq_person_identity_source.
-- b) Eliminar índices redundantes en la tabla temporal benchmark_people_staging
--    (idx_benchmark_staging_run_lookup de 62 MB y person_id de 23 MB),
--    dejando únicamente idx_benchmark_staging_run_block.
-- c) Reconcile v2 set-based optimizado:
--    - Una sola lectura de staging (sin segundo COUNT(*) / COUNT(DISTINCT))
--    - Anti-join hacia outbox evaluado solo sobre identidades que realmente
--      necesitan outbox (usando el índice en atlas_person_id)
--    - DELETE por (run_id, block_id) en < 30 ms sin sobrecarga de 4 índices.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Eliminar índice duplicado en identity map
DROP INDEX IF EXISTS public.idx_identity_map_source_lookup;

-- 2. Eliminar índices pesados e innecesarios de la tabla temporal de staging
DROP INDEX IF EXISTS public.idx_benchmark_staging_run_lookup;
DROP INDEX IF EXISTS public.idx_benchmark_staging_person_id;

-- 3. Asegurar el índice exacto para double-buffer en staging
CREATE INDEX IF NOT EXISTS idx_benchmark_staging_run_block
  ON public.benchmark_people_staging (run_id, block_id);

-- 4. Reconcile V2 ultra-optimizado
CREATE OR REPLACE FUNCTION public.atlas_reconcile_and_commit_staging_v2(
  p_run_id   text,
  p_block_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_staged_total       int := 0;
  v_unique_people      int := 0;
  v_inserted           int := 0;
  v_existing_unchanged int := 0;
  v_outbox_produced    int := 0;
BEGIN
  -- ─── 3A. IDENTIDAD CANÓNICA (Single-pass sobre staging) ───────────────────
  WITH incoming AS (
    SELECT DISTINCT ON (source_id, source_person_id)
      atlas_person_id,
      source_id,
      source_person_id,
      identifier_type,
      identity_hmac AS identifier_value,
      'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
      1.0::float8    AS confidence,
      'HMAC_DNI_DETERMINISTIC'::text AS resolution_method,
      now()          AS observed_at
    FROM public.benchmark_people_staging
    WHERE run_id = p_run_id
      AND (p_block_id IS NULL OR block_id = p_block_id)
    ORDER BY source_id, source_person_id
  ),
  inserted_rows AS (
    INSERT INTO public.atlas_person_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT * FROM incoming
    ON CONFLICT (source_id, source_person_id) DO NOTHING
    RETURNING atlas_person_id
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted_rows;

  -- Métricas del bloque en una sola consulta rápida
  SELECT
    COUNT(*),
    COUNT(DISTINCT atlas_person_id)
  INTO v_staged_total, v_unique_people
  FROM public.benchmark_people_staging
  WHERE run_id = p_run_id
    AND (p_block_id IS NULL OR block_id = p_block_id);

  v_existing_unchanged := GREATEST(0, v_staged_total - v_inserted);

  -- ─── 3B. SEARCH OUTBOX (Solo personas del bloque no presentes en discovery) ─
  WITH distinct_block_people AS (
    SELECT DISTINCT ON (atlas_person_id)
      atlas_person_id,
      source_id,
      source_person_id,
      display_name,
      role,
      organization,
      search_text_normalized
    FROM public.benchmark_people_staging
    WHERE run_id = p_run_id
      AND (p_block_id IS NULL OR block_id = p_block_id)
    ORDER BY atlas_person_id
  ),
  new_for_search AS (
    SELECT p.*
    FROM distinct_block_people p
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.atlas_people_discovery_candidates c
      WHERE c.atlas_person_id = p.atlas_person_id
    )
  ),
  outbox_ins AS (
    INSERT INTO public.atlas_search_outbox (
      atlas_person_id, source_id, source_record_id, status, payload, created_at
    )
    SELECT
      u.atlas_person_id,
      u.source_id,
      u.source_person_id,
      'PENDING',
      jsonb_build_object(
        'discovery_id',          'disc_' || lower(substr(u.source_id, 1, 4)) || '_' || substr(u.source_person_id, 1, 24),
        'atlas_person_id',       u.atlas_person_id,
        'display_name',          u.display_name,
        'profession',            'Directivo / Autoridad',
        'role',                  u.role,
        'organization',          u.organization,
        'geography_id',          'arg_nacional',
        'location_relation_type','CORPORATE_AUTHORITY',
        'location_evidence',     'Registro Oficial',
        'search_text_normalized', u.search_text_normalized,
        'current_activity_state','ACTIVE',
        'evidence_strength',     'HIGH',
        'source_id',             u.source_id,
        'source_record_id',      u.source_person_id,
        'social_profiles',       '[]'::jsonb,
        'first_seen_at',         now(),
        'last_seen_at',          now(),
        'source_last_checked_at', now()
      ),
      now()
    FROM new_for_search u
    ON CONFLICT (source_id, source_record_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_outbox_produced FROM outbox_ins;

  -- ─── 3C. CLEANUP DEL BLOQUE EN STAGING ────────────────────────────────────
  DELETE FROM public.benchmark_people_staging
  WHERE run_id = p_run_id
    AND (p_block_id IS NULL OR block_id = p_block_id);

  RETURN jsonb_build_object(
    'ok',                    true,
    'run_id',                p_run_id,
    'block_id',              p_block_id,
    'staged_total',          v_staged_total,
    'unique_people',         v_unique_people,
    'inserted_new',          v_inserted,
    'existing_unchanged',    v_existing_unchanged,
    'outbox_delta_produced', v_outbox_produced
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_v2(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_v2(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_v2(text, bigint) TO anon;
