-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO FÍSICO: RPCs para inspeccionar pg_indexes, stats y EXPLAIN
-- ═══════════════════════════════════════════════════════════════════════════

-- RPC 1: Listar índices de tablas críticas
CREATE OR REPLACE FUNCTION public.diag_list_indexes_critical()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_tables text[] := ARRAY[
    'atlas_person_identity_map',
    'atlas_people_discovery_candidates',
    'benchmark_people_staging',
    'atlas_search_outbox'
  ];
  v_tbl text;
  v_rows jsonb;
BEGIN
  FOREACH v_tbl IN ARRAY v_tables LOOP
    SELECT jsonb_agg(jsonb_build_object(
      'table', v_tbl,
      'indexname', i.indexname,
      'indexdef', i.indexdef,
      'idx_size', pg_size_pretty(pg_relation_size(i.indexrelid))
    ))
    INTO v_rows
    FROM pg_indexes i
    WHERE i.schemaname = 'public'
      AND i.tablename = v_tbl;

    IF v_rows IS NOT NULL THEN
      v_result := v_result || v_rows;
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

-- RPC 2: Stats de tablas críticas
CREATE OR REPLACE FUNCTION public.diag_table_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', s.relname,
    'total_size', pg_size_pretty(pg_total_relation_size(c.oid)),
    'table_size', pg_size_pretty(pg_relation_size(c.oid)),
    'live_rows', s.n_live_tup,
    'dead_rows', s.n_dead_tup,
    'last_autovacuum', s.last_autovacuum::text,
    'last_autoanalyze', s.last_autoanalyze::text
  ))
  INTO v_result
  FROM pg_class c
  JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE s.relname IN (
    'atlas_person_identity_map',
    'atlas_people_discovery_candidates',
    'benchmark_people_staging',
    'atlas_search_outbox'
  )
  ORDER BY s.relname;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- RPC 3: Timing detallado de reconcile + NOT EXISTS vs LEFT JOIN
