-- MIGRATION: ATLAS OUTREACH V0 QUEUE & BUDGET
-- 20260904202000_atlas_outreach_v0_queue_budget.sql

-- ==========================================
-- 1. Budgeting (reserve_outreach_budget)
-- ==========================================
CREATE OR REPLACE FUNCTION public.reserve_outreach_budget(
    p_metric TEXT, -- 'GLOBAL_SEND', 'CAMPAIGN_SEND', 'DOMAIN_SEND', 'COUNTRY_SEND'
    p_entity_id TEXT, 
    p_amount INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_usage INT;
    v_config RECORD;
    v_campaign RECORD;
    v_today DATE := CURRENT_DATE;
BEGIN
    IF p_amount <= 0 THEN
        RETURN FALSE;
    END IF;

    -- Load config
    SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Upsert the budget record and lock it
    INSERT INTO public.atlas_outreach_daily_usage (usage_date, metric, entity_id, usage_count)
    VALUES (v_today, p_metric, p_entity_id, 0)
    ON CONFLICT (usage_date, metric, entity_id) DO NOTHING;

    -- Atomic check
    SELECT usage_count INTO v_usage
    FROM public.atlas_outreach_daily_usage
    WHERE usage_date = v_today AND metric = p_metric AND (entity_id = p_entity_id OR (entity_id IS NULL AND p_entity_id IS NULL))
    FOR UPDATE;

    -- Validation rules based on metric type
    IF p_metric = 'GLOBAL_SEND' THEN
        IF v_usage + p_amount > v_config.max_daily_sends THEN
            RETURN FALSE;
        END IF;
    ELSIF p_metric = 'CAMPAIGN_SEND' THEN
        SELECT * INTO v_campaign FROM public.atlas_outreach_campaigns WHERE campaign_id = p_entity_id::uuid;
        IF v_usage + p_amount > v_campaign.max_daily_sends THEN
            RETURN FALSE;
        END IF;
    ELSIF p_metric = 'DOMAIN_SEND' THEN
        IF v_usage + p_amount > v_config.max_per_domain_daily THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- Apply usage
    UPDATE public.atlas_outreach_daily_usage
    SET usage_count = usage_count + p_amount,
        updated_at = NOW()
    WHERE usage_date = v_today AND metric = p_metric AND (entity_id = p_entity_id OR (entity_id IS NULL AND p_entity_id IS NULL));

    RETURN TRUE;
END;
$$;


-- ==========================================
-- 2. Enqueue Job
-- ==========================================
CREATE OR REPLACE FUNCTION public.enqueue_outreach_job(
    p_campaign_id UUID,
    p_contact_id UUID,
    p_idempotency_key TEXT,
    p_priority INT DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config RECORD;
    v_campaign RECORD;
    v_contact RECORD;
    v_eval_id UUID;
    v_decision TEXT;
    v_is_suppressed BOOLEAN;
BEGIN
    -- 1. Check Global Switch
    SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1;
    IF NOT v_config.outreach_enabled THEN
        RETURN FALSE;
    END IF;

    -- 2. Check Campaign
    SELECT * INTO v_campaign FROM public.atlas_outreach_campaigns WHERE campaign_id = p_campaign_id;
    IF NOT FOUND OR NOT v_campaign.campaign_enabled THEN
        RETURN FALSE;
    END IF;

    -- 3. Run Compliance Gate
    v_eval_id := public.evaluate_outreach_contact(p_contact_id, p_campaign_id);
    
    -- Check what the decision was
    SELECT decision INTO v_decision FROM public.atlas_outreach_compliance WHERE evaluation_id = v_eval_id;
    
    IF v_decision != 'ALLOWED' THEN
        RETURN FALSE; -- FAIL CLOSED
    END IF;

    -- 4. Queue Insertion
    BEGIN
        INSERT INTO public.atlas_outreach_queue (
            campaign_id,
            contact_id,
            priority,
            idempotency_key,
            compliance_evaluation_id,
            status,
            available_at
        ) VALUES (
            p_campaign_id,
            p_contact_id,
            p_priority,
            p_idempotency_key,
            v_eval_id,
            'PENDING',
            NOW()
        );
    EXCEPTION WHEN unique_violation THEN
        -- idempotency key already exists, safely ignore
        RETURN FALSE;
    END;
    
    -- 5. Record Event
    INSERT INTO public.atlas_outreach_events (job_id, contact_id, campaign_id, event_type)
    VALUES (
        (SELECT job_id FROM public.atlas_outreach_queue WHERE idempotency_key = p_idempotency_key),
        p_contact_id,
        p_campaign_id,
        'QUEUED'
    );

    RETURN TRUE;
END;
$$;


-- ==========================================
-- 3. Lease Job (get_next)
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_next_outreach_job(
    p_worker_id TEXT,
    p_limit INT DEFAULT 1
)
RETURNS TABLE (
    job_id UUID,
    campaign_id UUID,
    contact_id UUID,
    contact_email TEXT,
    lock_token TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config RECORD;
    v_locked_ids UUID[];
    v_rec RECORD;
    v_new_token TEXT;
    v_suppressed BOOLEAN;
    v_campaign_enabled BOOLEAN;
    v_contact_hash TEXT;
BEGIN
    -- 1. Check Global Switch
    SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1;
    IF NOT v_config.outreach_enabled THEN
        RETURN;
    END IF;
    
    -- 2. Recover Stale Jobs
    UPDATE public.atlas_outreach_queue
    SET status = 'RETRY',
        locked_by = NULL,
        lock_token = NULL,
        updated_at = NOW()
    WHERE status = 'PROCESSING'
      AND lock_expires_at < NOW();

    -- 3. Lock Next Jobs
    FOR v_rec IN 
        SELECT q.job_id, q.campaign_id, q.contact_id, c.email_hash, c.email
        FROM public.atlas_outreach_queue q
        JOIN public.atlas_contacts c ON q.contact_id = c.contact_id
        WHERE q.status IN ('PENDING', 'RETRY')
          AND q.available_at <= NOW()
          AND q.attempt_count < q.max_attempts
        ORDER BY q.priority DESC, q.available_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    LOOP
        -- RE-CHECK 1: Campaign Enabled?
        SELECT campaign_enabled INTO v_campaign_enabled FROM public.atlas_outreach_campaigns WHERE atlas_outreach_campaigns.campaign_id = v_rec.campaign_id;
        IF NOT v_campaign_enabled THEN
            -- Skip, leave pending for when campaign turns on
            CONTINUE;
        END IF;
        
        -- RE-CHECK 2: Suppression
        v_suppressed := public.check_outreach_suppression(v_rec.email_hash, v_rec.campaign_id);
        IF v_suppressed THEN
            -- Fast-fail to BLOCKED
            UPDATE public.atlas_outreach_queue
            SET status = 'BLOCKED',
                updated_at = NOW()
            WHERE atlas_outreach_queue.job_id = v_rec.job_id;
            
            INSERT INTO public.atlas_outreach_events (job_id, contact_id, campaign_id, event_type)
            VALUES (v_rec.job_id, v_rec.contact_id, v_rec.campaign_id, 'COMPLIANCE_BLOCKED');
            
            CONTINUE;
        END IF;

        -- Safe to Lease
        v_new_token := gen_random_uuid()::text;
        
        UPDATE public.atlas_outreach_queue
        SET status = 'PROCESSING',
            locked_by = p_worker_id,
            locked_at = NOW(),
            lock_expires_at = NOW() + INTERVAL '10 minutes',
            lock_token = v_new_token,
            attempt_count = attempt_count + 1,
            updated_at = NOW()
        WHERE atlas_outreach_queue.job_id = v_rec.job_id;
        
        RETURN QUERY SELECT 
            v_rec.job_id, 
            v_rec.campaign_id, 
            v_rec.contact_id, 
            v_rec.email, 
            v_new_token;
            
    END LOOP;
END;
$$;
