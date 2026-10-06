-- MIGRATION: ATLAS OUTREACH V1 PILOT
-- 20260905050000_atlas_outreach_v1_pilot.sql

-- 1. Allowlist Table
CREATE TABLE IF NOT EXISTS public.atlas_outreach_allowlist (
    allowlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by TEXT
);

-- 2. Modify Config Table
ALTER TABLE public.atlas_outreach_config 
ADD COLUMN IF NOT EXISTS real_send_pilot_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS max_real_sends INT NOT NULL DEFAULT 5 CHECK (max_real_sends >= 0),
ADD COLUMN IF NOT EXISTS current_reserved_sends INT NOT NULL DEFAULT 0;

-- 3. Atomic Budget Reservation Function
CREATE OR REPLACE FUNCTION public.reserve_real_send_budget()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config RECORD;
BEGIN
    -- Lock config row
    SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1 FOR UPDATE;
    
    IF v_config.send_enabled = FALSE THEN
        RETURN FALSE;
    END IF;
    
    IF v_config.real_send_pilot_expires_at IS NULL OR NOW() >= v_config.real_send_pilot_expires_at THEN
        RETURN FALSE;
    END IF;

    IF v_config.current_reserved_sends >= v_config.max_real_sends THEN
        RETURN FALSE;
    END IF;

    -- Consume one token
    UPDATE public.atlas_outreach_config
    SET current_reserved_sends = current_reserved_sends + 1,
        updated_at = NOW()
    WHERE id = 1;

    RETURN TRUE;
END;
$$;

-- Helper to refund budget if send completely fails locally before network
CREATE OR REPLACE FUNCTION public.refund_real_send_budget()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.atlas_outreach_config
    SET current_reserved_sends = GREATEST(current_reserved_sends - 1, 0),
        updated_at = NOW()
    WHERE id = 1;
END;
$$;


-- 4. Overwrite authorize_real_send to enforce Allowlist & Pilot Expires & Budget
DROP FUNCTION IF EXISTS public.authorize_real_send(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.authorize_real_send(
    p_job_id UUID,
    p_worker_id TEXT,
    p_lock_token TEXT,
    p_provider TEXT
)
RETURNS TABLE (
    authorized BOOLEAN,
    delivery_id UUID,
    send_idempotency_key TEXT,
    authorization_token TEXT,
    reason TEXT
) AS $$
DECLARE
    v_job RECORD;
    v_contact RECORD;
    v_budget_ok BOOLEAN;
    v_delivery_id UUID;
    v_auth_token TEXT;
    v_is_allowlisted BOOLEAN;
BEGIN
    -- 1. Check Job Lock & State
    SELECT * INTO v_job FROM public.atlas_outreach_queue
    WHERE job_id = p_job_id AND status = 'PROCESSING' 
    AND locked_by = p_worker_id AND lock_token = p_lock_token
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, 'LOCK_OR_STATE_INVALID';
        RETURN;
    END IF;

    -- 2. Load Contact
    SELECT * INTO v_contact FROM public.atlas_contacts WHERE contact_id = v_job.contact_id;

    -- 3. ENFORCE ALLOWLIST
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_outreach_allowlist WHERE email_hash = v_contact.email_hash
    ) INTO v_is_allowlisted;

    IF NOT v_is_allowlisted THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, 'NOT_ALLOWLISTED';
        RETURN;
    END IF;

    -- 4. ENFORCE PILOT WINDOW & BUDGET ATOMICALLY
    SELECT public.reserve_real_send_budget() INTO v_budget_ok;
    
    IF NOT v_budget_ok THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT, 'PILOT_WINDOW_OR_BUDGET_EXHAUSTED';
        RETURN;
    END IF;

    -- 5. Create Delivery Intent
    v_auth_token := encode(gen_random_bytes(32), 'hex');
    
    -- The idempotency key here MUST be exactly the logical idempotency key generated in the enqueue gate.
    -- This guarantees Provider duplicate = Logical duplicate.
    INSERT INTO public.atlas_outreach_deliveries (
        job_id,
        contact_id,
        campaign_id,
        provider,
        send_idempotency_key,
        authorization_token,
        status
    ) VALUES (
        p_job_id,
        v_job.contact_id,
        v_job.campaign_id,
        p_provider,
        v_job.idempotency_key, -- REUSING LOGICAL KEY
        v_auth_token,
        'DISPATCHING'
    ) RETURNING atlas_outreach_deliveries.delivery_id INTO v_delivery_id;

    RETURN QUERY SELECT true, v_delivery_id, v_job.idempotency_key, v_auth_token, 'AUTHORIZED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
