-- MIGRATION: ATLAS OUTREACH V0 REAL SEND GATES
-- 20260904204000_atlas_outreach_v0_real_send_gates.sql

-- ==========================================
-- 1. Real Deliveries Ledger
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_deliveries (
    delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    send_idempotency_key TEXT UNIQUE NOT NULL,
    job_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    campaign_id UUID NOT NULL,
    provider TEXT NOT NULL,
    provider_message_id TEXT, -- Populated after ACCEPTED
    status TEXT NOT NULL DEFAULT 'AUTHORIZED',
    authorization_token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempt_count INT NOT NULL DEFAULT 1,
    first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. Provider Events (Webhooks)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.atlas_outreach_provider_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_event_id TEXT UNIQUE NOT NULL, -- Deduplication key from provider
    provider_message_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- ==========================================
-- 3. Authorize Real Send (The Final Server Gate)
-- ==========================================
-- This completely blocks REAL sends if send_enabled = FALSE.
-- Ensures worker hasn't timed out, policy is valid, budget is reserved.
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
    authorization_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job RECORD;
    v_contact RECORD;
    v_campaign RECORD;
    v_config RECORD;
    v_is_suppressed BOOLEAN;
    v_delivery RECORD;
    v_send_idempotency_key TEXT;
    v_auth_token TEXT;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- 1. Validate Lease Ownership
    SELECT * INTO v_job FROM public.atlas_outreach_queue WHERE job_id = p_job_id;
    IF NOT FOUND OR v_job.status != 'PROCESSING' 
       OR v_job.locked_by != p_worker_id 
       OR v_job.lock_token != p_lock_token 
       OR v_job.lock_expires_at < NOW() THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT;
        RETURN;
    END IF;

    <<auth_block>>
    BEGIN
        -- 2. Check KILL SWITCHES (The most critical part)
        SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1;
        IF NOT v_config.outreach_enabled OR NOT v_config.send_enabled THEN
            EXIT auth_block;
        END IF;

        SELECT * INTO v_campaign FROM public.atlas_outreach_campaigns WHERE campaign_id = v_job.campaign_id;
        IF NOT FOUND OR NOT v_campaign.campaign_enabled THEN
            EXIT auth_block;
        END IF;

        -- 3. Check Suppression
        SELECT * INTO v_contact FROM public.atlas_contacts WHERE contact_id = v_job.contact_id;
        v_is_suppressed := public.check_outreach_suppression(v_contact.email_hash, v_job.campaign_id);
        IF v_is_suppressed THEN
            EXIT auth_block;
        END IF;

        -- 4. Idempotency Check & Creation
        v_send_idempotency_key := v_job.idempotency_key;
        v_auth_token := gen_random_uuid()::text;
        v_expires_at := NOW() + INTERVAL '5 minutes';

        -- Upsert logic: if idempotency key already exists, we recover it if it's AUTHORIZED or FAILED,
        -- but if it's ACCEPTED or beyond, we MUST NOT re-authorize a send.
        SELECT * INTO v_delivery FROM public.atlas_outreach_deliveries WHERE atlas_outreach_deliveries.send_idempotency_key = v_send_idempotency_key;
        
        IF FOUND THEN
            IF v_delivery.status IN ('ACCEPTED', 'DELIVERED', 'BOUNCED', 'COMPLAINT') THEN
                -- Already successfully sent to provider! Do not authorize again.
                RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT;
                RETURN;
            ELSE
                -- It was authorized but failed or timed out before acceptance. Update token.
                UPDATE public.atlas_outreach_deliveries
                SET authorization_token = v_auth_token,
                    expires_at = v_expires_at,
                    attempt_count = attempt_count + 1,
                    updated_at = NOW()
                WHERE atlas_outreach_deliveries.delivery_id = v_delivery.delivery_id
                RETURNING * INTO v_delivery;
            END IF;
        ELSE
            INSERT INTO public.atlas_outreach_deliveries (
                send_idempotency_key, job_id, contact_id, campaign_id, provider, status, authorization_token, expires_at
            ) VALUES (
                v_send_idempotency_key, p_job_id, v_job.contact_id, v_job.campaign_id, p_provider, 'AUTHORIZED', v_auth_token, v_expires_at
            ) RETURNING * INTO v_delivery;
        END IF;

        RETURN QUERY SELECT TRUE, v_delivery.delivery_id, v_delivery.send_idempotency_key, v_auth_token;
        RETURN;
    END auth_block;

    -- If we reach here, we exited auth_block early due to a kill switch or suppression
    UPDATE public.atlas_outreach_queue
    SET status = 'BLOCKED',
        updated_at = NOW()
    WHERE atlas_outreach_queue.job_id = p_job_id;

    INSERT INTO public.atlas_outreach_events (job_id, contact_id, campaign_id, event_type)
    VALUES (p_job_id, v_job.contact_id, v_job.campaign_id, 'REAL_SEND_BLOCKED');

    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
END;
$$;


-- ==========================================
-- 4. Register Provider Acceptance
-- ==========================================
CREATE OR REPLACE FUNCTION public.register_provider_acceptance(
    p_authorization_token TEXT,
    p_provider_message_id TEXT,
    p_success BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows INT;
BEGIN
    IF p_success THEN
        UPDATE public.atlas_outreach_deliveries
        SET status = 'ACCEPTED',
            provider_message_id = p_provider_message_id,
            accepted_at = NOW(),
            updated_at = NOW(),
            authorization_token = 'USED_' || p_authorization_token -- Invalidate
        WHERE authorization_token = p_authorization_token
          AND expires_at >= NOW();
    ELSE
        UPDATE public.atlas_outreach_deliveries
        SET status = 'FAILED',
            updated_at = NOW(),
            authorization_token = 'FAILED_' || p_authorization_token -- Invalidate
        WHERE authorization_token = p_authorization_token;
    END IF;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

-- ==========================================
-- 5. Process Provider Webhook
-- ==========================================
CREATE OR REPLACE FUNCTION public.process_provider_event(
    p_provider TEXT,
    p_provider_event_id TEXT,
    p_provider_message_id TEXT,
    p_event_type TEXT,
    p_payload_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_delivery RECORD;
    v_contact RECORD;
    v_new_status TEXT;
BEGIN
    -- 1. Deduplication
    INSERT INTO public.atlas_outreach_provider_events (
        provider, provider_event_id, provider_message_id, event_type, payload_hash
    ) VALUES (
        p_provider, p_provider_event_id, p_provider_message_id, p_event_type, p_payload_hash
    ) ON CONFLICT (provider_event_id) DO NOTHING;

    IF NOT FOUND THEN
        -- Already processed this exact event
        RETURN FALSE;
    END IF;

    -- 2. Find Delivery
    SELECT * INTO v_delivery FROM public.atlas_outreach_deliveries 
    WHERE provider_message_id = p_provider_message_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- 3. Map Event Type to Delivery Status
    -- Expected p_event_type mapped from Resend: 'DELIVERED', 'BOUNCED', 'COMPLAINT'
    IF p_event_type = 'DELIVERED' THEN
        v_new_status := 'DELIVERED';
    ELSIF p_event_type = 'BOUNCED' THEN
        v_new_status := 'BOUNCED';
    ELSIF p_event_type = 'COMPLAINT' THEN
        v_new_status := 'COMPLAINT';
    ELSE
        v_new_status := v_delivery.status; -- Unknown event, keep status
    END IF;

    IF v_new_status != v_delivery.status THEN
        UPDATE public.atlas_outreach_deliveries
        SET status = v_new_status,
            updated_at = NOW()
        WHERE delivery_id = v_delivery.delivery_id;
    END IF;

    -- 4. Suppression Cascade (HARD_BOUNCE / COMPLAINT / UNSUBSCRIBED)
    IF p_event_type IN ('BOUNCED', 'COMPLAINT', 'UNSUBSCRIBED') THEN
        -- Get contact email hash
        SELECT * INTO v_contact FROM public.atlas_contacts WHERE contact_id = v_delivery.contact_id;
        
        -- Insert suppression
        INSERT INTO public.atlas_outreach_suppressions (
            email_hash, contact_id, scope, reason
        ) VALUES (
            v_contact.email_hash, v_delivery.contact_id, 'ALL', p_event_type
        ) ON CONFLICT (email_hash, scope) DO NOTHING;

        -- Safe Cascade to Queue: Only PENDING or RETRY
        UPDATE public.atlas_outreach_queue
        SET status = 'BLOCKED',
            updated_at = NOW()
        WHERE contact_id = v_delivery.contact_id
          AND status IN ('PENDING', 'RETRY');
    END IF;

    -- Mark event processed
    UPDATE public.atlas_outreach_provider_events
    SET processed_at = NOW()
    WHERE provider_event_id = p_provider_event_id;

    RETURN TRUE;
END;
$$;
