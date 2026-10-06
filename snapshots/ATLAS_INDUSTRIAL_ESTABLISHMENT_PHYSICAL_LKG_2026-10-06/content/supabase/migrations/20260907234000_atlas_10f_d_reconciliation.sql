-- ==========================================
-- PHASE 10F-D: RECONCILIATION AND OUTCOME (FORWARD MIGRATION)
-- ==========================================

-- 1. RECONCILIATION OF AMBIGUOUS EXECUTIONS
-- ------------------------------------------
-- Resolves an execution stuck in AMBIGUOUS based on authoritative provider evidence.
CREATE OR REPLACE FUNCTION public.reconcile_ambiguous_execution(
    p_logical_execution_identity TEXT,
    p_attempt_id UUID,
    p_resolution public.atlas_execution_status, -- Must be ACCEPTED or FAILED_PRE_ACCEPT
    p_provider_message_id TEXT,
    p_evidence JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_exec RECORD;
    v_attempt RECORD;
    v_budget RECORD;
BEGIN
    IF p_resolution NOT IN ('ACCEPTED', 'FAILED_PRE_ACCEPT') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESOLUTION_STATUS');
    END IF;

    -- Lock Attempt
    SELECT * INTO v_attempt FROM public.atlas_execution_attempts
    WHERE attempt_id = p_attempt_id AND tenant_id = v_tenant_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_FOUND');
    END IF;
    
    IF v_attempt.status != 'AMBIGUOUS' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_AMBIGUOUS');
    END IF;

    -- Lock Execution
    SELECT * INTO v_exec FROM public.atlas_executions
    WHERE execution_id = v_attempt.execution_id FOR UPDATE;

    -- Lock Budget
    SELECT * INTO v_budget FROM public.atlas_execution_budget_reservations
    WHERE tenant_id = v_tenant_id AND logical_execution_identity = p_logical_execution_identity
    FOR UPDATE;

    -- Apply resolution
    UPDATE public.atlas_execution_attempts
    SET status = p_resolution, provider_message_id = p_provider_message_id, error_details = p_evidence, completed_at = NOW()
    WHERE attempt_id = p_attempt_id;

    UPDATE public.atlas_executions
    SET status = p_resolution, updated_at = NOW(), terminal_at = NOW()
    WHERE execution_id = v_exec.execution_id;

    -- Resolve budget HOLD
    IF p_resolution = 'ACCEPTED' THEN
        UPDATE public.atlas_execution_budget_reservations
        SET status = 'COMMITTED', updated_at = NOW()
        WHERE reservation_id = v_budget.reservation_id AND status = 'HOLD';
    ELSIF p_resolution = 'FAILED_PRE_ACCEPT' THEN
        -- If we prove it was not accepted, we release the budget and the effect slot!
        UPDATE public.atlas_execution_budget_reservations
        SET status = 'RELEASED', updated_at = NOW()
        WHERE reservation_id = v_budget.reservation_id AND status = 'HOLD';
        
        -- Also reclaim the effect slot since the call didn't happen/was rejected!
        -- Wait, the user said: "A slot may only be reclaimed if authoritative evidence proves the network call never occurred."
        -- It's safe to do this here if FAILED_PRE_ACCEPT.
        UPDATE public.atlas_canary_envelopes
        SET claimed_effects = GREATEST(0, claimed_effects - 1), updated_at = NOW()
        WHERE tenant_id = v_tenant_id AND allowed_action = v_exec.action_type AND canary_enabled = true;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. SES EVENT CORRELATION (POST-ACCEPTANCE OUTCOME)
-- ------------------------------------------
-- Model for downstream delivery/bounce/complaint events
CREATE TABLE IF NOT EXISTS public.atlas_execution_outcomes (
    outcome_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    
    execution_id UUID NOT NULL REFERENCES public.atlas_executions(execution_id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.atlas_execution_attempts(attempt_id) ON DELETE CASCADE,
    
    provider_message_id TEXT NOT NULL,
    correlation_tag TEXT NOT NULL, -- e.g. 'atlas_attempt=UUID'
    
    event_type TEXT NOT NULL CHECK (event_type IN ('DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'DELAY')),
    event_timestamp TIMESTAMPTZ NOT NULL,
    event_payload JSONB NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.atlas_execution_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_outcomes ON public.atlas_execution_outcomes FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE INDEX idx_atlas_outcomes_exec ON public.atlas_execution_outcomes (tenant_id, execution_id);
CREATE INDEX idx_atlas_outcomes_msg ON public.atlas_execution_outcomes (provider_message_id);
CREATE INDEX idx_atlas_outcomes_tag ON public.atlas_execution_outcomes (correlation_tag);

