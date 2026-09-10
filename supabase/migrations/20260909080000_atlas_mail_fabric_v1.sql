-- ==============================================================================
-- ATLAS MAIL FABRIC V1
-- Migration: 20260909080000_atlas_mail_fabric_v1.sql
--
-- Adds dedicated SMTP/MTA transport fabric, durable spooling, domain authentication,
-- dynamic receiver throttling profiles, reputation guard telemetry, and infrastructure cost accounting.
-- Fully integrates with Mail Control Plane (077000), 10F execution contracts, and 10H outcome ledger.
-- ==============================================================================

-- 1. IP & DOMAIN POOLS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_fabric_pools (
    pool_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_key TEXT NOT NULL UNIQUE CHECK (pool_key IN ('TRANSACTIONAL', 'KNOWN_CUSTOMERS', 'AUTHORIZED_OUTREACH', 'WARMUP', 'EXPERIMENTAL')),
    description TEXT,
    
    daily_cap INT NOT NULL DEFAULT 10000,
    hourly_cap INT NOT NULL DEFAULT 1000,
    concurrency_limit INT NOT NULL DEFAULT 10,
    
    max_bounce_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0500,     -- 5% max bounce
    max_complaint_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.0010,  -- 0.1% max complaint
    
    is_paused BOOLEAN NOT NULL DEFAULT false,
    kill_switch_active BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Pools
INSERT INTO public.atlas_mail_fabric_pools (pool_key, description, daily_cap, hourly_cap, concurrency_limit, max_bounce_rate, max_complaint_rate)
VALUES 
    ('TRANSACTIONAL', 'High-priority transactional traffic', 50000, 5000, 25, 0.0200, 0.0005),
    ('KNOWN_CUSTOMERS', 'Existing active relationships', 20000, 2000, 15, 0.0300, 0.0010),
    ('AUTHORIZED_OUTREACH', 'Cold but verified business outreach', 10000, 1000, 10, 0.0400, 0.0010),
    ('WARMUP', 'New IP / Domain warmup schedule pool', 1000, 100, 2, 0.0200, 0.0005),
    ('EXPERIMENTAL', 'Controlled test and sandbox traffic', 500, 50, 1, 0.0500, 0.0020)
ON CONFLICT (pool_key) DO NOTHING;

-- 2. DOMAIN AUTHENTICATION REGISTRY (Zero-PII & Secrets outside DB)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_fabric_domain_auth (
    domain_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_name TEXT NOT NULL UNIQUE,
    
    -- DKIM Metadata (Public key / selector only; private key NEVER in DB)
    dkim_selector TEXT NOT NULL DEFAULT 'atlas',
    dkim_public_key_record TEXT NOT NULL,
    dkim_key_length_bits INT NOT NULL DEFAULT 2048,
    
    -- SPF & DMARC Declarations
    spf_record TEXT NOT NULL,
    dmarc_policy TEXT NOT NULL CHECK (dmarc_policy IN ('none', 'quarantine', 'reject')),
    dmarc_record TEXT NOT NULL,
    
    -- PTR / rDNS and HELO/EHLO host
    helo_hostname TEXT NOT NULL,
    ptr_record_verified BOOLEAN NOT NULL DEFAULT false,
    tls_enforced BOOLEAN NOT NULL DEFAULT true,
    
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. DYNAMIC RECEIVER DOMAIN THROTTLING PROFILES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_fabric_throttling_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_pattern TEXT NOT NULL UNIQUE, -- e.g. 'gmail.com', 'outlook.com', 'yahoo.com', 'default'
    provider_family TEXT NOT NULL,       -- e.g. 'GOOGLE', 'MICROSOFT', 'YAHOO', 'GENERIC'
    
    max_messages_per_minute INT NOT NULL DEFAULT 60,
    max_concurrent_connections INT NOT NULL DEFAULT 5,
    max_messages_per_connection INT NOT NULL DEFAULT 20,
    
    initial_backoff_seconds INT NOT NULL DEFAULT 30,
    max_backoff_seconds INT NOT NULL DEFAULT 3600,
    retry_window_seconds INT NOT NULL DEFAULT 86400,
    
    degradation_status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (degradation_status IN ('HEALTHY', 'THROTTLED', 'DEGRADED', 'SUSPENDED')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Default Throttling Profiles
INSERT INTO public.atlas_mail_fabric_throttling_profiles (domain_pattern, provider_family, max_messages_per_minute, max_concurrent_connections, max_messages_per_connection, initial_backoff_seconds, max_backoff_seconds)
VALUES
    ('gmail.com', 'GOOGLE', 120, 10, 50, 60, 3600),
    ('googlemail.com', 'GOOGLE', 120, 10, 50, 60, 3600),
    ('outlook.com', 'MICROSOFT', 60, 5, 20, 120, 7200),
    ('hotmail.com', 'MICROSOFT', 60, 5, 20, 120, 7200),
    ('live.com', 'MICROSOFT', 60, 5, 20, 120, 7200),
    ('yahoo.com', 'YAHOO', 60, 4, 20, 180, 7200),
    ('icloud.com', 'APPLE', 40, 3, 10, 300, 7200),
    ('default', 'GENERIC', 30, 2, 10, 60, 3600)
ON CONFLICT (domain_pattern) DO NOTHING;

-- 4. DURABLE SPOOL QUEUE (Persisted MTA Outbound Queue & Backpressure)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_fabric_spool_queue (
    spool_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mta_queue_id TEXT NOT NULL UNIQUE, -- Stable unique queue ID
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    execution_id UUID NOT NULL REFERENCES public.atlas_executions(execution_id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.atlas_execution_attempts(attempt_id) ON DELETE CASCADE,
    pool_id UUID NOT NULL REFERENCES public.atlas_mail_fabric_pools(pool_id),
    
    -- Zero-PII destination & domain metadata
    recipient_domain TEXT NOT NULL,
    recipient_domain_hash TEXT NOT NULL,
    payload_hash TEXT NOT NULL,
    
    -- Envelope & Message Identification
    canonical_message_id TEXT NOT NULL,
    return_path_address TEXT NOT NULL,
    
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'PROCESSING', 'DELIVERED', 'TEMPORARY_DEFERRED', 'FAILED_PERMANENT', 'EXPIRED_MAX_AGE', 'QUARANTINED')),
    
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    
    enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    completed_at TIMESTAMPTZ,
    
    last_error_code TEXT,
    last_error_message TEXT,
    
    CONSTRAINT uq_spool_attempt UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_spool_queue_dispatch 
    ON public.atlas_mail_fabric_spool_queue (status, next_attempt_at) 
    WHERE status IN ('QUEUED', 'TEMPORARY_DEFERRED');

CREATE INDEX IF NOT EXISTS idx_spool_tenant_domain 
    ON public.atlas_mail_fabric_spool_queue (tenant_id, recipient_domain);

-- 5. REPUTATION TELEMETRY & ERROR MONITORING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_fabric_reputation_telemetry (
    telemetry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pool_id UUID NOT NULL REFERENCES public.atlas_mail_fabric_pools(pool_id),
    recipient_domain TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    
    sent_count INT NOT NULL DEFAULT 0,
    accepted_count INT NOT NULL DEFAULT 0,
    temporary_deferral_count INT NOT NULL DEFAULT 0,
    permanent_bounce_count INT NOT NULL DEFAULT 0,
    complaint_count INT NOT NULL DEFAULT 0,
    throttled_count INT NOT NULL DEFAULT 0,
    
    observed_status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (observed_status IN ('HEALTHY', 'THROTTLED', 'DEGRADED', 'PAUSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_reputation_telemetry_window UNIQUE (pool_id, recipient_domain, window_start)
);

-- 6. INFRASTRUCTURE COST ACCOUNTING (Real VPS + Dedicated IPs + Bandwidth)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_fabric_infra_costs (
    cost_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month DATE NOT NULL UNIQUE,
    
    vps_monthly_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 20.00,       -- e.g. Dedicated Hetzner/Linode Cloud VPS $20/mo
    dedicated_ips_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 10.00,     -- e.g. 2 Clean Dedicated IPv4 @ $5/mo = $10/mo
    egress_cost_per_gb_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0100,    -- e.g. $0.01/GB bandwidth
    storage_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 2.00,            -- Logs/Spool storage $2/mo
    dns_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 1.00,                -- Cloudflare/Route53 zone $1/mo
    
    total_messages_accepted BIGINT NOT NULL DEFAULT 0,
    total_messages_delivered BIGINT NOT NULL DEFAULT 0,
    total_egress_gb NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    
    effective_cost_per_1000_accepted NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    effective_cost_per_1000_delivered NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    effective_cost_per_1m_delivered NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    effective_cost_per_10m_delivered NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. RLS POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.atlas_mail_fabric_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_mail_fabric_domain_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_mail_fabric_throttling_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_mail_fabric_spool_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_mail_fabric_reputation_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_mail_fabric_infra_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_mail_fabric_pools ON public.atlas_mail_fabric_pools;
CREATE POLICY rls_mail_fabric_pools ON public.atlas_mail_fabric_pools FOR ALL USING (true);

DROP POLICY IF EXISTS rls_mail_fabric_domain_auth ON public.atlas_mail_fabric_domain_auth;
CREATE POLICY rls_mail_fabric_domain_auth ON public.atlas_mail_fabric_domain_auth FOR ALL USING (true);

DROP POLICY IF EXISTS rls_mail_fabric_throttling_profiles ON public.atlas_mail_fabric_throttling_profiles;
CREATE POLICY rls_mail_fabric_throttling_profiles ON public.atlas_mail_fabric_throttling_profiles FOR ALL USING (true);

DROP POLICY IF EXISTS rls_mail_fabric_spool_queue ON public.atlas_mail_fabric_spool_queue;
CREATE POLICY rls_mail_fabric_spool_queue ON public.atlas_mail_fabric_spool_queue 
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS rls_mail_fabric_reputation_telemetry ON public.atlas_mail_fabric_reputation_telemetry;
CREATE POLICY rls_mail_fabric_reputation_telemetry ON public.atlas_mail_fabric_reputation_telemetry FOR ALL USING (true);

DROP POLICY IF EXISTS rls_mail_fabric_infra_costs ON public.atlas_mail_fabric_infra_costs;
CREATE POLICY rls_mail_fabric_infra_costs ON public.atlas_mail_fabric_infra_costs FOR ALL USING (true);

-- Permissions
GRANT ALL ON TABLE public.atlas_mail_fabric_pools TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_fabric_domain_auth TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_fabric_throttling_profiles TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_fabric_spool_queue TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_fabric_reputation_telemetry TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_fabric_infra_costs TO authenticated, service_role;

-- 8. SECURITY DEFINER RPCs
-- ------------------------------------------------------------------------------

-- A. Evaluate Pool Limits & Backpressure
CREATE OR REPLACE FUNCTION public.evaluate_mail_fabric_pool_limits_v1(
    p_pool_key TEXT,
    p_max_queue_depth INT DEFAULT 1000
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_pool RECORD;
    v_active_queued INT;
    v_today_sent INT;
    v_hour_sent INT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_pool 
    FROM public.atlas_mail_fabric_pools
    WHERE pool_key = p_pool_key;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'UNKNOWN_POOL');
    END IF;
    
    IF v_pool.kill_switch_active THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'POOL_KILL_SWITCH_ACTIVE');
    END IF;
    
    IF v_pool.is_paused THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'POOL_PAUSED');
    END IF;
    
    IF NOT v_pool.is_active THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'POOL_INACTIVE');
    END IF;
    
    -- Check Current Active Queue Depth (Backpressure)
    SELECT COUNT(*) INTO v_active_queued
    FROM public.atlas_mail_fabric_spool_queue
    WHERE pool_id = v_pool.pool_id AND status IN ('QUEUED', 'PROCESSING');
    
    IF v_active_queued >= p_max_queue_depth THEN
        RETURN jsonb_build_object(
            'allowed', false, 
            'reason', 'BACKPRESSURE_QUEUE_LIMIT_EXCEEDED', 
            'current_depth', v_active_queued,
            'max_depth', p_max_queue_depth
        );
    END IF;
    
    -- Check Today Sent Count
    SELECT COUNT(*) INTO v_today_sent
    FROM public.atlas_mail_fabric_spool_queue
    WHERE pool_id = v_pool.pool_id 
      AND enqueued_at >= date_trunc('day', v_now);
      
    IF v_today_sent >= v_pool.daily_cap THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'POOL_DAILY_CAP_EXCEEDED',
            'daily_sent', v_today_sent,
            'daily_cap', v_pool.daily_cap
        );
    END IF;
    
    -- Check Hour Sent Count
    SELECT COUNT(*) INTO v_hour_sent
    FROM public.atlas_mail_fabric_spool_queue
    WHERE pool_id = v_pool.pool_id 
      AND enqueued_at >= date_trunc('hour', v_now);
      
    IF v_hour_sent >= v_pool.hourly_cap THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'POOL_HOURLY_CAP_EXCEEDED',
            'hourly_sent', v_hour_sent,
            'hourly_cap', v_pool.hourly_cap
        );
    END IF;
    
    RETURN jsonb_build_object(
        'allowed', true,
        'pool_id', v_pool.pool_id,
        'pool_key', v_pool.pool_key,
        'active_queued', v_active_queued,
        'daily_sent', v_today_sent,
        'hourly_sent', v_hour_sent
    );
END;
$$;

-- B. Enqueue Outbound Mail to Durable Spool
CREATE OR REPLACE FUNCTION public.enqueue_mail_fabric_spool_v1(
    p_mta_queue_id TEXT,
    p_execution_id UUID,
    p_attempt_id UUID,
    p_pool_key TEXT,
    p_recipient_domain TEXT,
    p_payload_hash TEXT,
    p_canonical_message_id TEXT,
    p_return_path_address TEXT,
    p_max_age_hours INT DEFAULT 24
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_pool_eval JSONB;
    v_pool_id UUID;
    v_domain_clean TEXT;
    v_domain_hash TEXT;
    v_spool_id UUID;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF v_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_tenant_id FROM public.atlas_executions WHERE execution_id = p_execution_id;
    END IF;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'MISSING_TENANT_CONTEXT');
    END IF;
    
    -- 1. Evaluate Pool Limits & Backpressure
    v_pool_eval := public.evaluate_mail_fabric_pool_limits_v1(p_pool_key);
    IF NOT (v_pool_eval->>'allowed')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason', v_pool_eval->>'reason', 'details', v_pool_eval);
    END IF;
    
    v_pool_id := (v_pool_eval->>'pool_id')::UUID;
    v_domain_clean := LOWER(TRIM(p_recipient_domain));
    v_domain_hash := encode(digest(v_domain_clean, 'sha256'), 'hex');
    v_expires_at := NOW() + (p_max_age_hours || ' hours')::INTERVAL;
    
    -- 2. Insert into Spool Queue with Idempotency
    INSERT INTO public.atlas_mail_fabric_spool_queue (
        mta_queue_id, tenant_id, execution_id, attempt_id, pool_id,
        recipient_domain, recipient_domain_hash, payload_hash,
        canonical_message_id, return_path_address, status,
        enqueued_at, next_attempt_at, expires_at
    ) VALUES (
        p_mta_queue_id, v_tenant_id, p_execution_id, p_attempt_id, v_pool_id,
        v_domain_clean, v_domain_hash, p_payload_hash,
        p_canonical_message_id, p_return_path_address, 'QUEUED',
        NOW(), NOW(), v_expires_at
    )
    ON CONFLICT (attempt_id) DO UPDATE 
        SET next_attempt_at = EXCLUDED.next_attempt_at
    RETURNING spool_id INTO v_spool_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'spool_id', v_spool_id,
        'mta_queue_id', p_mta_queue_id,
        'status', 'QUEUED',
        'expires_at', v_expires_at
    );
