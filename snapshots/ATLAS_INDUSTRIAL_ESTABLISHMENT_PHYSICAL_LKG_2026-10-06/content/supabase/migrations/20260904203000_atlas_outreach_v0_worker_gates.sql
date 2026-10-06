-- MIGRATION: ATLAS OUTREACH V0 WORKER GATES
-- 20260904203000_atlas_outreach_v0_worker_gates.sql

-- ==========================================
-- 1. Simulated Provider Deliveries Table
-- ==========================================
-- This table acts as our "Email Provider" for the Shadow Mode tests,
-- guaranteeing idempotency at the absolute lowest layer.
CREATE TABLE IF NOT EXISTS public.atlas_outreach_simulated_deliveries (
    provider_message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    send_idempotency_key TEXT UNIQUE NOT NULL,
    job_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    campaign_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACCEPTED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. Final Can Dispatch Gate
-- ==========================================
-- Third and final check, executed microseconds before dispatch.
-- Validates:
-- 1. Lease ownership (worker_id + lock_token)
-- 2. Outreach enabled globally
-- 3. Campaign enabled
-- 4. Suppression race conditions (no new suppressions since lease)
CREATE OR REPLACE FUNCTION public.final_can_dispatch(
    p_job_id UUID,
    p_worker_id TEXT,
    p_lock_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job RECORD;
    v_contact RECORD;
    v_campaign RECORD;
    v_config RECORD;
    v_is_suppressed BOOLEAN;
BEGIN
    -- 1. Validate Lease Ownership
    SELECT * INTO v_job FROM public.atlas_outreach_queue WHERE job_id = p_job_id;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_job.status != 'PROCESSING' 
       OR v_job.locked_by != p_worker_id 
       OR v_job.lock_token != p_lock_token 
       OR v_job.lock_expires_at < NOW() THEN
        -- Stale worker or lost lease. Fail securely.
        RETURN FALSE;
    END IF;

    <<dispatch_block>>
    BEGIN
        -- 2. Load Config & Campaign
        SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1;
        IF NOT v_config.outreach_enabled THEN
            EXIT dispatch_block;
        END IF;

        SELECT * INTO v_campaign FROM public.atlas_outreach_campaigns WHERE campaign_id = v_job.campaign_id;
        IF NOT FOUND OR NOT v_campaign.campaign_enabled THEN
            EXIT dispatch_block;
        END IF;

        -- 3. Check Suppression again
        SELECT * INTO v_contact FROM public.atlas_contacts WHERE contact_id = v_job.contact_id;
        v_is_suppressed := public.check_outreach_suppression(v_contact.email_hash, v_job.campaign_id);
        IF v_is_suppressed THEN
            EXIT dispatch_block;
        END IF;

        -- All clear, allow dispatch.
        RETURN TRUE;
    END dispatch_block;

    -- If we reach here, it means we exited dispatch_block due to a failure condition
    -- Mark as blocked to prevent retries of invalid jobs
    UPDATE public.atlas_outreach_queue
    SET status = 'BLOCKED',
        updated_at = NOW()
    WHERE job_id = p_job_id;

    INSERT INTO public.atlas_outreach_events (job_id, contact_id, campaign_id, event_type)
    VALUES (p_job_id, v_job.contact_id, v_job.campaign_id, 'COMPLIANCE_BLOCKED');

    RETURN FALSE;
END;
$$;


-- ==========================================
-- 3. Job Completion Gate (Success)
-- ==========================================
CREATE OR REPLACE FUNCTION public.complete_outreach_job(
    p_job_id UUID,
    p_worker_id TEXT,
    p_lock_token TEXT,
    p_provider_attempt_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_affected INT;
    v_job RECORD;
BEGIN
    -- Only update if the worker still owns the lock exactly
    UPDATE public.atlas_outreach_queue
    SET status = 'SENT',
        locked_by = NULL,
        lock_token = NULL,
        updated_at = NOW()
    WHERE job_id = p_job_id
      AND status = 'PROCESSING'
      AND locked_by = p_worker_id
      AND lock_token = p_lock_token
    RETURNING * INTO v_job;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    
    IF v_rows_affected = 0 THEN
        -- Stale worker tried to complete a job it no longer owns.
        -- Or job wasn't processing.
        RETURN FALSE;
    END IF;

    -- Record success event
    INSERT INTO public.atlas_outreach_events (job_id, contact_id, campaign_id, event_type, details)
    VALUES (
        p_job_id, 
        v_job.contact_id, 
        v_job.campaign_id, 
        'SENT', 
        jsonb_build_object('provider_attempt_id', p_provider_attempt_id)
    );

    RETURN TRUE;
END;
$$;


-- ==========================================
-- 4. Job Completion Gate (Failure)
-- ==========================================
CREATE OR REPLACE FUNCTION public.fail_outreach_job(
    p_job_id UUID,
    p_worker_id TEXT,
    p_lock_token TEXT,
    p_error_code TEXT,
    p_retryable BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_affected INT;
    v_job RECORD;
    v_new_status TEXT;
BEGIN
    -- Determine new status based on retryability
    IF p_retryable THEN
        v_new_status := 'RETRY';
    ELSE
        v_new_status := 'DEAD_LETTER';
    END IF;

    -- Only update if the worker still owns the lock exactly
    UPDATE public.atlas_outreach_queue
    SET status = v_new_status,
        locked_by = NULL,
        lock_token = NULL,
        updated_at = NOW()
    WHERE job_id = p_job_id
      AND status = 'PROCESSING'
      AND locked_by = p_worker_id
      AND lock_token = p_lock_token
    RETURNING * INTO v_job;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
        RETURN FALSE;
    END IF;

    -- Record failure event
    INSERT INTO public.atlas_outreach_events (job_id, contact_id, campaign_id, event_type, details)
    VALUES (
        p_job_id, 
        v_job.contact_id, 
        v_job.campaign_id, 
        'FAILED', 
        jsonb_build_object('error_code', p_error_code, 'retryable', p_retryable)
    );

    RETURN TRUE;
END;
$$;
