-- ==========================================
-- PHASE 9E: SES ADAPTER V1 - DELIVERY ATTEMPTS
-- ==========================================

-- 1. Create Delivery Attempts Table
CREATE TABLE IF NOT EXISTS public.atlas_delivery_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logical_delivery_id UUID NOT NULL,
    routing_id UUID,
    provider_id UUID NOT NULL,
    generation_id UUID NOT NULL,
    
    payload_hash TEXT NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'ATTEMPTING'
        CHECK (status IN ('ATTEMPTING', 'ACCEPTED', 'FAILED_PRE_ACCEPT', 'AMBIGUOUS')),
    
    provider_message_id TEXT,
    error_details JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_atlas_delivery_attempts_logical ON public.atlas_delivery_attempts(logical_delivery_id);

-- 2. Atomic RPC: Create Durable Attempt
CREATE OR REPLACE FUNCTION public.create_delivery_attempt(
    p_logical_delivery_id UUID,
    p_routing_id UUID,
    p_provider_id UUID,
    p_generation_id UUID,
    p_payload_hash TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt_id UUID;
    v_existing_ambiguous RECORD;
    v_existing_accepted RECORD;
BEGIN
    -- Check for ACCEPTED or AMBIGUOUS attempts for the same logical_delivery_id
    SELECT * INTO v_existing_accepted FROM public.atlas_delivery_attempts
    WHERE logical_delivery_id = p_logical_delivery_id AND status = 'ACCEPTED';
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_ACCEPTED');
    END IF;

    SELECT * INTO v_existing_ambiguous FROM public.atlas_delivery_attempts
    WHERE logical_delivery_id = p_logical_delivery_id AND status IN ('ATTEMPTING', 'AMBIGUOUS');
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'AMBIGUOUS_OUTCOME_PENDING');
    END IF;

    v_attempt_id := gen_random_uuid();

    INSERT INTO public.atlas_delivery_attempts (
        attempt_id, logical_delivery_id, routing_id, provider_id, generation_id, payload_hash, status
    ) VALUES (
        v_attempt_id, p_logical_delivery_id, p_routing_id, p_provider_id, p_generation_id, p_payload_hash, 'ATTEMPTING'
    );

    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id);
END;
$$;

-- 3. Atomic RPC: Record Provider Acceptance (Atomic Commit)
CREATE OR REPLACE FUNCTION public.record_provider_acceptance(
    p_logical_delivery_id UUID,
    p_attempt_id UUID,
    p_provider_message_id TEXT,
    p_payload_hash TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt RECORD;
    v_commit_res JSONB;
BEGIN
    SELECT * INTO v_attempt FROM public.atlas_delivery_attempts
    WHERE attempt_id = p_attempt_id AND logical_delivery_id = p_logical_delivery_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_FOUND');
    END IF;

    IF v_attempt.payload_hash != p_payload_hash THEN
        RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_PAYLOAD_MISMATCH');
    END IF;

    IF v_attempt.status = 'ACCEPTED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already accepted');
    END IF;

    UPDATE public.atlas_delivery_attempts
    SET status = 'ACCEPTED', provider_message_id = p_provider_message_id, updated_at = NOW()
    WHERE attempt_id = p_attempt_id;

    -- Atomically commit economics
    v_commit_res := public.commit_delivery_economics(p_logical_delivery_id);
    IF NOT (v_commit_res->>'success')::BOOLEAN THEN
        -- If economics commit fails, we still accepted it from provider, so this is an anomaly. 
        -- However, it should succeed since it was reserved.
        -- We won't rollback the acceptance because the email actually sent.
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Atomic RPC: Record Definitive Pre-Accept Failure
CREATE OR REPLACE FUNCTION public.record_definitive_pre_accept_failure(
    p_logical_delivery_id UUID,
    p_attempt_id UUID,
    p_payload_hash TEXT,
    p_error_details JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt RECORD;
    v_release_res JSONB;
BEGIN
    SELECT * INTO v_attempt FROM public.atlas_delivery_attempts
    WHERE attempt_id = p_attempt_id AND logical_delivery_id = p_logical_delivery_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_FOUND');
    END IF;

    IF v_attempt.payload_hash != p_payload_hash THEN
        RETURN jsonb_build_object('success', false, 'reason', 'IDEMPOTENCY_PAYLOAD_MISMATCH');
    END IF;

    IF v_attempt.status IN ('ACCEPTED', 'AMBIGUOUS') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CANNOT_FAIL_AFTER_ACCEPT_OR_AMBIGUOUS');
    END IF;

    UPDATE public.atlas_delivery_attempts
    SET status = 'FAILED_PRE_ACCEPT', error_details = p_error_details, updated_at = NOW()
    WHERE attempt_id = p_attempt_id;

    -- Atomically release economics
    v_release_res := public.release_delivery_economics(p_logical_delivery_id);

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. Mark attempt as ambiguous
CREATE OR REPLACE FUNCTION public.record_ambiguous_outcome(
    p_logical_delivery_id UUID,
    p_attempt_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt RECORD;
BEGIN
    SELECT * INTO v_attempt FROM public.atlas_delivery_attempts
    WHERE attempt_id = p_attempt_id AND logical_delivery_id = p_logical_delivery_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_FOUND');
    END IF;

    IF v_attempt.status != 'ATTEMPTING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'NOT_ATTEMPTING');
    END IF;

    UPDATE public.atlas_delivery_attempts
    SET status = 'AMBIGUOUS', updated_at = NOW()
    WHERE attempt_id = p_attempt_id;

    -- We DO NOT release economics. We DO NOT reroute.
    RETURN jsonb_build_object('success', true);
END;
$$;