END;
$$;

-- C. Settle Spool Item (Delivered / Deferred / Failed / Expired)
CREATE OR REPLACE FUNCTION public.settle_mail_fabric_spool_item_v1(
    p_mta_queue_id TEXT,
    p_final_status TEXT,
    p_error_code TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_next_retry_seconds INT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_spool RECORD;
    v_next_time TIMESTAMPTZ := NULL;
BEGIN
    SELECT * INTO v_spool 
    FROM public.atlas_mail_fabric_spool_queue
    WHERE mta_queue_id = p_mta_queue_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'SPOOL_ITEM_NOT_FOUND');
    END IF;
    
    -- Check expiration before settling
    IF NOW() > v_spool.expires_at AND p_final_status != 'DELIVERED' THEN
        UPDATE public.atlas_mail_fabric_spool_queue
        SET status = 'EXPIRED_MAX_AGE',
            completed_at = NOW(),
            last_error_code = 'EXPIRED_QUEUE_AGE',
            last_error_message = 'Message exceeded maximum queue age before successful delivery'
        WHERE spool_id = v_spool.spool_id;
        
        RETURN jsonb_build_object('success', true, 'status', 'EXPIRED_MAX_AGE', 'mta_queue_id', p_mta_queue_id);
    END IF;
    
    IF p_next_retry_seconds > 0 THEN
        v_next_time := NOW() + (p_next_retry_seconds || ' seconds')::INTERVAL;
    END IF;
    
    UPDATE public.atlas_mail_fabric_spool_queue
    SET status = p_final_status,
        attempt_count = attempt_count + 1,
        next_attempt_at = COALESCE(v_next_time, next_attempt_at),
        completed_at = CASE WHEN p_final_status IN ('DELIVERED', 'FAILED_PERMANENT', 'EXPIRED_MAX_AGE', 'QUARANTINED') THEN NOW() ELSE NULL END,
        last_error_code = p_error_code,
        last_error_message = p_error_message
    WHERE spool_id = v_spool.spool_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'mta_queue_id', p_mta_queue_id,
        'status', p_final_status,
        'attempt_count', v_spool.attempt_count + 1,
        'next_attempt_at', v_next_time
    );
