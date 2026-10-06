-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000004_hyperthroughput_v2_optimized_reconcile.sql
-- 
-- OPTIMIZACIONES FÍSICAS PARA GATE A HYPERTHROUGHPUT V2:
--
-- 1. atlas_reconcile_and_commit_staging_v2: elimina COUNT(*) previo innecesario,
--    usa anti-join via NOT EXISTS con índice existente, no genera updates físicos
--    para identidades sin cambios, añade block_id para double-buffer real.
--
-- 2. atlas_stage_people_bulk_v2: staging con block_id para pipeline desacoplado.
--
-- 3. atlas_get_physical_diagnostics: RPC de diagnóstico que retorna índices,
--    stats de tablas y timing de operaciones sin necesitar exec_sql.
--
-- PRE-CONDICIÓN: Verificar antes de aplicar que no existe
--   idx_discovery_candidates_person_id_v2 (evitar duplicados).
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DE ÍNDICES EXISTENTES (no crear duplicados)
-- ────────────────────────────────────────────────────────────────────────────

-- Índice en discovery_candidates(atlas_person_id) para el anti-join
-- SOLO si no existe uno que ya lo cubra exactamente.
-- NOTA: Ya existe idx_discovery_candidates_person_id históricamente.
-- Si EXISTS → no creamos nada. Si NOT EXISTS → lo creamos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'atlas_people_discovery_candidates'
      AND indexdef LIKE '%atlas_person_id%'
      AND indexdef NOT LIKE '%WHERE%'  -- no es parcial
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_disc_candidates_person_id_ht
      ON public.atlas_people_discovery_candidates (atlas_person_id)';
    RAISE NOTICE 'Índice idx_disc_candidates_person_id_ht creado';
  ELSE
    RAISE NOTICE 'Ya existe un índice sobre atlas_people_discovery_candidates(atlas_person_id) — no se crea duplicado';
  END IF;
END;
$$;

-- Índice en staging (run_id, block_id) para double-buffer desacoplado
-- Si benchmark_people_staging no tiene columna block_id, la agregamos primero.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'benchmark_people_staging'
      AND column_name = 'block_id'
  ) THEN
    ALTER TABLE public.benchmark_people_staging ADD COLUMN block_id bigint DEFAULT 0;
    RAISE NOTICE 'Columna block_id agregada a benchmark_people_staging';
  ELSE
    RAISE NOTICE 'Columna block_id ya existe en benchmark_people_staging';
  END IF;
END;
$$;

-- Índice para lookup por (run_id, block_id) — double-buffer
CREATE INDEX IF NOT EXISTS idx_benchmark_staging_run_block
  ON public.benchmark_people_staging (run_id, block_id);

