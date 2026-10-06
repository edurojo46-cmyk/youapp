-- ========================================================================================
-- ATLAS PHASE 10D: NEXT BEST ACTION ENGINE V1
-- ========================================================================================

-- 1. ENUMS

DO $$ BEGIN
    CREATE TYPE public.atlas_nba_status AS ENUM (
        'DO_NOW',
        'WAIT',
        'OBSERVE',
        'REVIEW_REQUIRED',
        'NO_ACTION'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_nba_action AS ENUM (
        'NO_ACTION',
        'OBSERVE',
        'WAIT',
        'REVIEW_REQUIRED',
        'HUMAN_REVIEW',
        'EMAIL',
        'WHATSAPP_SERVICE_REPLY',
        'WHATSAPP_MARKETING_MESSAGE',
        'INSTAGRAM_DM',
        'INSTAGRAM_PUBLIC_REPLY',
        'X_DM',
        'X_PUBLIC_REPLY',
        'YOUTUBE_COMMENT',
        'YOUTUBE_LIVE_CHAT',
        'LINKEDIN_COMMENT',
        'TELEGRAM_GROUP_POST'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_nba_cost_class AS ENUM (
        'FREE_ORGANIC',
        'VERY_LOW',
        'LOW',
        'MEDIUM',
        'HIGH',
        'UNKNOWN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- 2. ACTION COST REGISTRY (Cost Authority)
CREATE TABLE IF NOT EXISTS public.atlas_action_cost_registry (
    cost_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    channel TEXT NOT NULL,
    action_type public.atlas_nba_action NOT NULL,
    cost_class public.atlas_nba_cost_class NOT NULL DEFAULT 'UNKNOWN',
    
    estimated_unit_cost NUMERIC(10,4),
    currency TEXT,
    
    cost_basis TEXT,
    source TEXT,
    
    cost_version TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_action_cost UNIQUE (tenant_id, channel, action_type, cost_version)
);

-- 3. NEXT BEST ACTION POLICIES
CREATE TABLE IF NOT EXISTS public.atlas_next_best_action_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    policy_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
    
    ranking_weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    cost_penalties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    hard_gates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_atlas_nba_active_policy ON public.atlas_next_best_action_policies (tenant_id) WHERE (status = 'ACTIVE');

-- 4. NEXT BEST ACTION STATE (10D Engine Output)
CREATE TABLE IF NOT EXISTS public.atlas_next_best_action_state (
    nba_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    subject_id UUID NOT NULL REFERENCES public.atlas_subject_registry(subject_id) ON DELETE CASCADE,
    subject_type public.atlas_subject_type NOT NULL,
    
    product_id UUID, -- nullable
    offer_id UUID, -- nullable
    opportunity_id UUID, -- nullable, for COMPANIES
    
    recommended_action public.atlas_nba_action NOT NULL,
    recommended_channel TEXT, -- nullable for NO_ACTION / WAIT
    
    decision_status public.atlas_nba_status NOT NULL,
    
    priority_score INT,
    expected_value NUMERIC(10,4), -- nullable
    estimated_action_cost public.atlas_nba_cost_class, -- nullable if NO_ACTION
    expected_net_value NUMERIC(10,4), -- nullable
    
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    alternative_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Authoritative Snapshots for Strict CAS
    channel_eligibility_snapshot_id UUID,
    upstream_decision_ref UUID,
    product_fit_ref UUID,
    evidence_snapshot_hash TEXT NOT NULL,
    
    input_snapshot_hash TEXT NOT NULL, -- overarching hash
    policy_version TEXT NOT NULL,
    cost_version TEXT,
    
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    CONSTRAINT uq_atlas_nba_state UNIQUE (tenant_id, subject_id, product_id, offer_id, opportunity_id)
);


-- 5. STRICT CAS TRIGGER FOR NBA CONCURRENCY
CREATE OR REPLACE FUNCTION public.trg_strict_nba_state_concurrency()
RETURNS TRIGGER AS $$
DECLARE
    v_policy_created TIMESTAMPTZ;
    v_fit_updated TIMESTAMPTZ;
    v_eligibility_updated TIMESTAMPTZ;
    v_decision_updated TIMESTAMPTZ;
BEGIN
    -- 1. STALE WRITE PROTECTION
    IF TG_OP = 'UPDATE' THEN
        IF NEW.evaluated_at <= OLD.evaluated_at THEN
            RAISE EXCEPTION 'Concurrency conflict: NBA State is stale (new calc % <= old calc %)', NEW.evaluated_at, OLD.evaluated_at;
        END IF;
    END IF;

    -- 2. INPUT FRESHNESS VETO
    
    -- Check Active Policy
    SELECT created_at INTO v_policy_created 
    FROM public.atlas_next_best_action_policies 
    WHERE tenant_id = NEW.tenant_id AND status = 'ACTIVE'
    ORDER BY created_at DESC LIMIT 1;
    IF v_policy_created IS NOT NULL AND v_policy_created > NEW.evaluated_at THEN
        RAISE EXCEPTION 'Concurrency conflict: A newer NBA policy is active';
    END IF;

    -- Check Product Fit (if applicable)
    IF NEW.subject_type = 'PERSON' AND NEW.product_id IS NOT NULL THEN
        SELECT calculated_at INTO v_fit_updated
        FROM public.atlas_person_product_fit_state
        WHERE tenant_id = NEW.tenant_id AND person_id = (SELECT person_id FROM public.atlas_subject_registry WHERE subject_id = NEW.subject_id) AND product_id = NEW.product_id;
        
        IF v_fit_updated IS NOT NULL AND v_fit_updated > NEW.evaluated_at THEN
            RAISE EXCEPTION 'Concurrency conflict: Product Fit was updated since NBA calculation';
        END IF;
    END IF;

    -- Check Eligibility
    SELECT max(evaluated_at) INTO v_eligibility_updated
    FROM public.atlas_channel_eligibility
    WHERE subject_id = NEW.subject_id;

    IF v_eligibility_updated IS NOT NULL AND v_eligibility_updated > NEW.evaluated_at THEN
        RAISE EXCEPTION 'Concurrency conflict: Channel Eligibility was updated recently';
    END IF;

    -- Check 9B Decision (if applicable)
    IF NEW.subject_type = 'COMPANY' THEN
        SELECT max(created_at) INTO v_decision_updated
        FROM public.atlas_contact_decisions
        WHERE candidate_id = (SELECT company_id FROM public.atlas_subject_registry WHERE subject_id = NEW.subject_id);

        IF v_decision_updated IS NOT NULL AND v_decision_updated > NEW.evaluated_at THEN
            RAISE EXCEPTION 'Concurrency conflict: 9B Company Decision was updated recently';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_nba_state_concurrency
BEFORE INSERT OR UPDATE ON public.atlas_next_best_action_state
FOR EACH ROW
EXECUTE FUNCTION public.trg_strict_nba_state_concurrency();


-- RLS
ALTER TABLE public.atlas_action_cost_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_next_best_action_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_next_best_action_state ENABLE ROW LEVEL SECURITY;
