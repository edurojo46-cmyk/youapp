-- ========================================================================================
-- ATLAS PHASE 10G: INTEGRITY CLOSURE (CANDIDATE AUTHORITY & IMMUTABILITY)
-- ========================================================================================

-- 1. DURABLE 10D CANDIDATES AUTHORITY
CREATE TABLE IF NOT EXISTS public.atlas_next_best_action_candidates (
    candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    nba_id UUID NOT NULL REFERENCES public.atlas_next_best_action_state(nba_id) ON DELETE CASCADE,
    
    action public.atlas_nba_action NOT NULL,
    channel TEXT,
    base_utility NUMERIC(10,4) NOT NULL DEFAULT 0,
    cost_class TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_nba_candidate UNIQUE (tenant_id, nba_id, action, channel)
);

ALTER TABLE public.atlas_next_best_action_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_10g_candidates_tenant_isolation ON public.atlas_next_best_action_candidates FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 2. APPEND-ONLY SEMANTICS FOR ROUTING STATE

-- Drop the overly restrictive unique constraint
ALTER TABLE public.atlas_omnichannel_routing_state DROP CONSTRAINT IF EXISTS uq_atlas_10g_routing_state;

-- Add idempotency constraint so exact retries can be detected and DO NOTHING
-- A decision is uniquely identified by the exact inputs + policy
ALTER TABLE public.atlas_omnichannel_routing_state 
    ADD CONSTRAINT uq_atlas_10g_routing_idempotency 
    UNIQUE (tenant_id, nba_id, policy_id, candidate_set_hash, context_signal_hash);

-- Prevent UPDATE and DELETE on routing state
REVOKE UPDATE, DELETE ON public.atlas_omnichannel_routing_state FROM authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.trg_prevent_routing_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'atlas_omnichannel_routing_state is append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atlas_10g_routing_append_only
BEFORE UPDATE OR DELETE ON public.atlas_omnichannel_routing_state
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_routing_mutation();

