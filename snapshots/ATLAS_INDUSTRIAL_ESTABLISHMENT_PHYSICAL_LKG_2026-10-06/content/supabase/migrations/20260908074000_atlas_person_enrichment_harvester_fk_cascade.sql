-- ============================================================================
-- MIGRATION: 20260908074000_atlas_person_enrichment_harvester_fk_cascade.sql
-- Subsystem: Person Enrichment V1
-- Fix: Allow atlas_queues deletion to SET NULL on enrichment missions and attempts
-- ============================================================================

ALTER TABLE public.atlas_person_enrichment_missions
DROP CONSTRAINT IF EXISTS atlas_person_enrichment_missions_harvester_job_id_fkey,
ADD CONSTRAINT atlas_person_enrichment_missions_harvester_job_id_fkey
FOREIGN KEY (harvester_job_id) REFERENCES public.atlas_queues(job_id) ON DELETE SET NULL;

ALTER TABLE public.atlas_person_enrichment_attempts
DROP CONSTRAINT IF EXISTS atlas_person_enrichment_attempts_harvester_job_id_fkey,
ADD CONSTRAINT atlas_person_enrichment_attempts_harvester_job_id_fkey
FOREIGN KEY (harvester_job_id) REFERENCES public.atlas_queues(job_id) ON DELETE SET NULL;
