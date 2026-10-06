-- 20260905070000_atlas_outreach_v1_pilot_fixes.sql

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
        status,
        expires_at
    ) VALUES (
        p_job_id,
        v_job.contact_id,
        v_job.campaign_id,
        p_provider,
        v_job.idempotency_key, -- REUSING LOGICAL KEY
        v_auth_token,
        'DISPATCHING',
        NOW() + INTERVAL '5 minutes'
    ) RETURNING atlas_outreach_deliveries.delivery_id INTO v_delivery_id;

    RETURN QUERY SELECT true, v_delivery_id, v_job.idempotency_key, v_auth_token, 'AUTHORIZED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
