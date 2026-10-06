-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000015_hyperthroughput_v3_minimal_outbox.sql
-- 
-- HYPERTHROUGHPUT V3: MINIMAL LEAN OUTBOX & ZERO RE-PUBLICATION
-- 
-- 1. Invariant: EXISTING_UNCHANGED rows NEVER emit outbox events.
-- 2. Invariant: ONLY newly inserted canonical identities emit minimal outbox events.
-- 3. Lean Payload: Minimal JSON footprint (drastically cuts WAL, I/O and table bloat).
-- 4. Pure TRUNCATE on inactive buffer for zero bloat.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.atlas_reconcile_and_commit_staging_v3(
  p_run_id   text,
  p_block_id bigint
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
            'atlas_person_id', u.atlas_person_id,
            'display_name', u.display_name,
            'role', u.role,
            'organization', u.organization,
            'search_text_normalized', u.search_text_normalized,
            'profession', 'Directivo / Autoridad',
            'source_id', u.source_id,
            'source_record_id', u.source_person_id
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
            'atlas_person_id', u.atlas_person_id,
            'display_name', u.display_name,
            'role', u.role,
            'organization', u.organization,
            'search_text_normalized', u.search_text_normalized,
            'profession', 'Directivo / Autoridad',
            'source_id', u.source_id,
            'source_record_id', u.source_person_id
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

REVOKE ALL ON FUNCTION public.atlas_reconcile_and_commit_staging_v3(text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atlas_reconcile_and_commit_staging_v3(text, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_v3(text, bigint) TO service_role;

NOTIFY pgrst, 'reload schema';
