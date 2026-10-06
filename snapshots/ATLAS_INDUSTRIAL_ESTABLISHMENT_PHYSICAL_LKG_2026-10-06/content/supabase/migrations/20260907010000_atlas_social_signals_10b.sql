-- MIGRATION: ATLAS SOCIAL SIGNAL ENGINE (10B)
-- 20260907010000_atlas_social_signals_10b.sql
-- Description: Phase 10B taxonomy, signals, evidence and resolver.

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.atlas_social_signal_type AS ENUM (
        'HIRING',
        'EXPANSION',
        'NEW_LOCATION',
        'NEW_PRODUCT',
        'NEW_SERVICE',
        'NEW_PROJECT',
        'REQUEST_FOR_VENDOR',
        'REQUEST_FOR_QUOTE',
        'PARTNERSHIP_SEARCH',
        'DISTRIBUTOR_SEARCH',
        'NEW_MARKET',
        'EVENT_ANNOUNCEMENT',
        'CAPACITY_PROBLEM',
        'SUPPLY_NEED',
        'TECH_MIGRATION',
        'CUSTOMER_PAIN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_social_signal_status AS ENUM (
        'OBSERVED',
        'CONFIRMED',
        'CONFLICT',
        'EXPIRED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_social_extractor_type AS ENUM (
        'DETERMINISTIC',
        'AI_PROPOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_social_evidence_relation AS ENUM (
        'SUPPORTS',
        'CONTRADICTS',
        'CONTEXT_ONLY'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. ATLAS SOCIAL SIGNALS
CREATE TABLE IF NOT EXISTS public.atlas_social_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    canonical_entity_type TEXT NOT NULL,
    canonical_entity_id UUID NOT NULL,
    
    signal_type public.atlas_social_signal_type NOT NULL,
    status public.atlas_social_signal_status NOT NULL DEFAULT 'OBSERVED',
    
    confidence NUMERIC(4,3),
    strength NUMERIC(4,3),
    
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    
    -- Deterministic Fingerprint to prevent duplicates
    -- Should be Hash(canonical_entity_id + signal_type + source/evidence + policy)
    signal_fingerprint TEXT NOT NULL,
    
    extractor_type public.atlas_social_extractor_type NOT NULL,
    extractor_version TEXT NOT NULL,
    signal_policy_version TEXT NOT NULL,
    evidence_snapshot_hash TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_social_signals_fingerprint UNIQUE (signal_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_atlas_social_signals_entity ON public.atlas_social_signals(canonical_entity_type, canonical_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_atlas_social_signals_validity ON public.atlas_social_signals(valid_until);


-- 3. ATLAS SOCIAL SIGNAL EVIDENCE
CREATE TABLE IF NOT EXISTS public.atlas_social_signal_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES public.atlas_social_signals(id) ON DELETE CASCADE,
    content_id UUID NOT NULL REFERENCES public.atlas_social_content(id) ON DELETE CASCADE,
    
    evidence_relation public.atlas_social_evidence_relation NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_social_evidence_relation UNIQUE (signal_id, content_id, evidence_relation)
);


-- 4. DETERMINISTIC EVIDENCE RESOLVER RPC
-- This RPC determines the signal status purely based on its evidence relations and expiration.
CREATE OR REPLACE FUNCTION public.resolve_social_signal_status(p_signal_id UUID)
RETURNS public.atlas_social_signal_status
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_signal RECORD;
    v_support_count INT := 0;
    v_contradict_count INT := 0;
    v_new_status public.atlas_social_signal_status;
BEGIN
    SELECT * INTO v_signal
    FROM public.atlas_social_signals
    WHERE id = p_signal_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Signal not found';
    END IF;

    -- 1. Expiration Rule
    IF NOW() > v_signal.valid_until THEN
        v_new_status := 'EXPIRED';
    ELSE
        -- 2. Evaluate Evidence
        SELECT 
            COUNT(*) FILTER (WHERE evidence_relation = 'SUPPORTS'),
            COUNT(*) FILTER (WHERE evidence_relation = 'CONTRADICTS')
        INTO v_support_count, v_contradict_count
        FROM public.atlas_social_signal_evidence
        WHERE signal_id = p_signal_id;
        
        -- Conflict Rule
        IF v_support_count > 0 AND v_contradict_count > 0 THEN
            v_new_status := 'CONFLICT';
        -- Confirmed Rule (Requires supports > 0)
        ELSIF v_support_count > 0 THEN
            v_new_status := 'CONFIRMED';
        -- Observed Rule (No supports, e.g. AI Proposed but no concrete evidence)
        ELSE
            v_new_status := 'OBSERVED';
        END IF;
    END IF;
    
    -- Update if changed
    IF v_new_status != v_signal.status THEN
        UPDATE public.atlas_social_signals
        SET status = v_new_status,
            updated_at = NOW()
        WHERE id = p_signal_id;
    END IF;
    
    RETURN v_new_status;
END;
$$;

-- Basic RLS
ALTER TABLE public.atlas_social_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_social_signal_evidence ENABLE ROW LEVEL SECURITY;