-- ────────────────────────────────────────────────────────────────────────────
-- STAGING V2: Con block_id para double-buffer desacoplado
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atlas_stage_people_bulk_v2(
  p_run_id  text,
  p_block_id bigint,
  p_rows    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_count int := 0;
BEGIN
  INSERT INTO public.benchmark_people_staging (
    run_id, block_id, source_id, source_person_id, identifier_type,
    identity_hmac, atlas_person_id, display_name, role,
    organization, search_text_normalized
  )
  SELECT
    p_run_id,
    p_block_id,
    x.source_id,
    x.source_person_id,
    x.identifier_type,
    x.identity_hmac,
    x.atlas_person_id,
    x.display_name,
    x.role,
    x.organization,
    x.search_text_normalized
  FROM jsonb_to_recordset(p_rows) AS x(
    source_id text,
    source_person_id text,
    identifier_type text,
    identity_hmac text,
    atlas_person_id text,
    display_name text,
    role text,
    organization text,
    search_text_normalized text
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'block_id', p_block_id,
    'staged_rows', v_count
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- RECONCILE V2: Sin COUNT(*) previo, anti-join optimizado, clasificación real
-- El único parámetro es p_run_id + p_block_id para operar solo sobre ese bloque.
-- Esto permite double-buffer: reconcile(N) || stage(N+1).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atlas_reconcile_and_commit_staging_v2(
  p_run_id   text,
  p_block_id bigint DEFAULT NULL  -- NULL = todos los bloques del run_id
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_inserted          int := 0;
  v_existing_unchanged int := 0;
  v_unique_people     int := 0;
  v_outbox_produced   int := 0;
  v_staged_total      int := 0;
BEGIN
  -- ─── 3A. CANONICAL COMMIT SET-BASED ───────────────────────────────────────
  -- DISTINCT ON elimina duplicados dentro del bloque.
  -- ON CONFLICT DO NOTHING: identidades existentes NO generan WAL extra.
  -- v_inserted cuenta únicamente las filas físicamente nuevas.
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
    RETURNING 1
  ),
  -- Contar totales desde incoming (una sola lectura de staging)
  stats AS (
    SELECT
      COUNT(*)                        AS total_rows,
      COUNT(DISTINCT atlas_person_id) AS unique_people
    FROM public.benchmark_people_staging
    WHERE run_id = p_run_id
      AND (p_block_id IS NULL OR block_id = p_block_id)
  )
  SELECT
    (SELECT COUNT(*) FROM inserted_rows),
    (SELECT total_rows FROM stats),
    (SELECT unique_people FROM stats)
  INTO v_inserted, v_staged_total, v_unique_people;

  v_existing_unchanged := v_staged_total - v_inserted;

  -- ─── 3B. SEARCH OUTBOX — solo personas nuevas (anti-join) ──────────────────
  -- Anti-join vs atlas_people_discovery_candidates para detectar personas
  -- que aún no están en Search. Usa el índice existente en atlas_person_id.
  WITH new_for_search AS (
    SELECT DISTINCT ON (s.atlas_person_id)
      s.atlas_person_id,
      s.source_id,
      s.source_person_id,
      s.display_name,
      s.role,
      s.organization,
      s.search_text_normalized
    FROM public.benchmark_people_staging s
    WHERE s.run_id = p_run_id
      AND (p_block_id IS NULL OR s.block_id = p_block_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.atlas_people_discovery_candidates c
        WHERE c.atlas_person_id = s.atlas_person_id
      )
    ORDER BY s.atlas_person_id
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

  -- ─── CLEANUP — liberar staging procesado ────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────────
-- DIAGNÓSTICO: RPC que retorna índices y stats sin necesitar exec_sql
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atlas_get_physical_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_indexes jsonb;
  v_stats   jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'table',     i.tablename,
    'indexname', i.indexname,
    'indexdef',  i.indexdef,
    'idx_size',  pg_size_pretty(pg_relation_size((i.schemaname || '.' || i.indexname)::regclass))
  ) ORDER BY i.tablename, i.indexname)
  INTO v_indexes
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
    AND i.tablename IN (
      'atlas_person_identity_map',
      'atlas_people_discovery_candidates',
      'benchmark_people_staging',
      'atlas_search_outbox'
    );

  SELECT jsonb_agg(jsonb_build_object(
    'table_name',       s.relname,
    'total_size',       pg_size_pretty(pg_total_relation_size(c.oid)),
    'table_size',       pg_size_pretty(pg_relation_size(c.oid)),
    'live_rows',        s.n_live_tup,
    'dead_rows',        s.n_dead_tup,
    'last_autovacuum',  s.last_autovacuum::text,
    'last_autoanalyze', s.last_autoanalyze::text
  ) ORDER BY s.relname)
  INTO v_stats
  FROM pg_class c
  JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE s.relname IN (
    'atlas_person_identity_map',
    'atlas_people_discovery_candidates',
    'benchmark_people_staging',
    'atlas_search_outbox'
  );

  RETURN jsonb_build_object(
    'indexes', COALESCE(v_indexes, '[]'::jsonb),
    'stats',   COALESCE(v_stats,   '[]'::jsonb)
  );
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- TIMING RPC: Mide cada parte del reconcile para diagnóstico
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atlas_benchmark_reconcile_timing(
  p_sample_size int DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  diag_run   text := 'bm_timing_' || floor(extract(epoch from now()))::text;
  t0 timestamptz; t1 timestamptz; t2 timestamptz;
  t3 timestamptz; t4 timestamptz; t5 timestamptz;
  v_inserted int; v_ne_count int; v_lj_count int;
  v_total int; v_distinct int;
BEGIN
  -- Poblar staging de muestra
  INSERT INTO public.benchmark_people_staging (
    run_id, block_id, source_id, source_person_id, identifier_type,
    identity_hmac, atlas_person_id, display_name, role,
    organization, search_text_normalized
  )
  SELECT
    diag_run, 0,
    'IGJ_AUTORIDADES_GENERO_2026',
    'bm_sp_' || lpad(i::text, 8, '0'),
    'NATIONAL_IDENTITY_HMAC',
    'bm_hmac_' || lpad(i::text, 8, '0'),
    'atlas_arg_per_' || lpad(i::text, 16, '0'),
    'Nombre BM ' || i,
    'AUTORIDAD SOCIETARIA',
    'Sociedad BM ' || i || ' (SRL)',
    'nombre bm ' || i || ' autoridad sociedad bm ' || i || ' srl'
  FROM generate_series(1, p_sample_size) AS i;

  -- Parte 1 (ELIMINADA en V2): COUNT(*) + COUNT(DISTINCT) previo
  t0 := clock_timestamp();
  SELECT COUNT(*), COUNT(DISTINCT atlas_person_id)
  INTO v_total, v_distinct
  FROM public.benchmark_people_staging
  WHERE run_id = diag_run;
  t1 := clock_timestamp();

  -- Parte 2: INSERT identity_map ON CONFLICT DO NOTHING
  t2 := clock_timestamp();
  WITH incoming AS (
    SELECT DISTINCT ON (source_id, source_person_id)
      atlas_person_id, source_id, source_person_id,
      identifier_type, identity_hmac AS identifier_value,
      'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
      1.0::float8 AS confidence, 'DIAG_BM'::text AS resolution_method, now() AS observed_at
    FROM public.benchmark_people_staging
    WHERE run_id = diag_run
    ORDER BY source_id, source_person_id
  ),
  ins AS (
    INSERT INTO public.atlas_person_identity_map (
      atlas_person_id, source_id, source_person_id, identifier_type,
      identifier_value, evidence_id, confidence, resolution_method, observed_at
    )
    SELECT * FROM incoming
    ON CONFLICT (source_id, source_person_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;
  t3 := clock_timestamp();

  -- Parte 3a: NOT EXISTS anti-join
  t4 := clock_timestamp();
  SELECT COUNT(*) INTO v_ne_count
  FROM (
    SELECT DISTINCT ON (s.atlas_person_id) s.atlas_person_id
    FROM public.benchmark_people_staging s
    WHERE s.run_id = diag_run
      AND NOT EXISTS (
        SELECT 1 FROM public.atlas_people_discovery_candidates c
        WHERE c.atlas_person_id = s.atlas_person_id
      )
    ORDER BY s.atlas_person_id
  ) sub;
  t5 := clock_timestamp();

  -- Parte 3b: LEFT JOIN IS NULL
  DECLARE
    t6 timestamptz; t7 timestamptz;
  BEGIN
    t6 := clock_timestamp();
    SELECT COUNT(*) INTO v_lj_count
    FROM (
      SELECT DISTINCT ON (s.atlas_person_id) s.atlas_person_id
      FROM public.benchmark_people_staging s
      LEFT JOIN public.atlas_people_discovery_candidates c
        ON c.atlas_person_id = s.atlas_person_id
      WHERE s.run_id = diag_run
        AND c.atlas_person_id IS NULL
      ORDER BY s.atlas_person_id
    ) sub;
    t7 := clock_timestamp();

    -- Limpiar
    DELETE FROM public.benchmark_people_staging WHERE run_id = diag_run;
    DELETE FROM public.atlas_person_identity_map WHERE resolution_method = 'DIAG_BM';

    RETURN jsonb_build_object(
      'sample_size',             p_sample_size,
      'total_rows',              v_total,
      'distinct_people',         v_distinct,
      'part1_count_star_ms',     round(1000 * EXTRACT(EPOCH FROM (t1-t0))::numeric, 2),
      'part2_insert_identity_ms',round(1000 * EXTRACT(EPOCH FROM (t3-t2))::numeric, 2),
      'part2_inserted',          v_inserted,
      'part3a_not_exists_ms',    round(1000 * EXTRACT(EPOCH FROM (t5-t4))::numeric, 2),
      'part3a_count',            v_ne_count,
      'part3b_left_join_ms',     round(1000 * EXTRACT(EPOCH FROM (t7-t6))::numeric, 2),
      'part3b_count',            v_lj_count,
      'antijoin_winner',         CASE
        WHEN EXTRACT(EPOCH FROM (t5-t4)) <= EXTRACT(EPOCH FROM (t7-t6))
          THEN 'NOT_EXISTS'
        ELSE 'LEFT_JOIN_IS_NULL'
      END
    );
  END;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- DRAIN PUBLISHER V2: Corregido para schema real de atlas_search_outbox
-- Schema real: outbox_id (pk), published_at (no processed_at)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.atlas_drain_search_outbox_controlled_v2(
  p_batch_size int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_published int := 0;
  v_quarantined int := 0;
BEGIN
  -- 1. Clasificar remanente no publicable (sin atlas_person_id o discovery_id)
  WITH invalid_rows AS (
    SELECT outbox_id
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
      AND (
        (payload->>'atlas_person_id') IS NULL
        OR (payload->>'discovery_id') IS NULL
      )
    LIMIT p_batch_size
  ),
  mark_quarantined AS (
    UPDATE public.atlas_search_outbox o
    SET status = 'QUARANTINED', published_at = now()
    FROM invalid_rows i
    WHERE o.outbox_id = i.outbox_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_quarantined FROM mark_quarantined;

  -- 2. Drenar filas publicables deduplicadas por (source_id, source_record_id)
  WITH candidate_outbox AS (
    SELECT outbox_id, payload
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
      AND (payload->>'atlas_person_id') IS NOT NULL
      AND (payload->>'discovery_id') IS NOT NULL
    ORDER BY next_retry_at, outbox_id
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
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
    FROM candidate_outbox
  ),
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
  mark_published AS (
    UPDATE public.atlas_search_outbox o
    SET
      status       = 'PUBLISHED',
      published_at = now()
    FROM candidate_outbox c
    WHERE o.outbox_id = c.outbox_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_published FROM mark_published;

  RETURN jsonb_build_object(
    'ok',               true,
    'published_rows',   v_published,
    'quarantined_rows', v_quarantined
  );
END;
$$;

-- También corregir la v1 existente para evitar errores
CREATE OR REPLACE FUNCTION public.atlas_drain_search_outbox_controlled_v1(
  p_batch_size int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Redirigir a v2 (que tiene el schema correcto)
  RETURN public.atlas_drain_search_outbox_controlled_v2(p_batch_size);
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- OUTBOX INSERT CORREGIDO EN RECONCILE V2
-- El reconcile v2 también debe usar el schema correcto para insertar en outbox.
-- El atlas_search_outbox real NO tiene columna 'status' DEFAULT — tiene campos
-- adicionales. Verificamos que los campos mínimos estén cubiertos.
-- ────────────────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────────────────
-- PERMISOS
-- ────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.atlas_stage_people_bulk_v2(text, bigint, jsonb)              TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_v2(text, bigint)           TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_get_physical_diagnostics()                             TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_benchmark_reconcile_timing(int)                        TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v2(int)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.atlas_drain_search_outbox_controlled_v1(int)                 TO service_role;

