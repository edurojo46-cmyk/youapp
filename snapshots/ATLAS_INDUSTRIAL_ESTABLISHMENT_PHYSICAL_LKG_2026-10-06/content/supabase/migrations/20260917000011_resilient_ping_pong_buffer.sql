-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000011_resilient_ping_pong_buffer.sql
--
-- ARQUITECTURA PING-PONG DOUBLE BUFFER DE MÁXIMA RESILIENCIA:
--
-- 1. Truncate preventivo en Stage:
--    Antes de insertar el bloque N en el buffer A (o B), se ejecuta TRUNCATE
--    inmediato (0.1ms) en ese buffer. Esto garantiza:
--    - CERO acumulación de filas si un bloque anterior tuvo error.
--    - CERO efecto cascada (cada bloque arranca con 0 filas y 0 páginas sucias).
--
-- 2. Single-Pass Memory Join en Reconcile:
--    Se lee el buffer de staging una sola vez en el CTE incoming.
--    new_for_search hace JOIN en memoria con incoming (evita escanear la tabla 3 veces).
--
-- 3. statement_timeout = 30s:
--    Protege el RPC contra pausas transitorias de I/O o checkpoints de Postgres.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE UNLOGGED TABLE IF NOT EXISTS public.benchmark_people_staging_0 (
  staging_id             bigserial    PRIMARY KEY,
  run_id                 text         NOT NULL,
  block_id               bigint       NOT NULL DEFAULT 0,
  source_id              text         NOT NULL,
  source_person_id       text         NOT NULL,
  identifier_type        text         NOT NULL,
  identity_hmac          text         NOT NULL,
  atlas_person_id        text         NOT NULL,
  display_name           text         NOT NULL,
  role                   text         NOT NULL,
  organization           text         NOT NULL,
  search_text_normalized text         NOT NULL
);

CREATE UNLOGGED TABLE IF NOT EXISTS public.benchmark_people_staging_1 (
  staging_id             bigserial    PRIMARY KEY,
  run_id                 text         NOT NULL,
  block_id               bigint       NOT NULL DEFAULT 0,
  source_id              text         NOT NULL,
  source_person_id       text         NOT NULL,
  identifier_type        text         NOT NULL,
  identity_hmac          text         NOT NULL,
  atlas_person_id        text         NOT NULL,
  display_name           text         NOT NULL,
  role                   text         NOT NULL,
  organization           text         NOT NULL,
  search_text_normalized text         NOT NULL
);

GRANT ALL ON public.benchmark_people_staging_0 TO service_role, authenticated, anon;
GRANT ALL ON public.benchmark_people_staging_1 TO service_role, authenticated, anon;

-- STAGE V2 CON LIMPIEZA PREVENTIVA ZERO-CASCADE
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
    -- Buffer 0: Truncate preventivo garantizando 0 filas y 0 dead tuples
    TRUNCATE TABLE public.benchmark_people_staging_0;

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
    -- Buffer 1: Truncate preventivo garantizando 0 filas y 0 dead tuples
    TRUNCATE TABLE public.benchmark_people_staging_1;

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

-- RECONCILE V2 CON SINGLE-PASS CTE, TIMEOUT DE 30S Y AUTO-CLEANUP
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
    SELECT COUNT(*) INTO v_staged_total
    FROM public.benchmark_people_staging_0;

    IF v_staged_total > 0 THEN
      WITH incoming AS (
        SELECT DISTINCT ON (source_id, source_person_id)
          atlas_person_id, source_id, source_person_id, identifier_type,
          identity_hmac AS identifier_value, 'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
          1.0::float8 AS confidence, 'HMAC_DNI_DETERMINISTIC'::text AS resolution_method, now() AS observed_at,
          display_name, role, organization, search_text_normalized
        FROM public.benchmark_people_staging_0
        ORDER BY source_id, source_person_id
      ),
      inserted_rows AS (
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type,
          identifier_value, evidence_id, confidence, resolution_method, observed_at
        )
        SELECT
          atlas_person_id, source_id, source_person_id, identifier_type,
          identifier_value, evidence_id, confidence, resolution_method, observed_at
        FROM incoming
        ON CONFLICT (source_id, source_person_id) DO NOTHING
        RETURNING source_id, source_person_id
      ),
      new_for_search AS (
        SELECT DISTINCT ON (inc.atlas_person_id)
          inc.atlas_person_id, inc.source_id, inc.source_person_id, inc.display_name, inc.role, inc.organization, inc.search_text_normalized
        FROM incoming inc
        JOIN inserted_rows i ON i.source_id = inc.source_id AND i.source_person_id = inc.source_person_id
        ORDER BY inc.atlas_person_id
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
    SELECT COUNT(*) INTO v_staged_total
    FROM public.benchmark_people_staging_1;

    IF v_staged_total > 0 THEN
      WITH incoming AS (
        SELECT DISTINCT ON (source_id, source_person_id)
          atlas_person_id, source_id, source_person_id, identifier_type,
          identity_hmac AS identifier_value, 'evi_' || substr(source_person_id, 1, 16) AS evidence_id,
          1.0::float8 AS confidence, 'HMAC_DNI_DETERMINISTIC'::text AS resolution_method, now() AS observed_at,
          display_name, role, organization, search_text_normalized
        FROM public.benchmark_people_staging_1
        ORDER BY source_id, source_person_id
      ),
      inserted_rows AS (
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type,
          identifier_value, evidence_id, confidence, resolution_method, observed_at
        )
        SELECT
          atlas_person_id, source_id, source_person_id, identifier_type,
          identifier_value, evidence_id, confidence, resolution_method, observed_at
        FROM incoming
        ON CONFLICT (source_id, source_person_id) DO NOTHING
        RETURNING source_id, source_person_id
      ),
      new_for_search AS (
        SELECT DISTINCT ON (inc.atlas_person_id)
          inc.atlas_person_id, inc.source_id, inc.source_person_id, inc.display_name, inc.role, inc.organization, inc.search_text_normalized
        FROM incoming inc
        JOIN inserted_rows i ON i.source_id = inc.source_id AND i.source_person_id = inc.source_person_id
        ORDER BY inc.atlas_person_id
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
  v_unique_people := v_staged_total; -- Diagnóstico referencial

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
