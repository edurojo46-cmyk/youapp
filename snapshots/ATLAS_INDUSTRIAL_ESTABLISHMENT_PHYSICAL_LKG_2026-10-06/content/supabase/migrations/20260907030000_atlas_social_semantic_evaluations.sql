-- MIGRATION: ATLAS SOCIAL SEMANTIC EVALUATIONS
-- 20260907030000_atlas_social_semantic_evaluations.sql

DO $$ BEGIN
    CREATE TYPE public.atlas_semantic_validation_status AS ENUM (
        'PENDING',
        'PASSED',
        'REJECTED',
        'UNRESOLVED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_subject_resolution_status AS ENUM (
        'RESOLVED',
        'UNRESOLVED',
        'AMBIGUOUS',
        'CONFLICT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.atlas_social_semantic_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES public.atlas_social_signals(id) ON DELETE CASCADE,
    
    model_id TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    extractor_version TEXT NOT NULL,
    
    -- Structured Output Fields
    is_opportunity BOOLEAN,
    proposed_subject_name TEXT,
    proposed_subject_type TEXT,
    subject_is_channel_owner BOOLEAN,
    assertion_mode TEXT,
    source_relation TEXT,
    negated BOOLEAN,
    event_time TEXT,
    event_time_source TEXT,
    supporting_span TEXT,
    confidence NUMERIC(4,3),
    
    -- Deterministic Gates
    subject_resolution_status public.atlas_subject_resolution_status,
    resolved_entity_id UUID,
    resolution_confidence NUMERIC(4,3),
    resolution_method TEXT,
    
    semantic_validation_status public.atlas_semantic_validation_status NOT NULL DEFAULT 'PENDING',
    semantic_rejection_reason TEXT,
    
    -- Overall Decision for Evaluation vs Gold
    prediction TEXT,
    
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_social_semantic_evaluations_signal ON public.atlas_social_semantic_evaluations(signal_id);
