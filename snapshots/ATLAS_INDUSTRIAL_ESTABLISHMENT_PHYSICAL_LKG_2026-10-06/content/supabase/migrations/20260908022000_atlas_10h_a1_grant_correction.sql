-- ==========================================
-- PHASE 10H-A1 GRANT CORRECTION
-- ==========================================
-- Forward migration: restore correct EXECUTE grants on ingest_outcome_event.
-- The previous migration (021000) revoked PUBLIC/anon/authenticated correctly
-- but the full signature used in GRANT was incorrect, leaving service_role
-- without PostgREST-accessible EXECUTE.
-- Solution: use the simpler form after confirming only 1 overload exists.

-- First confirm only 1 overload exists now by using proc OID directly
-- Then grant to service_role and postgres for PostgREST access

DO $$
DECLARE
    fn_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO fn_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'ingest_outcome_event';

    IF fn_count != 1 THEN
        RAISE EXCEPTION 'Expected exactly 1 ingest_outcome_event overload, found %', fn_count;
    END IF;
END;
$$;

-- Now safe to use simple form (only 1 overload)
REVOKE ALL ON FUNCTION public.ingest_outcome_event FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_outcome_event TO service_role;
GRANT EXECUTE ON FUNCTION public.ingest_outcome_event TO postgres;

-- Also fix trigger function
REVOKE ALL ON FUNCTION public.trg_prevent_outcome_mutation() FROM PUBLIC, anon, authenticated;
