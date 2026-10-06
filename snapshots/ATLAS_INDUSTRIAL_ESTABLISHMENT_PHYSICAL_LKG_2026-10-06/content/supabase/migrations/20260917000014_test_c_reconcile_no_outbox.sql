-- ═══════════════════════════════════════════════════════════════════════════
-- 20260917000014_test_c_reconcile_no_outbox.sql
-- 
-- DIAGNOSTIC TEST C: Reconcile against 1.87M identity rows WITHOUT Outbox Insert
-- 
-- Security:
-- - STRICT service_role only. Public, anon, and authenticated are REVOKED.
-- 
-- Invariants:
-- - Designed strictly for benchmark/diagnostic on existing identities (inserted_new = 0).
-- - Zero bloat: pure TRUNCATE on inactive buffer.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.atlas_reconcile_and_commit_staging_no_outbox_test(
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
      )
      SELECT COUNT(*) INTO v_inserted FROM inserted_rows;

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
      )
      SELECT COUNT(*) INTO v_inserted FROM inserted_rows;

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
    'outbox_delta_produced', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.atlas_reconcile_and_commit_staging_no_outbox_test(text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atlas_reconcile_and_commit_staging_no_outbox_test(text, bigint) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_reconcile_and_commit_staging_no_outbox_test(text, bigint) TO service_role;
