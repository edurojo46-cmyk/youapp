-- 20260911231000_atlas_person_observations_v1.sql

CREATE TABLE IF NOT EXISTS public.atlas_person_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- Nullable where source is global
    
    source_id TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    source_url TEXT,
    
    subject_external_key TEXT,
    
    observation_type TEXT NOT NULL,
    attribute_key TEXT,
    
    normalized_value TEXT,
    value_jsonb JSONB,
    
    observed_at TIMESTAMPTZ NOT NULL,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    valid_from TIMESTAMPTZ,
    valid_to TIMESTAMPTZ,
    
    confidence NUMERIC,
    verification_status TEXT,
    
    source_content_hash TEXT NOT NULL,
    ingestion_run_id TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency constraint: deterministic unique version
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_observations_idempotency 
ON public.atlas_person_observations(source_id, source_record_id, source_content_hash);

-- Fast lookup for current snapshots
CREATE INDEX IF NOT EXISTS idx_atlas_observations_current_snapshot
ON public.atlas_person_observations(source_id, source_record_id, last_seen_at DESC);

-- Other helpful indices
CREATE INDEX IF NOT EXISTS idx_atlas_observations_subject ON public.atlas_person_observations(subject_external_key);
CREATE INDEX IF NOT EXISTS idx_atlas_observations_type ON public.atlas_person_observations(observation_type);

-- RLS
ALTER TABLE public.atlas_person_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny anon insert observations" ON public.atlas_person_observations;
CREATE POLICY "Deny anon insert observations" ON public.atlas_person_observations FOR INSERT TO anon WITH CHECK (false);

DROP POLICY IF EXISTS "Deny anon update observations" ON public.atlas_person_observations;
CREATE POLICY "Deny anon update observations" ON public.atlas_person_observations FOR UPDATE TO anon WITH CHECK (false);

DROP POLICY IF EXISTS "Deny public read raw observations" ON public.atlas_person_observations;
CREATE POLICY "Deny public read raw observations" ON public.atlas_person_observations FOR SELECT TO anon USING (false);
