-- ============================================================================
-- ATLAS MIGRATION: 20260908041000_atlas_person_search_least_privilege.sql
-- DOMAIN: ADMIN PERSON ADVANCED SEARCH V1
-- LEAST PRIVILEGE HARDENING:
--   - Revoke execute privilege from service_role on browser-facing RPC.
--   - search_canonical_persons_v1 is strictly granted to authenticated callers.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.search_canonical_persons_v1 FROM service_role;
