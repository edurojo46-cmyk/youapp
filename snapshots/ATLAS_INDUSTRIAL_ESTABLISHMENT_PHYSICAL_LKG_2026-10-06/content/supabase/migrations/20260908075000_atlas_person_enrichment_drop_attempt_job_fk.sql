-- ============================================================================
-- MIGRATION: 20260908075000_atlas_person_enrichment_drop_attempt_job_fk.sql
-- Subsystem: Person Enrichment V1
-- Fix: Drop FK constraint on attempt.harvester_job_id to avoid breaking queue cleanup
-- ============================================================================

ALTER TABLE public.atlas_person_enrichment_attempts
DROP CONSTRAINT IF EXISTS atlas_person_enrichment_attempts_harvester_job_id_fkey;
