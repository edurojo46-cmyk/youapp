-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000012_restore_pure_dml_stage.sql
--
-- RESTAURACIÓN DE INGESTA DML PURA (MÁXIMA VELOCIDAD Y ESTABILIDAD):
--
-- 1. atlas_stage_people_bulk_v2:
--    DML PURO (INSERT INTO). CERO DDL / TRUNCATE en el path de inserción.
--    Evita contención de AccessExclusiveLock y errores 522 de Cloudflare.
--
-- 2. atlas_reconcile_and_commit_staging_v2:
--    Lógica probada de migración 10 (alcanzó 2.099 personas/s sostenidas y
--    750ms por bloque en steady-state).
--    TRUNCATE instantáneo en 0.1ms al finalizar la reconciliación.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.atlas_stage_people_bulk_v2(
  p_run_id   text,
  p_block_id bigint,
  p_rows     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
SET statement_timeout = '30s'
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF p_block_id % 2 = 0 THEN
    INSERT INTO public.benchmark_people_staging_0 (
      run_id, block_id, source_id, source_person_id, identifier_type,
      identity_hmac, atlas_person_id, display_name, role,
      organization, search_text_normalized
    )
    SELECT
      p_run_id, p_block_id, x.source_id, x.source_person_id, x.identifier_type,
      x.identity_hmac, x.atlas_person_id, x.display_name, x.role,
      x.organization, x.search_text_normalized
    FROM jsonb_to_recordset(p_rows) AS x(
      source_id text, source_person_id text, identifier_type text, identity_hmac text,
      atlas_person_id text, display_name text, role text, organization text, search_text_normalized text
    );
  ELSE
    INSERT INTO public.benchmark_people_staging_1 (
      run_id, block_id, source_id, source_person_id, identifier_type,
      identity_hmac, atlas_person_id, display_name, role,
      organization, search_text_normalized
    )
    SELECT
      p_run_id, p_block_id, x.source_id, x.source_person_id, x.identifier_type,
      x.identity_hmac, x.atlas_person_id, x.display_name, x.role,
      x.organization, x.search_text_normalized
    FROM jsonb_to_recordset(p_rows) AS x(
      source_id text, source_person_id text, identifier_type text, identity_hmac text,
      atlas_person_id text, display_name text, role text, organization text, search_text_normalized text
    );
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', p_run_id,
    'block_id', p_block_id,
    'staged_rows', v_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.atlas_reconcile_and_commit_staging_v2(
  p_run_id   text,
  p_block_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
SET statement_timeout = '30s'
AS $$
DECLARE
  v_staged_total       int := 0;
  v_unique_people      int := 0;
  v_inserted           int := 0;
  v_existing_unchanged int := 0;
  v_outbox_produced    int := 0;
  v_target_buffer      int := COALESCE(p_block_id % 2, 0);
BEGIN
  IF v_target_buffer = 0 THEN
    -- BUFFER 0
    SELECT COUNT(*), COUNT(DISTINCT atlas_person_id)
    INTO v_staged_total, v_unique_people
    FROM public.benchmark_people_staging_0;

    IF v_staged_total > 0 THEN
      WITH incoming AS (
        SELECT DISTINCT ON (source_id, source_person_id)
          atlas_person_id, source_id, source_person_id, identifier_type,
          identity_hmac AS identifier_value, 'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
          1.0::float8 AS confidence, 'HMAC_DNI_DETERMINISTIC'::text AS resolution_method, now() AS observed_at
        FROM public.benchmark_people_staging_0
        ORDER BY source_id, source_person_id
      ),
      inserted_rows AS (
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type,
          identifier_value, evidence_id, confidence, resolution_method, observed_at
        )
        SELECT * FROM incoming
        ON CONFLICT (source_id, source_person_id) DO NOTHING
        RETURNING source_id, source_person_id, atlas_person_id
      ),
      new_for_search AS (
        SELECT DISTINCT ON (s.atlas_person_id)
          s.atlas_person_id, s.source_id, s.source_person_id, s.display_name, s.role, s.organization, s.search_text_normalized
        FROM public.benchmark_people_staging_0 s
        JOIN inserted_rows i ON i.source_id = s.source_id AND i.source_person_id = s.source_person_id
        ORDER BY s.atlas_person_id
      ),
      outbox_ins AS (
        INSERT INTO public.atlas_search_outbox (
          atlas_person_id, source_id, source_record_id, status, payload, created_at
        )
        SELECT
          u.atlas_person_id, u.source_id, u.source_person_id, 'PENDING',
          jsonb_build_object(
            'discovery_id', 'disc_' || lower(substr(u.source_id, 1, 4)) || '_' || substr(u.source_person_id, 1, 24),
            'atlas_person_id', u.atlas_person_id, 'display_name', u.display_name, 'profession', 'Directivo / Autoridad',
            'role', u.role, 'organization', u.organization, 'geography_id', 'arg_nacional',
            'location_relation_type', 'CORPORATE_AUTHORITY', 'location_evidence', 'Registro Oficial',
            'search_text_normalized', u.search_text_normalized, 'current_activity_state', 'ACTIVE',
            'evidence_strength', 'HIGH', 'source_id', u.source_id, 'source_record_id', u.source_person_id,
            'social_profiles', '[]'::jsonb, 'first_seen_at', now(), 'last_seen_at', now(), 'source_last_checked_at', now()
          ),
          now()
        FROM new_for_search u
        ON CONFLICT (source_id, source_record_id) DO NOTHING
        RETURNING 1
      )
      SELECT (SELECT COUNT(*) FROM inserted_rows), (SELECT COUNT(*) FROM outbox_ins)
      INTO v_inserted, v_outbox_produced;

      TRUNCATE TABLE public.benchmark_people_staging_0;
    END IF;

  ELSE
    -- BUFFER 1
    SELECT COUNT(*), COUNT(DISTINCT atlas_person_id)
    INTO v_staged_total, v_unique_people
    FROM public.benchmark_people_staging_1;

    IF v_staged_total > 0 THEN
      WITH incoming AS (
        SELECT DISTINCT ON (source_id, source_person_id)
          atlas_person_id, source_id, source_person_id, identifier_type,
          identity_hmac AS identifier_value, 'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
          1.0::float8 AS confidence, 'HMAC_DNI_DETERMINISTIC'::text AS resolution_method, now() AS observed_at
        FROM public.benchmark_people_staging_1
        ORDER BY source_id, source_person_id
      ),
      inserted_rows AS (
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type,
          identifier_value, evidence_id, confidence, resolution_method, observed_at
        )
        SELECT * FROM incoming
        ON CONFLICT (source_id, source_person_id) DO NOTHING
        RETURNING source_id, source_person_id, atlas_person_id
      ),
      new_for_search AS (
        SELECT DISTINCT ON (s.atlas_person_id)
          s.atlas_person_id, s.source_id, s.source_person_id, s.display_name, s.role, s.organization, s.search_text_normalized
        FROM public.benchmark_people_staging_1 s
        JOIN inserted_rows i ON i.source_id = s.source_id AND i.source_person_id = s.source_person_id
        ORDER BY s.atlas_person_id
      ),
      outbox_ins AS (
        INSERT INTO public.atlas_search_outbox (
          atlas_person_id, source_id, source_record_id, status, payload, created_at
        )
        SELECT
          u.atlas_person_id, u.source_id, u.source_person_id, 'PENDING',
          jsonb_build_object(
            'discovery_id', 'disc_' || lower(substr(u.source_id, 1, 4)) || '_' || substr(u.source_person_id, 1, 24),
            'atlas_person_id', u.atlas_person_id, 'display_name', u.display_name, 'profession', 'Directivo / Autoridad',
            'role', u.role, 'organization', u.organization, 'geography_id', 'arg_nacional',
            'location_relation_type', 'CORPORATE_AUTHORITY', 'location_evidence', 'Registro Oficial',
            'search_text_normalized', u.search_text_normalized, 'current_activity_state', 'ACTIVE',
            'evidence_strength', 'HIGH', 'source_id', u.source_id, 'source_record_id', u.source_person_id,
            'social_profiles', '[]'::jsonb, 'first_seen_at', now(), 'last_seen_at', now(), 'source_last_checked_at', now()
          ),
          now()
        FROM new_for_search u
        ON CONFLICT (source_id, source_record_id) DO NOTHING
        RETURNING 1
      )
      SELECT (SELECT COUNT(*) FROM inserted_rows), (SELECT COUNT(*) FROM outbox_ins)
      INTO v_inserted, v_outbox_produced;

      TRUNCATE TABLE public.benchmark_people_staging_1;
    END IF;
  END IF;

  v_existing_unchanged := GREATEST(0, v_staged_total - v_inserted);

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

GRANT EXECUTE ON FUNCTION public.atlas_stage_people_bulk_v2(text, bigint, jsonb) TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_v2(text, bigint) TO service_role, authenticated, anon;
