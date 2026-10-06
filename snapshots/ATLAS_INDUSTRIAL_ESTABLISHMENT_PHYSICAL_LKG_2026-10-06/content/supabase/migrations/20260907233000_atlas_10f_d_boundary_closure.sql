-- ==========================================
-- PHASE 10F-D: BOUNDARY CLOSURE (FORWARD MIGRATION)
-- ==========================================

-- 1. DURABLE ENVELOPE
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_canary_envelopes (
    envelope_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    
    canary_enabled BOOLEAN NOT NULL DEFAULT false,
    allowed_provider TEXT NOT NULL,
    allowed_action TEXT NOT NULL,
    
    max_external_effects INT NOT NULL DEFAULT 3,
    claimed_effects INT NOT NULL DEFAULT 0,
    
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_atlas_canary_effects CHECK (claimed_effects <= max_external_effects),
    CONSTRAINT chk_atlas_canary_window CHECK (start_at < end_at)
);

ALTER TABLE public.atlas_canary_envelopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_canary_envelopes ON public.atlas_canary_envelopes FOR ALL USING (tenant_id = public.get_auth_tenant_id());
-- Strict constraint so each tenant has at most one active envelope for an action
CREATE UNIQUE INDEX idx_atlas_canary_env_active ON public.atlas_canary_envelopes (tenant_id, allowed_provider, allowed_action) WHERE canary_enabled = true;

