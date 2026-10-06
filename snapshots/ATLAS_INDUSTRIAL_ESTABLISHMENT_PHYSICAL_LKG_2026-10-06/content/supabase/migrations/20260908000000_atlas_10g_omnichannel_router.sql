-- ========================================================================================
-- ATLAS PHASE 10G: OMNICHANNEL ROUTER V1
-- ========================================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.atlas_10g_business_domain AS ENUM (
        'OUTREACH',
        'GROWTH',
        'COMMERCE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. ROUTING POLICIES
CREATE TABLE IF NOT EXISTS public.atlas_omnichannel_routing_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    business_domain public.atlas_10g_business_domain NOT NULL,
    policy_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DRAFT', 'ARCHIVED')),
    
    -- V1 scoring configuration (feature weights, minimum margins, hard penalties)
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one active policy per domain per tenant
CREATE UNIQUE INDEX uq_atlas_10g_active_policy ON public.atlas_omnichannel_routing_policies (tenant_id, business_domain) WHERE (status = 'ACTIVE');

-- 3. ROUTING STATE (Decisions)
CREATE TABLE IF NOT EXISTS public.atlas_omnichannel_routing_state (
    routing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    nba_id UUID NOT NULL REFERENCES public.atlas_next_best_action_state(nba_id) ON DELETE CASCADE,
    business_domain public.atlas_10g_business_domain NOT NULL,
    policy_id UUID NOT NULL REFERENCES public.atlas_omnichannel_routing_policies(policy_id) ON DELETE CASCADE,
    
    -- State and inputs
    candidate_set_hash TEXT NOT NULL,
    context_signal_hash TEXT NOT NULL,
    
    -- Outcomes
    selected_action public.atlas_nba_action NOT NULL,
    selected_channel TEXT, -- nullable if NO_ACTION or WAIT
    selected_score NUMERIC(10,4) NOT NULL,
    
    scored_candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    
    status TEXT NOT NULL CHECK (status IN ('ROUTED', 'HOLD', 'REVIEW_REQUIRED', 'FAILED')),
    
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One routing state per NBA evaluation
    CONSTRAINT uq_atlas_10g_routing_state UNIQUE (tenant_id, nba_id)
);

-- RLS
ALTER TABLE public.atlas_omnichannel_routing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_omnichannel_routing_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_10g_policies_tenant_isolation ON public.atlas_omnichannel_routing_policies FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE POLICY atlas_10g_state_tenant_isolation ON public.atlas_omnichannel_routing_state FOR ALL USING (tenant_id = public.get_auth_tenant_id());
