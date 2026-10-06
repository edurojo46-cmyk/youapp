-- ==========================================
-- PHASE 10H-A1 ADD MISSING SEMANTIC COLUMNS
-- ==========================================
-- The integrity closure migration updated ingest_outcome_event to accept
-- semantic fields for Canonical Fingerprinting, but the table was never
-- altered to store these fields. This migration adds them.

ALTER TABLE public.atlas_outcome_events
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
    ADD COLUMN IF NOT EXISTS object_canonical_ref TEXT,
    ADD COLUMN IF NOT EXISTS canonical_fields JSONB;

-- Note: We don't drop the old view or anything since we just add columns.