END;
$$;

-- D. Record Reputation Telemetry & Auto-Pause Guard
CREATE OR REPLACE FUNCTION public.record_mail_fabric_reputation_event_v1(
    p_pool_id UUID,
    p_recipient_domain TEXT,
    p_event_type TEXT -- 'ACCEPTED', 'DEFERRAL', 'HARD_BOUNCE', 'COMPLAINT', 'THROTTLED'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_pool RECORD;
    v_window_start TIMESTAMPTZ := date_trunc('hour', NOW());
    v_window_end TIMESTAMPTZ := v_window_start + INTERVAL '1 hour';
    v_telemetry RECORD;
    v_bounce_rate NUMERIC(5, 4) := 0;
    v_complaint_rate NUMERIC(5, 4) := 0;
    v_new_status TEXT := 'HEALTHY';
    v_paused_pool BOOLEAN := false;
BEGIN
    SELECT * INTO v_pool FROM public.atlas_mail_fabric_pools WHERE pool_id = p_pool_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'UNKNOWN_POOL');
    END IF;
    
    -- Insert or Update Telemetry Window
    INSERT INTO public.atlas_mail_fabric_reputation_telemetry (
        pool_id, recipient_domain, window_start, window_end,
        sent_count, accepted_count, temporary_deferral_count,
        permanent_bounce_count, complaint_count, throttled_count, observed_status
    ) VALUES (
        p_pool_id, LOWER(TRIM(p_recipient_domain)), v_window_start, v_window_end,
        1,
        CASE WHEN p_event_type = 'ACCEPTED' THEN 1 ELSE 0 END,
        CASE WHEN p_event_type = 'DEFERRAL' THEN 1 ELSE 0 END,
        CASE WHEN p_event_type = 'HARD_BOUNCE' THEN 1 ELSE 0 END,
        CASE WHEN p_event_type = 'COMPLAINT' THEN 1 ELSE 0 END,
        CASE WHEN p_event_type = 'THROTTLED' THEN 1 ELSE 0 END,
        'HEALTHY'
    )
    ON CONFLICT (pool_id, recipient_domain, window_start) DO UPDATE
    SET sent_count = public.atlas_mail_fabric_reputation_telemetry.sent_count + 1,
        accepted_count = public.atlas_mail_fabric_reputation_telemetry.accepted_count + (CASE WHEN p_event_type = 'ACCEPTED' THEN 1 ELSE 0 END),
        temporary_deferral_count = public.atlas_mail_fabric_reputation_telemetry.temporary_deferral_count + (CASE WHEN p_event_type = 'DEFERRAL' THEN 1 ELSE 0 END),
        permanent_bounce_count = public.atlas_mail_fabric_reputation_telemetry.permanent_bounce_count + (CASE WHEN p_event_type = 'HARD_BOUNCE' THEN 1 ELSE 0 END),
        complaint_count = public.atlas_mail_fabric_reputation_telemetry.complaint_count + (CASE WHEN p_event_type = 'COMPLAINT' THEN 1 ELSE 0 END),
        throttled_count = public.atlas_mail_fabric_reputation_telemetry.throttled_count + (CASE WHEN p_event_type = 'THROTTLED' THEN 1 ELSE 0 END)
    RETURNING * INTO v_telemetry;
    
    -- Compute Rates
    IF v_telemetry.sent_count >= 5 OR v_telemetry.temporary_deferral_count >= 5 OR v_telemetry.throttled_count >= 3 THEN
        v_bounce_rate := ROUND((v_telemetry.permanent_bounce_count::NUMERIC / GREATEST(v_telemetry.sent_count, 1)::NUMERIC), 4);
        v_complaint_rate := ROUND((v_telemetry.complaint_count::NUMERIC / GREATEST(v_telemetry.sent_count, 1)::NUMERIC), 4);
        
        IF v_complaint_rate >= v_pool.max_complaint_rate OR v_bounce_rate >= v_pool.max_bounce_rate THEN
            v_new_status := 'PAUSED';
            v_paused_pool := true;
            
            -- Trigger Auto-Pause on Pool to prevent reputation destruction
            UPDATE public.atlas_mail_fabric_pools
            SET is_paused = true,
                updated_at = NOW()
            WHERE pool_id = p_pool_id;
        ELSIF v_telemetry.throttled_count >= 3 OR v_telemetry.temporary_deferral_count >= 5 THEN
            v_new_status := 'THROTTLED';
        ELSE
            v_new_status := 'HEALTHY';
        END IF;
        
        UPDATE public.atlas_mail_fabric_reputation_telemetry
        SET observed_status = v_new_status
        WHERE telemetry_id = v_telemetry.telemetry_id;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'pool_id', p_pool_id,
        'domain', p_recipient_domain,
        'bounce_rate', v_bounce_rate,
        'complaint_rate', v_complaint_rate,
        'observed_status', v_new_status,
        'pool_auto_paused', v_paused_pool
    );
