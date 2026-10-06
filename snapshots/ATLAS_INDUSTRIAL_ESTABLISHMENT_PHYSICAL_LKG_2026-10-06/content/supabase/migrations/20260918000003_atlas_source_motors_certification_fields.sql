-- Migration: 20260918000003_atlas_source_motors_certification_fields.sql
-- Description: Adds certification_status and certification_block_reason to atlas_discovery_source_motors

ALTER TABLE public.atlas_discovery_source_motors
ADD COLUMN IF NOT EXISTS certification_status TEXT NOT NULL DEFAULT 'NOT_TESTED' CHECK (
    certification_status IN ('NOT_TESTED', 'IN_PROGRESS', 'PASSED', 'REJECTED', 'PENDING')
);

ALTER TABLE public.atlas_discovery_source_motors
ADD COLUMN IF NOT EXISTS certification_block_reason TEXT NOT NULL DEFAULT 'NONE' CHECK (
    certification_block_reason IN ('NONE', 'POLICY', 'PROTOCOL', 'EVIDENCE', 'QUALITY', 'IDENTITY', 'CONNECTIVITY', 'OTHER')
);

CREATE INDEX IF NOT EXISTS idx_atlas_discovery_source_motors_cert_status 
ON public.atlas_discovery_source_motors(certification_status);
