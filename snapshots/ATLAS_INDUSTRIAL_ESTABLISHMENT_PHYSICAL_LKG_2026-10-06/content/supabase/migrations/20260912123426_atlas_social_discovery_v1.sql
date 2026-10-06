-- 20260912123426_atlas_social_discovery_v1.sql

-- 1. Alter atlas_subject_social_profiles to add missing fields for Phase 2
ALTER TABLE public.atlas_subject_social_profiles 
    ADD COLUMN IF NOT EXISTS discovered_by TEXT,
    ADD COLUMN IF NOT EXISTS discovery_source_url TEXT,
    ADD COLUMN IF NOT EXISTS external_id TEXT;

-- (Note: handle, identity_status, profile_status, confidence, evidence_observation_id, last_verified_at already exist based on previous migrations)

-- 2. Create the social discovery queue table with lease semantics
CREATE TABLE IF NOT EXISTS public.atlas_social_discovery_queue (
    queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID NOT NULL REFERENCES public.atlas_observation_subjects(subject_id) ON DELETE CASCADE,
    
    discovery_version INTEGER NOT NULL DEFAULT 1,
    
    priority INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'NO_EVIDENCE', 'RETRY', 'FAILED')),
    
    attempt_count INTEGER NOT NULL DEFAULT 0,
    leased_at TIMESTAMPTZ,
    lease_expires_at TIMESTAMPTZ,
    worker_id TEXT,
    
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    last_error_code TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Enforce one active discovery task per subject per version
    UNIQUE(subject_id, discovery_version)
);

-- Indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_atlas_social_discovery_queue_status ON public.atlas_social_discovery_queue(status, priority, next_attempt_at) WHERE status IN ('PENDING', 'RETRY');
CREATE INDEX IF NOT EXISTS idx_atlas_social_discovery_queue_subject ON public.atlas_social_discovery_queue(subject_id);

-- RLS
ALTER TABLE public.atlas_social_discovery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role on queue" ON public.atlas_social_discovery_queue FOR ALL USING (true);