END;
$$;

-- E. Infrastructure Cost Calculation (Fixed Costs + IPs + Bandwidth)
CREATE OR REPLACE FUNCTION public.record_mail_fabric_infra_period_cost_v1(
    p_period_month DATE,
    p_vps_cost NUMERIC(10, 2) DEFAULT 20.00,
    p_ips_cost NUMERIC(10, 2) DEFAULT 10.00,
    p_egress_rate_per_gb NUMERIC(10, 4) DEFAULT 0.0100,
    p_storage_cost NUMERIC(10, 2) DEFAULT 2.00,
    p_dns_cost NUMERIC(10, 2) DEFAULT 1.00,
    p_accepted_count BIGINT DEFAULT 0,
    p_delivered_count BIGINT DEFAULT 0,
    p_egress_gb NUMERIC(12, 4) DEFAULT 0.0000
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_fixed_total NUMERIC(10, 2);
    v_variable_total NUMERIC(12, 4);
    v_grand_total NUMERIC(12, 4);
    v_cost_per_1k_acc NUMERIC(10, 6) := 0;
    v_cost_per_1k_del NUMERIC(10, 6) := 0;
    v_cost_per_1m_del NUMERIC(10, 4) := 0;
    v_cost_per_10m_del NUMERIC(10, 4) := 0;
    v_rec RECORD;
BEGIN
    v_fixed_total := p_vps_cost + p_ips_cost + p_storage_cost + p_dns_cost;
    v_variable_total := p_egress_gb * p_egress_rate_per_gb;
    v_grand_total := v_fixed_total + v_variable_total;
    
    IF p_accepted_count > 0 THEN
        v_cost_per_1k_acc := ROUND((v_grand_total / (p_accepted_count::NUMERIC / 1000.0)), 6);
    END IF;
    
    IF p_delivered_count > 0 THEN
        v_cost_per_1k_del := ROUND((v_grand_total / (p_delivered_count::NUMERIC / 1000.0)), 6);
        v_cost_per_1m_del := ROUND(v_cost_per_1k_del * 1000.0, 4);
        v_cost_per_10m_del := ROUND(v_cost_per_1k_del * 10000.0, 4);
    END IF;
    
    INSERT INTO public.atlas_mail_fabric_infra_costs (
        period_month, vps_monthly_cost_usd, dedicated_ips_cost_usd,
        egress_cost_per_gb_usd, storage_cost_usd, dns_cost_usd,
        total_messages_accepted, total_messages_delivered, total_egress_gb,
        effective_cost_per_1000_accepted, effective_cost_per_1000_delivered,
        effective_cost_per_1m_delivered, effective_cost_per_10m_delivered
    ) VALUES (
        p_period_month, p_vps_cost, p_ips_cost,
        p_egress_rate_per_gb, p_storage_cost, p_dns_cost,
        p_accepted_count, p_delivered_count, p_egress_gb,
        v_cost_per_1k_acc, v_cost_per_1k_del,
        v_cost_per_1m_del, v_cost_per_10m_del
    )
    ON CONFLICT (period_month) DO UPDATE
    SET vps_monthly_cost_usd = EXCLUDED.vps_monthly_cost_usd,
        dedicated_ips_cost_usd = EXCLUDED.dedicated_ips_cost_usd,
        egress_cost_per_gb_usd = EXCLUDED.egress_cost_per_gb_usd,
        storage_cost_usd = EXCLUDED.storage_cost_usd,
        dns_cost_usd = EXCLUDED.dns_cost_usd,
        total_messages_accepted = EXCLUDED.total_messages_accepted,
        total_messages_delivered = EXCLUDED.total_messages_delivered,
        total_egress_gb = EXCLUDED.total_egress_gb,
        effective_cost_per_1000_accepted = EXCLUDED.effective_cost_per_1000_accepted,
        effective_cost_per_1000_delivered = EXCLUDED.effective_cost_per_1000_delivered,
        effective_cost_per_1m_delivered = EXCLUDED.effective_cost_per_1m_delivered,
        effective_cost_per_10m_delivered = EXCLUDED.effective_cost_per_10m_delivered,
        updated_at = NOW()
    RETURNING * INTO v_rec;
    
    RETURN jsonb_build_object(
        'success', true,
        'period_month', p_period_month,
        'grand_total_usd', v_grand_total,
        'cost_per_1k_delivered', v_cost_per_1k_del,
        'cost_per_1m_delivered', v_cost_per_1m_del,
        'cost_per_10m_delivered', v_cost_per_10m_del
    );
END;
$$;
