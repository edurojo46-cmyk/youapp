-- MIGRATION: ATLAS PILOT RUNS (9E-B2)
-- 20260905200000_atlas_pilot_runs.sql

CREATE TABLE IF NOT EXISTS public.atlas_pilot_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ARMED, RUNNING, COMPLETED, ABORTED
    opened_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    planned_sends INT NOT NULL DEFAULT 3,
    send_count INT NOT NULL DEFAULT 0,
    
    -- Preflight Record
    preflight_status TEXT,
    preflight_completed_at TIMESTAMPTZ,
    aws_account_id TEXT,
    aws_region TEXT,
    sender_identity TEXT,
    configuration_set TEXT,
    sns_topic_arn TEXT,
    
    send_enabled_final_state BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atlas_pilot_run_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pilot_run_id UUID NOT NULL REFERENCES public.atlas_pilot_runs(id),
    logical_delivery_id UUID NOT NULL,
    recipient_hash TEXT NOT NULL,
    purpose TEXT NOT NULL, -- SUCCESS_SIMULATOR, BOUNCE_SIMULATOR, COMPLAINT_SIMULATOR
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_id UUID,
    UNIQUE(pilot_run_id, logical_delivery_id)
);

-- Add pilot tracking to config
ALTER TABLE public.atlas_outreach_config
ADD COLUMN IF NOT EXISTS active_pilot_run_id UUID REFERENCES public.atlas_pilot_runs(id);

-- Atomic Authority
CREATE OR REPLACE FUNCTION public.authorize_pilot_delivery(
    p_pilot_run_id UUID,
    p_logical_delivery_id UUID,
    p_recipient_hash TEXT,
    p_account TEXT,
    p_region TEXT,
    p_config TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pilot RECORD;
    v_delivery RECORD;
BEGIN
    -- 1. Lock the pilot run
    SELECT * INTO v_pilot FROM public.atlas_pilot_runs WHERE id = p_pilot_run_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_NOT_FOUND');
    END IF;

    -- 2. Verify state and expiry
    IF v_pilot.status != 'RUNNING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_NOT_RUNNING');
    END IF;

    IF NOW() > v_pilot.expires_at THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_EXPIRED');
    END IF;

    -- 3. Verify preflight constraints
    IF v_pilot.preflight_status != 'PASS' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PREFLIGHT_FAILED_OR_MISSING');
    END IF;

    IF v_pilot.aws_account_id != p_account OR v_pilot.aws_region != p_region OR v_pilot.configuration_set != p_config THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PREFLIGHT_MISMATCH');
    END IF;

    -- 4. Verify send count limits
    IF v_pilot.send_count >= v_pilot.planned_sends THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_LIMIT_EXCEEDED');
    END IF;

    -- 5. Verify delivery belongs to pilot and lock it
    SELECT * INTO v_delivery FROM public.atlas_pilot_run_deliveries 
    WHERE pilot_run_id = p_pilot_run_id AND logical_delivery_id = p_logical_delivery_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'DELIVERY_NOT_IN_PILOT');
    END IF;

    IF v_delivery.recipient_hash != p_recipient_hash THEN
        RETURN jsonb_build_object('success', false, 'reason', 'RECIPIENT_MISMATCH');
    END IF;

    IF v_delivery.status != 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'DELIVERY_ALREADY_CONSUMED');
    END IF;

    -- 6. Atomically approve and increment
    UPDATE public.atlas_pilot_runs 
    SET send_count = send_count + 1, updated_at = NOW()
    WHERE id = p_pilot_run_id;

    UPDATE public.atlas_pilot_run_deliveries
    SET status = 'ATTEMPTING'
    WHERE id = v_delivery.id;

    RETURN jsonb_build_object('success', true);
END;
$$;
