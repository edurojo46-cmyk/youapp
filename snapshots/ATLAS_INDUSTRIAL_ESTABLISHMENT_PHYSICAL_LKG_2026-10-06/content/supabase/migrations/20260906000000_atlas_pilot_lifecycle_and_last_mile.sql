-- MIGRATION: ATLAS PILOT LIFECYCLE AND LAST-MILE (9E-B)
-- 20260906000000_atlas_pilot_lifecycle_and_last_mile.sql

-- 1. Pilot Lifecycle Authoritative RPCs
CREATE OR REPLACE FUNCTION public.activate_pilot_run(p_pilot_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pilot RECORD;
    v_config RECORD;
    v_delivery_count INT;
BEGIN
    -- Ensure exactly ONE active pilot
    SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1 FOR UPDATE;
    IF v_config.active_pilot_run_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ANOTHER_PILOT_ALREADY_ACTIVE');
    END IF;

    -- Lock pilot
    SELECT * INTO v_pilot FROM public.atlas_pilot_runs WHERE id = p_pilot_run_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_NOT_FOUND');
    END IF;

    -- Validation constraints
    IF v_pilot.preflight_status != 'PASS' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PREFLIGHT_NOT_PASS');
    END IF;

    IF v_pilot.status != 'ARMED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_NOT_ARMED');
    END IF;
    
    IF v_pilot.expires_at IS NOT NULL AND NOW() > v_pilot.expires_at THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_EXPIRED');
    END IF;

    IF v_pilot.send_count != 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'SEND_COUNT_NOT_ZERO');
    END IF;

    SELECT COUNT(*) INTO v_delivery_count FROM public.atlas_pilot_run_deliveries WHERE pilot_run_id = p_pilot_run_id;
    IF v_delivery_count != 3 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'EXPECTED_EXACTLY_3_DELIVERIES');
    END IF;

    -- Activate
    UPDATE public.atlas_pilot_runs 
    SET status = 'RUNNING', opened_at = NOW(), expires_at = NOW() + INTERVAL '10 minutes'
    WHERE id = p_pilot_run_id;

    UPDATE public.atlas_outreach_config 
    SET active_pilot_run_id = p_pilot_run_id
    WHERE id = 1;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_pilot_send_window(p_pilot_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pilot RECORD;
    v_config RECORD;
    v_delivery_count INT;
BEGIN
    SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1 FOR UPDATE;
    IF v_config.active_pilot_run_id != p_pilot_run_id THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_SCOPE_MISMATCH');
    END IF;

    SELECT * INTO v_pilot FROM public.atlas_pilot_runs WHERE id = p_pilot_run_id FOR UPDATE;
    
    IF v_pilot.status != 'RUNNING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_NOT_RUNNING');
    END IF;

    IF v_pilot.preflight_status != 'PASS' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PREFLIGHT_NOT_PASS');
    END IF;

    IF v_pilot.expires_at IS NOT NULL AND NOW() > v_pilot.expires_at THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_EXPIRED');
    END IF;

    IF v_pilot.send_count >= 3 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'MAX_SENDS_REACHED');
    END IF;

    SELECT COUNT(*) INTO v_delivery_count FROM public.atlas_pilot_run_deliveries WHERE pilot_run_id = p_pilot_run_id;
    IF v_delivery_count != 3 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'EXPECTED_EXACTLY_3_DELIVERIES');
    END IF;

    UPDATE public.atlas_outreach_config 
    SET send_enabled = true
    WHERE id = 1;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_pilot_run(p_pilot_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.atlas_pilot_runs 
    SET status = 'COMPLETED', closed_at = NOW(), send_enabled_final_state = false
    WHERE id = p_pilot_run_id AND status = 'RUNNING';

    UPDATE public.atlas_outreach_config 
    SET active_pilot_run_id = NULL, send_enabled = false
    WHERE id = 1;

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.abort_pilot_run(p_pilot_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.atlas_pilot_runs 
    SET status = 'ABORTED', closed_at = NOW(), send_enabled_final_state = false
    WHERE id = p_pilot_run_id;

    UPDATE public.atlas_outreach_config 
    SET active_pilot_run_id = NULL, send_enabled = false
    WHERE id = 1;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- 2. Last-Mile Enforcement on `create_delivery_attempt`
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
    -- [NEW] LAST-MILE PILOT_ONLY Scope Check
    IF NOT public.check_pilot_scope(p_logical_delivery_id) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_SCOPE_MISMATCH');
    END IF;

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