-- 2. EXACT DESTINATION ALLOWLIST
-- ------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_canary_allowed_destinations (
    destination_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    envelope_id UUID NOT NULL REFERENCES public.atlas_canary_envelopes(envelope_id) ON DELETE CASCADE,
    
    destination_hash TEXT NOT NULL,
    destination_class TEXT NOT NULL, -- e.g. 'MAILBOX_SIMULATOR_SUCCESS', 'MAILBOX_SIMULATOR_BOUNCE'
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.atlas_canary_allowed_destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_canary_dests ON public.atlas_canary_allowed_destinations FOR ALL USING (tenant_id = public.get_auth_tenant_id());
CREATE UNIQUE INDEX idx_atlas_canary_dests_hash ON public.atlas_canary_allowed_destinations (tenant_id, envelope_id, destination_hash);

-- 3. FINAL BOUNDARY TRANSACTION (begin_real_execution V2)
-- ------------------------------------------
-- Replaces the previous version to strictly enforce lock ordering, budget, JIT, and external effect cap.
DROP FUNCTION IF EXISTS public.begin_real_execution(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.begin_real_execution(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, UUID, NUMERIC);

CREATE OR REPLACE FUNCTION public.begin_real_execution(
    p_logical_execution_identity TEXT,
    p_execution_request_id TEXT, -- nba_id
    p_subject_type TEXT,
    p_subject_id UUID,
    p_email_hash TEXT,
    p_action_type TEXT,
    p_channel TEXT,
    p_message_certification_id UUID,
    p_certification_snapshot_hash TEXT,
    p_destination_hash TEXT,
    p_prepared_payload_hash TEXT,
    p_cost_id UUID,
    p_amount_reserved NUMERIC(12,4)
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_exec RECORD;
    v_env RECORD;
    v_dest RECORD;
    v_budget RECORD;
    v_attempt_id UUID;
    v_attempt_no INT;
    v_jit_payload JSONB;
    v_jit_result RECORD;
BEGIN
    -- LOCK ORDER 1: executions
    INSERT INTO public.atlas_executions (
        tenant_id, logical_execution_identity, execution_request_id,
        action_type, channel, message_certification_id, certification_snapshot_hash,
        destination_hash, prepared_payload_hash, status
    ) VALUES (
        v_tenant_id, p_logical_execution_identity, p_execution_request_id,
        p_action_type, p_channel, p_message_certification_id, p_certification_snapshot_hash,
        p_destination_hash, p_prepared_payload_hash, 'PREPARED'
    )
    ON CONFLICT (tenant_id, logical_execution_identity) DO NOTHING;
    
    SELECT * INTO v_exec FROM public.atlas_executions 
    WHERE tenant_id = v_tenant_id AND logical_execution_identity = p_logical_execution_identity FOR UPDATE;
    
    -- Fast state checks
    IF v_exec.status = 'ACCEPTED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_ACCEPTED');
    END IF;
    IF v_exec.status = 'AMBIGUOUS' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'AMBIGUOUS_HOLD');
    END IF;
    IF v_exec.status = 'ATTEMPTING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ACTIVE_ATTEMPT_EXISTS');
    END IF;
    
    -- LOCK ORDER 2: canary envelope (Kill switch, window, provider match)
    SELECT * INTO v_env FROM public.atlas_canary_envelopes
    WHERE tenant_id = v_tenant_id 
      AND canary_enabled = true 
      AND allowed_action = p_action_type 
      AND NOW() BETWEEN start_at AND end_at
    FOR UPDATE LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CANARY_DISABLED_OR_NOT_FOUND');
    END IF;
    
    -- Check Effect Cap
    IF v_env.claimed_effects >= v_env.max_external_effects THEN
        RETURN jsonb_build_object('success', false, 'reason', 'EXTERNAL_EFFECT_CAP_REACHED');
    END IF;
    
    -- LOCK ORDER 3: destination allowlist
    SELECT * INTO v_dest FROM public.atlas_canary_allowed_destinations
    WHERE tenant_id = v_tenant_id AND envelope_id = v_env.envelope_id AND destination_hash = p_destination_hash AND is_enabled = true
    FOR SHARE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'DESTINATION_NOT_ALLOWLISTED');
    END IF;
    
    -- LOCK ORDER 4: budget reservation
    SELECT * INTO v_budget FROM public.atlas_execution_budget_reservations
    WHERE tenant_id = v_tenant_id AND logical_execution_identity = p_logical_execution_identity
    FOR UPDATE;
    
    IF NOT FOUND OR v_budget.status != 'RESERVED' THEN
        -- Safely release if it was somehow in a weird state (though we abort here)
        RETURN jsonb_build_object('success', false, 'reason', 'NO_VALID_RESERVATION');
    END IF;
    
    -- LOCK ORDER 5: FINAL JIT AUTHORIZATION
    v_jit_payload := jsonb_build_object(
        'logical_execution_identity', p_logical_execution_identity,
        'execution_request_id', p_execution_request_id,
        'nba_id', p_execution_request_id,
        'subject_type', p_subject_type,
        'subject_id', p_subject_id,
        'email_hash', p_email_hash,
        'action_type', p_action_type,
        'channel', p_channel,
        'certification_id', p_message_certification_id,
        'certification_hash', p_certification_snapshot_hash,
        'destination_hash', p_destination_hash,
        'prepared_payload_hash', p_prepared_payload_hash
    );
    
    v_jit_payload := public.authorize_execution_jit(v_jit_payload);
    
    IF v_jit_payload->>'status' != 'AUTHORIZED' THEN
        -- Safely release budget since JIT denied immediately before network
        UPDATE public.atlas_execution_budget_reservations 
        SET status = 'RELEASED', updated_at = NOW()
        WHERE reservation_id = v_budget.reservation_id;
        
        -- Also set exec to FAILED_PRE_ACCEPT
        UPDATE public.atlas_executions 
        SET status = 'FAILED_PRE_ACCEPT', updated_at = NOW(), terminal_at = NOW()
        WHERE execution_id = v_exec.execution_id;
        
        RETURN jsonb_build_object('success', false, 'reason', 'JIT_DENIED_AT_BOUNDARY', 'jit_status', v_jit_payload->>'status');
    END IF;
    
    -- 6. Claim External Effect Slot
    UPDATE public.atlas_canary_envelopes
    SET claimed_effects = claimed_effects + 1, updated_at = NOW()
    WHERE envelope_id = v_env.envelope_id;
    
    -- 7. ATTEMPTING Active Attempt
    v_attempt_id := gen_random_uuid();
    v_attempt_no := v_exec.attempt_count + 1;
    
    BEGIN
        INSERT INTO public.atlas_execution_attempts (
            attempt_id, execution_id, tenant_id, attempt_no, status, payload_hash
        ) VALUES (
            v_attempt_id, v_exec.execution_id, v_tenant_id, v_attempt_no, 'ATTEMPTING', p_prepared_payload_hash
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ACTIVE_ATTEMPT_EXISTS');
    END;
    
    UPDATE public.atlas_executions 
    SET status = 'ATTEMPTING', attempt_count = v_attempt_no, updated_at = NOW()
    WHERE execution_id = v_exec.execution_id;
    
    -- Return success and permit egress
    RETURN jsonb_build_object(
        'success', true, 
        'execution_id', v_exec.execution_id,
        'attempt_id', v_attempt_id,
        'attempt_no', v_attempt_no,
        'allowed_provider', v_env.allowed_provider
    );
END;
$$;