CREATE OR REPLACE FUNCTION public.diag_reconcile_timing_v1(
  p_sample_size int DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  diag_run text := 'diag_timing_' || floor(extract(epoch from now()))::text;
  t0 timestamptz;
  t1 timestamptz;
  t2 timestamptz;
  t3 timestamptz;
  t4 timestamptz;
  t5 timestamptz;
  t6 timestamptz;
  t7 timestamptz;
  v_total int;
  v_distinct int;
  v_inserted int;
  v_ne_count int;
  v_lj_count int;
BEGIN
  -- Poblar staging con muestra representativa
  INSERT INTO public.benchmark_people_staging (
    run_id, source_id, source_person_id, identifier_type,
    identity_hmac, atlas_person_id, display_name, role,
    organization, search_text_normalized
  )
  SELECT
    diag_run,
    'IGJ_AUTORIDADES_GENERO_2026',
    'diag_sp_' || lpad(i::text, 8, '0'),
    'NATIONAL_IDENTITY_HMAC',
    'diag_hmac_' || lpad(i::text, 8, '0'),
    'atlas_arg_per_' || lpad(i::text, 16, '0'),
    'Nombre Diagnostico ' || i,
    'AUTORIDAD SOCIETARIA',
    'Sociedad Correlativo ' || i || ' (SRL)',
    'nombre diagnostico ' || i || ' autoridad sociedad correlativo ' || i || ' srl'
  FROM generate_series(1, p_sample_size) AS i;

  -- PARTE 1: COUNT(*) + COUNT(DISTINCT) previo (overhead actual)
  t0 := clock_timestamp();
  SELECT COUNT(*), COUNT(DISTINCT atlas_person_id)
  INTO v_total, v_distinct
  FROM public.benchmark_people_staging
  WHERE run_id = diag_run;
  t1 := clock_timestamp();

  -- PARTE 2: INSERT identity_map ON CONFLICT DO NOTHING (set-based)
  t2 := clock_timestamp();
  WITH incoming AS (
    SELECT DISTINCT ON (source_id, source_person_id)
      atlas_person_id, source_id, source_person_id,
      identifier_type, identity_hmac AS identifier_value,
      'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
      1.0::float8 AS confidence,
      'DIAG_TIMING'::text AS resolution_method,
      now() AS observed_at
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

  -- PARTE 3a: NOT EXISTS anti-join (actual)
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

  -- PARTE 3b: LEFT JOIN IS NULL (candidato)
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
  DELETE FROM public.atlas_person_identity_map WHERE resolution_method = 'DIAG_TIMING';

  RETURN jsonb_build_object(
    'sample_size', p_sample_size,
    'total_rows', v_total,
    'distinct_people', v_distinct,
    'part1_count_star_ms',      round(1000 * EXTRACT(EPOCH FROM (t1-t0))::numeric, 2),
    'part2_insert_identity_ms', round(1000 * EXTRACT(EPOCH FROM (t3-t2))::numeric, 2),
    'part2_inserted_rows',      v_inserted,
    'part3a_not_exists_ms',     round(1000 * EXTRACT(EPOCH FROM (t5-t4))::numeric, 2),
    'part3a_ne_count',          v_ne_count,
    'part3b_left_join_ms',      round(1000 * EXTRACT(EPOCH FROM (t7-t6))::numeric, 2),
    'part3b_lj_count',          v_lj_count,
    'total_ms',                 round(1000 * EXTRACT(EPOCH FROM (t7-t0))::numeric, 2),
    'winner_antijoin',          CASE
      WHEN EXTRACT(EPOCH FROM (t5-t4)) < EXTRACT(EPOCH FROM (t7-t6)) THEN 'NOT_EXISTS'
      WHEN EXTRACT(EPOCH FROM (t7-t6)) < EXTRACT(EPOCH FROM (t5-t4)) THEN 'LEFT_JOIN_IS_NULL'
      ELSE 'TIE'
    END
  );
END;
$$;

-- RPC 4: EXPLAIN TEXT para NOT EXISTS y LEFT JOIN
CREATE OR REPLACE FUNCTION public.diag_explain_antijoin(
  p_run_id text DEFAULT 'diag_explain_sample'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_ne_plan text;
  v_lj_plan text;
  v_cnt_plan text;
BEGIN
  -- Poblar staging de muestra para EXPLAIN
  INSERT INTO public.benchmark_people_staging (
    run_id, source_id, source_person_id, identifier_type,
    identity_hmac, atlas_person_id, display_name, role,
    organization, search_text_normalized
  )
  SELECT
    p_run_id,
    'IGJ_AUTORIDADES_GENERO_2026',
    'exp_sp_' || lpad(i::text, 8, '0'),
    'NATIONAL_IDENTITY_HMAC',
    'exp_hmac_' || lpad(i::text, 8, '0'),
    'atlas_arg_per_' || lpad(i::text, 16, '0'),
    'Nombre Explain ' || i,
    'AUTORIDAD SOCIETARIA',
    'Sociedad Explain ' || i || ' (SRL)',
    'nombre explain ' || i
  FROM generate_series(1, 2000) AS i
  ON CONFLICT DO NOTHING;

  -- EXPLAIN NOT EXISTS
  SELECT string_agg(plan_line, E'\n')
  INTO v_ne_plan
  FROM (
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT DISTINCT ON (s.atlas_person_id)
      s.atlas_person_id, s.source_id, s.source_person_id,
      s.display_name, s.role, s.organization, s.search_text_normalized
    FROM public.benchmark_people_staging s
    WHERE s.run_id = p_run_id
      AND NOT EXISTS (
        SELECT 1 FROM public.atlas_people_discovery_candidates c
        WHERE c.atlas_person_id = s.atlas_person_id
      )
    ORDER BY s.atlas_person_id
  ) AS q(plan_line);

  -- EXPLAIN LEFT JOIN IS NULL
  SELECT string_agg(plan_line, E'\n')
  INTO v_lj_plan
  FROM (
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT DISTINCT ON (s.atlas_person_id)
      s.atlas_person_id, s.source_id, s.source_person_id,
      s.display_name, s.role, s.organization, s.search_text_normalized
    FROM public.benchmark_people_staging s
    LEFT JOIN public.atlas_people_discovery_candidates c
      ON c.atlas_person_id = s.atlas_person_id
    WHERE s.run_id = p_run_id
      AND c.atlas_person_id IS NULL
    ORDER BY s.atlas_person_id
  ) AS q(plan_line);

  -- EXPLAIN COUNT(*) + COUNT(DISTINCT) previo
  SELECT string_agg(plan_line, E'\n')
  INTO v_cnt_plan
  FROM (
    EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT COUNT(*), COUNT(DISTINCT atlas_person_id)
    FROM public.benchmark_people_staging
    WHERE run_id = p_run_id
  ) AS q(plan_line);

  -- Limpiar
  DELETE FROM public.benchmark_people_staging WHERE run_id = p_run_id;

  RETURN jsonb_build_object(
    'not_exists_plan', v_ne_plan,
    'left_join_plan', v_lj_plan,
    'count_star_plan', v_cnt_plan
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.diag_list_indexes_critical() TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_table_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_reconcile_timing_v1(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.diag_explain_antijoin(text) TO service_role;
