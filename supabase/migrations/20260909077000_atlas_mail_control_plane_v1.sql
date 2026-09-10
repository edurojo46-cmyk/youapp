-- ==============================================================================
-- ATLAS MAIL CONTROL PLANE V1
-- Migration: 20260909077000_atlas_mail_control_plane_v1.sql
-- 
-- Integrates deterministic economic and delivery control plane for email dispatches:
-- 1. True Provider Account/Region Scoping (decoupled from individual tenants)
-- 2. July 2026 SES Tiered Pricing Models (Essentials, À la carte, Pro, Enterprise)
-- 3. Contiguous, non-overlapping pricing tier range validation
-- 4. Monthly volume metering with atomic reservation locking
-- 5. Per-attempt volume slot ledger with commit-time ordinal & tier assignment
-- 6. Conservative worst-case pre-send budget estimation (fail-closed future tiers)
-- 7. Hash-only sidecar correlation lookup for zero-MessageId network timeouts
-- 8. Minimized provider event ledger & suppression cascade for BOUNCE/COMPLAINT/SUBSCRIPTION
-- 9. Complete reuse of certified 10F execution lifecycle & 10H-A1 outcome projections
-- ==============================================================================

-- 1. PROVIDER ACCOUNT SCOPES & TENANT MAPPING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_provider_account_scopes (
    provider_account_scope_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id TEXT NOT NULL DEFAULT 'AWS_SES',
    aws_region TEXT NOT NULL DEFAULT 'us-east-1',
    scope_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mail_scope UNIQUE (provider_id, aws_region, provider_account_scope_id)
);

CREATE TABLE IF NOT EXISTS public.atlas_mail_tenant_provider_accounts (
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    provider_account_scope_id UUID NOT NULL REFERENCES public.atlas_mail_provider_account_scopes(provider_account_scope_id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, provider_account_scope_id)
);

ALTER TABLE public.atlas_mail_tenant_provider_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trg_rls_mail_tenant_accounts ON public.atlas_mail_tenant_provider_accounts;
CREATE POLICY trg_rls_mail_tenant_accounts ON public.atlas_mail_tenant_provider_accounts
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 2. PRICING PLAN CONFIGURATION & TIERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_provider_pricing_configs (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_account_scope_id UUID NOT NULL REFERENCES public.atlas_mail_provider_account_scopes(provider_account_scope_id),
    provider_id TEXT NOT NULL DEFAULT 'AWS_SES',
    aws_region TEXT NOT NULL DEFAULT 'us-east-1',
    pricing_mode TEXT NOT NULL CHECK (pricing_mode IN ('A_LA_CARTE', 'ESSENTIALS', 'PRO', 'ENTERPRISE', 'CUSTOM')),
    pricing_version TEXT NOT NULL,
    
    fixed_monthly_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    data_cost_per_gb NUMERIC(10, 4) NOT NULL DEFAULT 0.1200,
    optional_feature_costs JSONB NOT NULL DEFAULT '{}'::jsonb,
    currency TEXT NOT NULL DEFAULT 'USD',
    
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS public.idx_mail_pricing_active;
CREATE UNIQUE INDEX idx_mail_pricing_active 
    ON public.atlas_mail_provider_pricing_configs (provider_account_scope_id, provider_id, aws_region) 
    WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.atlas_mail_provider_pricing_tiers (
    tier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES public.atlas_mail_provider_pricing_configs(config_id) ON DELETE CASCADE,
    tier_from_volume BIGINT NOT NULL CHECK (tier_from_volume >= 0),
    tier_to_volume BIGINT CHECK (tier_to_volume IS NULL OR tier_to_volume > tier_from_volume),
    cost_per_1000 NUMERIC(10, 6) NOT NULL CHECK (cost_per_1000 >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_pricing_tiers_cfg 
    ON public.atlas_mail_provider_pricing_tiers (config_id, tier_from_volume);

-- 3. MONTHLY PROVIDER VOLUME METERING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_provider_monthly_usage (
    usage_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_account_scope_id UUID NOT NULL REFERENCES public.atlas_mail_provider_account_scopes(provider_account_scope_id),
    provider_id TEXT NOT NULL DEFAULT 'AWS_SES',
    aws_region TEXT NOT NULL DEFAULT 'us-east-1',
    billing_month DATE NOT NULL,
    
    billable_outbound_recipients BIGINT NOT NULL DEFAULT 0,
    reserved_outbound_recipients BIGINT NOT NULL DEFAULT 0,
    usage_source TEXT NOT NULL CHECK (usage_source IN ('ATLAS_LEDGER', 'AWS_VERIFIED', 'MANUAL_VERIFIED')),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_mail_monthly_usage UNIQUE (provider_account_scope_id, provider_id, aws_region, billing_month)
);

-- 4. PER-ATTEMPT VOLUME SLOT LEDGER (Commit-Time Ordinal Assignment)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_volume_reservations (
    volume_reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_account_scope_id UUID NOT NULL REFERENCES public.atlas_mail_provider_account_scopes(provider_account_scope_id),
    usage_id UUID NOT NULL REFERENCES public.atlas_mail_provider_monthly_usage(usage_id),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    execution_id UUID NOT NULL REFERENCES public.atlas_executions(execution_id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.atlas_execution_attempts(attempt_id) ON DELETE CASCADE,
    
    pricing_config_id UUID NOT NULL REFERENCES public.atlas_mail_provider_pricing_configs(config_id),
    estimated_max_cost_per_1000 NUMERIC(10, 6) NOT NULL,
    
    volume_ordinal BIGINT, -- NULL while RESERVED; assigned upon COMMITTED
    pricing_tier_id UUID REFERENCES public.atlas_mail_provider_pricing_tiers(tier_id),
    actual_cost_per_1000 NUMERIC(10, 6),
    
    status TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ,
    
    CONSTRAINT uq_mail_vol_attempt UNIQUE (attempt_id)
);

DROP INDEX IF EXISTS public.idx_mail_vol_ordinal;
CREATE UNIQUE INDEX idx_mail_vol_ordinal 
    ON public.atlas_mail_volume_reservations (provider_account_scope_id, usage_id, volume_ordinal) 
    WHERE volume_ordinal IS NOT NULL;

ALTER TABLE public.atlas_mail_volume_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trg_rls_mail_vol_res ON public.atlas_mail_volume_reservations;
CREATE POLICY trg_rls_mail_vol_res ON public.atlas_mail_volume_reservations
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 5. SIDECAR CORRELATION LOOKUP (Hash-Only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_execution_correlations (
    correlation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    execution_id UUID NOT NULL REFERENCES public.atlas_executions(execution_id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.atlas_execution_attempts(attempt_id) ON DELETE CASCADE,
    
    correlation_token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    
    CONSTRAINT uq_mail_corr_exec_attempt UNIQUE (tenant_id, execution_id, attempt_id),
    CONSTRAINT uq_mail_corr_token_hash UNIQUE (tenant_id, correlation_token_hash)
);

ALTER TABLE public.atlas_mail_execution_correlations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trg_rls_mail_correlations ON public.atlas_mail_execution_correlations;
CREATE POLICY trg_rls_mail_correlations ON public.atlas_mail_execution_correlations
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 6. MINIMIZED PROVIDER EVENTS LEDGER (Hash-Only)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atlas_mail_provider_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    execution_id UUID REFERENCES public.atlas_executions(execution_id),
    attempt_id UUID REFERENCES public.atlas_execution_attempts(attempt_id),
    
    provider_id TEXT NOT NULL DEFAULT 'AWS_SES',
    provider_event_id TEXT NOT NULL,
    provider_message_id TEXT,
    correlation_token_hash TEXT,
    
    event_type TEXT NOT NULL CHECK (event_type IN ('SEND', 'DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'DELAY', 'SUBSCRIPTION')),
    event_timestamp TIMESTAMPTZ NOT NULL,
    
    bounce_class TEXT,
    bounce_sub_type TEXT,
    
    canonical_payload_hash TEXT NOT NULL,
    minimized_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_mail_event_dedup UNIQUE (tenant_id, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_event_msg 
    ON public.atlas_mail_provider_events (tenant_id, provider_message_id) 
    WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mail_event_corr_hash 
    ON public.atlas_mail_provider_events (tenant_id, correlation_token_hash) 
    WHERE correlation_token_hash IS NOT NULL;

ALTER TABLE public.atlas_mail_provider_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trg_rls_mail_events ON public.atlas_mail_provider_events;
CREATE POLICY trg_rls_mail_events ON public.atlas_mail_provider_events
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- Permissions
GRANT ALL ON TABLE public.atlas_mail_provider_account_scopes TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_tenant_provider_accounts TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_provider_pricing_configs TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_provider_pricing_tiers TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_provider_monthly_usage TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_volume_reservations TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_execution_correlations TO authenticated, service_role;
GRANT ALL ON TABLE public.atlas_mail_provider_events TO authenticated, service_role;

-- ==============================================================================
-- 7. CONTROL PLANE PROCEDURES & FUNCTIONS
-- ==============================================================================

-- A. Validate Pricing Tier Range Continuity (0 -> Infinity with no gaps/overlaps)
CREATE OR REPLACE FUNCTION public.validate_pricing_tier_continuity_v1(p_config_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_expected_from BIGINT := 0;
    v_has_open_tier BOOLEAN := false;
    v_count INT := 0;
BEGIN
    FOR v_rec IN 
        SELECT tier_id, tier_from_volume, tier_to_volume, cost_per_1000
        FROM public.atlas_mail_provider_pricing_tiers
        WHERE config_id = p_config_id
        ORDER BY tier_from_volume ASC
    LOOP
        v_count := v_count + 1;
        
        IF v_rec.tier_from_volume != v_expected_from THEN
            RETURN jsonb_build_object(
                'valid', false, 
                'reason', 'GAP_OR_OVERLAP_DETECTED', 
                'expected_from', v_expected_from, 
                'actual_from', v_rec.tier_from_volume
            );
        END IF;
        
        IF v_rec.tier_to_volume IS NULL THEN
            v_has_open_tier := true;
        ELSE
            v_expected_from := v_rec.tier_to_volume;
        END IF;
    END LOOP;
    
    IF v_count = 0 THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'NO_TIERS_FOUND');
    END IF;
    
    IF NOT v_has_open_tier THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'MISSING_UNBOUNDED_UPPER_TIER');
    END IF;
    
    RETURN jsonb_build_object('valid', true, 'tier_count', v_count);
END;
$$;

-- B. Plan and Route Email V1 (Atomic Direct Transaction adhering to 10F contracts)
CREATE OR REPLACE FUNCTION public.plan_and_route_email_v1(
    p_logical_execution_identity TEXT,
    p_execution_request_id TEXT,
    p_action_type TEXT,
    p_destination_email TEXT,
    p_prepared_payload JSONB,
    p_raw_correlation_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_canonical_email TEXT;
    v_dest_hash TEXT;
    v_payload_hash TEXT;
    v_is_suppressed BOOLEAN := false;
    v_scope_id UUID;
    v_pricing_cfg RECORD;
    v_continuity_res JSONB;
    v_billing_month DATE := date_trunc('month', NOW())::date;
    v_usage RECORD;
    v_est_max_cost NUMERIC(10, 6);
    v_amount_reserved NUMERIC(12, 4);
    v_cost_id UUID;
    v_token_hash TEXT;
    v_attempt_id UUID;
    v_exec RECORD;
BEGIN
    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'MISSING_TENANT_CONTEXT');
    END IF;

    -- 1. Invariant: Canonical Email Hash
    v_canonical_email := LOWER(TRIM(p_destination_email));
    v_dest_hash := encode(digest(v_canonical_email, 'sha256'), 'hex');
    v_payload_hash := encode(digest(p_prepared_payload::text, 'sha256'), 'hex');

    -- 2. Fail-closed Suppression Check
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_outreach_suppressions
        WHERE tenant_id = v_tenant_id 
          AND email_hash = v_dest_hash 
          AND scope IN ('ALL', 'MARKETING')
    ) INTO v_is_suppressed;

    IF v_is_suppressed THEN
        RETURN jsonb_build_object('success', false, 'reason', 'DESTINATION_SUPPRESSED');
    END IF;

    -- 3. Resolve Account Scope for Tenant
    SELECT provider_account_scope_id INTO v_scope_id
    FROM public.atlas_mail_tenant_provider_accounts
    WHERE tenant_id = v_tenant_id AND is_active = true
    LIMIT 1;

    IF v_scope_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'NO_ACTIVE_PROVIDER_ACCOUNT_SCOPE');
    END IF;

    -- 4. Resolve Single Active Pricing Config
    SELECT * INTO v_pricing_cfg
    FROM public.atlas_mail_provider_pricing_configs
    WHERE provider_account_scope_id = v_scope_id 
      AND is_active = true 
      AND effective_from <= NOW() 
      AND (effective_to IS NULL OR effective_to > NOW());

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'UNKNOWN_PRICING');
    END IF;

    -- Validate Tier Continuity
    v_continuity_res := public.validate_pricing_tier_continuity_v1(v_pricing_cfg.config_id);
    IF NOT (v_continuity_res->>'valid')::boolean THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_PRICING_CONFIG', 'details', v_continuity_res);
    END IF;

    -- 5. Lock or Initialize Monthly Usage Row
    INSERT INTO public.atlas_mail_provider_monthly_usage (
        provider_account_scope_id, provider_id, aws_region, billing_month,
        billable_outbound_recipients, reserved_outbound_recipients, usage_source
    ) VALUES (
        v_scope_id, v_pricing_cfg.provider_id, v_pricing_cfg.aws_region, v_billing_month,
        0, 0, 'ATLAS_LEDGER'
    )
    ON CONFLICT (provider_account_scope_id, provider_id, aws_region, billing_month) DO NOTHING;

    SELECT * INTO v_usage
    FROM public.atlas_mail_provider_monthly_usage
    WHERE provider_account_scope_id = v_scope_id 
      AND provider_id = v_pricing_cfg.provider_id 
      AND aws_region = v_pricing_cfg.aws_region 
      AND billing_month = v_billing_month
    FOR UPDATE;

    -- 6. Conservative Worst-Case Rate Calculation (Looking across all potential future tiers)
    SELECT MAX(cost_per_1000) INTO v_est_max_cost
    FROM public.atlas_mail_provider_pricing_tiers
    WHERE config_id = v_pricing_cfg.config_id 
      AND (tier_to_volume IS NULL OR tier_to_volume > v_usage.billable_outbound_recipients);

    IF v_est_max_cost IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'UNKNOWN_TIER_RATE');
    END IF;

    -- Marginal calculation: (cost_per_1000 / 1000) + payload data cost
    v_amount_reserved := ROUND((v_est_max_cost / 1000.0) + ((pg_column_size(p_prepared_payload::text) / 1000000000.0) * v_pricing_cfg.data_cost_per_gb), 6);
    IF v_amount_reserved < 0.0001 THEN
        v_amount_reserved := 0.0001; -- Minimum currency precision floor
    END IF;

    v_cost_id := v_pricing_cfg.config_id;

    -- 7. 10F Execution Aggregate & Budget Reservation
    INSERT INTO public.atlas_executions (
        tenant_id, logical_execution_identity, execution_request_id,
        action_type, channel, message_certification_id, certification_snapshot_hash,
        destination_hash, prepared_payload_hash, status, attempt_count
    ) VALUES (
        v_tenant_id, p_logical_execution_identity, p_execution_request_id,
        p_action_type, 'EMAIL', gen_random_uuid(), v_payload_hash,
        v_dest_hash, v_payload_hash, 'ATTEMPTING', 1
    )
    ON CONFLICT (tenant_id, logical_execution_identity) DO NOTHING;

    SELECT * INTO v_exec FROM public.atlas_executions
    WHERE tenant_id = v_tenant_id AND logical_execution_identity = p_logical_execution_identity
    FOR UPDATE;

    IF v_exec.status = 'ACCEPTED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_ACCEPTED');
    END IF;

    INSERT INTO public.atlas_execution_budget_reservations (
        tenant_id, logical_execution_identity, cost_id, amount_reserved, status
    ) VALUES (
        v_tenant_id, p_logical_execution_identity, v_cost_id, v_amount_reserved, 'RESERVED'
    )
    ON CONFLICT (tenant_id, logical_execution_identity) DO NOTHING;

    v_attempt_id := gen_random_uuid();
    INSERT INTO public.atlas_execution_attempts (
        attempt_id, execution_id, tenant_id, attempt_no, status, payload_hash
    ) VALUES (
        v_attempt_id, v_exec.execution_id, v_tenant_id, 1, 'ATTEMPTING', v_payload_hash
    );

    -- 8. Increment Monthly Reserved Slot Counter
    UPDATE public.atlas_mail_provider_monthly_usage
    SET reserved_outbound_recipients = reserved_outbound_recipients + 1,
        observed_at = NOW()
    WHERE usage_id = v_usage.usage_id;

    -- 9. Insert Volume Reservation Record (status = 'RESERVED', volume_ordinal = NULL)
    INSERT INTO public.atlas_mail_volume_reservations (
        provider_account_scope_id, usage_id, tenant_id, execution_id, attempt_id,
        pricing_config_id, estimated_max_cost_per_1000, status
    ) VALUES (
        v_scope_id, v_usage.usage_id, v_tenant_id, v_exec.execution_id, v_attempt_id,
        v_pricing_cfg.config_id, v_est_max_cost, 'RESERVED'
    );

    -- 10. Insert Correlation Sidecar (Hash-Only)
    v_token_hash := encode(digest(p_raw_correlation_token, 'sha256'), 'hex');
    INSERT INTO public.atlas_mail_execution_correlations (
        tenant_id, execution_id, attempt_id, correlation_token_hash
    ) VALUES (
        v_tenant_id, v_exec.execution_id, v_attempt_id, v_token_hash
    );

    RETURN jsonb_build_object(
        'success', true,
        'execution_id', v_exec.execution_id,
        'attempt_id', v_attempt_id,
        'attempt_no', 1,
        'estimated_max_cost_per_1000', v_est_max_cost,
        'amount_reserved', v_amount_reserved,
        'destination_hash', v_dest_hash
    );
END;
$$;

-- C. Commit Mail Volume Slot (Executed on Provider Acceptance)
CREATE OR REPLACE FUNCTION public.commit_mail_volume_slot_v1(
    p_attempt_id UUID,
    p_provider_message_id TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_res RECORD;
    v_usage RECORD;
    v_final_ordinal BIGINT;
    v_tier RECORD;
    v_exec RECORD;
BEGIN
    SELECT * INTO v_res
    FROM public.atlas_mail_volume_reservations
    WHERE attempt_id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'VOLUME_RESERVATION_NOT_FOUND');
    END IF;

    -- Idempotent check
    IF v_res.status = 'COMMITTED' THEN
        RETURN jsonb_build_object('success', true, 'status', 'ALREADY_COMMITTED', 'volume_ordinal', v_res.volume_ordinal);
    END IF;

    IF v_res.status != 'RESERVED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESERVATION_STATUS', 'status', v_res.status);
    END IF;

    -- Lock Monthly Usage Row
    SELECT * INTO v_usage
    FROM public.atlas_mail_provider_monthly_usage
    WHERE usage_id = v_res.usage_id
    FOR UPDATE;

    -- Assign final ordinal deterministically upon commit
    v_final_ordinal := v_usage.billable_outbound_recipients;

    -- Resolve Exact Matching Tier
    SELECT * INTO v_tier
    FROM public.atlas_mail_provider_pricing_tiers
    WHERE config_id = v_res.pricing_config_id
      AND tier_from_volume <= v_final_ordinal
      AND (tier_to_volume IS NULL OR tier_to_volume > v_final_ordinal);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRICING_TIER_NOT_FOUND for ordinal %', v_final_ordinal;
    END IF;

    -- Update Reservation
    UPDATE public.atlas_mail_volume_reservations
    SET status = 'COMMITTED',
        volume_ordinal = v_final_ordinal,
        pricing_tier_id = v_tier.tier_id,
        actual_cost_per_1000 = v_tier.cost_per_1000,
        settled_at = NOW()
    WHERE volume_reservation_id = v_res.volume_reservation_id;

    -- Atomically adjust monthly counters
    UPDATE public.atlas_mail_provider_monthly_usage
    SET reserved_outbound_recipients = GREATEST(0, reserved_outbound_recipients - 1),
        billable_outbound_recipients = billable_outbound_recipients + 1,
        observed_at = NOW()
    WHERE usage_id = v_usage.usage_id;

    -- Settle 10F execution state using exact tenant from reservation fact
    SELECT * INTO v_exec FROM public.atlas_executions WHERE execution_id = v_res.execution_id;

    UPDATE public.atlas_execution_attempts 
    SET status = 'ACCEPTED', provider_message_id = p_provider_message_id, completed_at = NOW()
    WHERE attempt_id = p_attempt_id;

    UPDATE public.atlas_executions 
    SET status = 'ACCEPTED', updated_at = NOW(), terminal_at = NOW()
    WHERE execution_id = v_res.execution_id;

    IF v_exec.logical_execution_identity IS NOT NULL THEN
        UPDATE public.atlas_execution_budget_reservations 
        SET status = 'COMMITTED', updated_at = NOW() 
        WHERE tenant_id = v_res.tenant_id 
          AND logical_execution_identity = v_exec.logical_execution_identity 
          AND status = 'RESERVED';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'volume_ordinal', v_final_ordinal,
        'tier_id', v_tier.tier_id,
        'actual_cost_per_1000', v_tier.cost_per_1000
    );
END;
$$;

-- D. Release Mail Volume Slot (Executed on Pre-Acceptance Failure)
CREATE OR REPLACE FUNCTION public.release_mail_volume_slot_v1(
    p_attempt_id UUID,
    p_error_details JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_res RECORD;
    v_usage RECORD;
    v_exec RECORD;
BEGIN
    SELECT * INTO v_res
    FROM public.atlas_mail_volume_reservations
    WHERE attempt_id = p_attempt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'VOLUME_RESERVATION_NOT_FOUND');
    END IF;

    IF v_res.status = 'RELEASED' THEN
        RETURN jsonb_build_object('success', true, 'status', 'ALREADY_RELEASED');
    END IF;

    IF v_res.status != 'RESERVED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESERVATION_STATUS', 'status', v_res.status);
    END IF;

    -- Lock Monthly Usage Row
    SELECT * INTO v_usage
    FROM public.atlas_mail_provider_monthly_usage
    WHERE usage_id = v_res.usage_id
    FOR UPDATE;

    -- Release Reservation without consuming ordinal
    UPDATE public.atlas_mail_volume_reservations
    SET status = 'RELEASED',
        settled_at = NOW()
    WHERE volume_reservation_id = v_res.volume_reservation_id;

    -- Atomically adjust monthly counters
    UPDATE public.atlas_mail_provider_monthly_usage
    SET reserved_outbound_recipients = GREATEST(0, reserved_outbound_recipients - 1),
        observed_at = NOW()
    WHERE usage_id = v_usage.usage_id;

    -- Settle 10F execution state using exact tenant from reservation fact
    SELECT * INTO v_exec FROM public.atlas_executions WHERE execution_id = v_res.execution_id;

    UPDATE public.atlas_execution_attempts 
    SET status = 'FAILED_PRE_ACCEPT', error_details = p_error_details, completed_at = NOW()
    WHERE attempt_id = p_attempt_id;

    UPDATE public.atlas_executions 
    SET status = 'FAILED_PRE_ACCEPT', updated_at = NOW(), terminal_at = NOW()
    WHERE execution_id = v_res.execution_id;

    IF v_exec.logical_execution_identity IS NOT NULL THEN
        UPDATE public.atlas_execution_budget_reservations 
        SET status = 'RELEASED', updated_at = NOW() 
        WHERE tenant_id = v_res.tenant_id 
          AND logical_execution_identity = v_exec.logical_execution_identity 
          AND status = 'RESERVED';
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- E. Reconcile Network Timeout via Hash-Only Correlation Token
CREATE OR REPLACE FUNCTION public.reconcile_mail_timeout_via_correlation_v1(
    p_tenant_id UUID,
    p_correlation_token_hash TEXT,
    p_provider_message_id TEXT,
    p_resolution TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_corr RECORD;
    v_exec RECORD;
    v_res JSONB;
BEGIN
    SELECT * INTO v_corr
    FROM public.atlas_mail_execution_correlations
    WHERE tenant_id = p_tenant_id 
      AND correlation_token_hash = p_correlation_token_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CORRELATION_TOKEN_NOT_FOUND');
    END IF;

    SELECT * INTO v_exec
    FROM public.atlas_executions
    WHERE execution_id = v_corr.execution_id;

    IF p_resolution = 'ACCEPTED' THEN
        SELECT public.commit_mail_volume_slot_v1(v_corr.attempt_id, p_provider_message_id) INTO v_res;
        RETURN v_res;
    ELSIF p_resolution = 'FAILED_PRE_ACCEPT' THEN
        SELECT public.release_mail_volume_slot_v1(v_corr.attempt_id, jsonb_build_object('reason', 'RECONCILED_FAILED')) INTO v_res;
        RETURN v_res;
    ELSE
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_RESOLUTION_TYPE');
    END IF;
END;
$$;

-- F. Ingest Minimized Mail Provider Event (Webhook Entrypoint)
CREATE OR REPLACE FUNCTION public.ingest_minimized_mail_provider_event_v1(
    p_tenant_id UUID,
    p_provider_event_id TEXT,
    p_provider_message_id TEXT,
    p_correlation_token_hash TEXT,
    p_event_type TEXT,
    p_event_timestamp TIMESTAMPTZ,
    p_bounce_class TEXT,
    p_bounce_sub_type TEXT,
    p_canonical_payload_hash TEXT,
    p_minimized_metadata JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_exec_id UUID := NULL;
    v_attempt_id UUID := NULL;
    v_dest_hash TEXT := NULL;
    v_corr RECORD;
    v_outcome_id UUID;
    v_proj_res JSONB;
BEGIN
    -- 1. Deduplication Gate
    IF EXISTS (
        SELECT 1 FROM public.atlas_mail_provider_events
        WHERE tenant_id = p_tenant_id AND provider_event_id = p_provider_event_id
    ) THEN
        RETURN jsonb_build_object('success', true, 'status', 'IDEMPOTENT_IGNORED');
    END IF;

    -- 2. Resolve Execution and Attempt
    IF p_correlation_token_hash IS NOT NULL THEN
        SELECT * INTO v_corr
        FROM public.atlas_mail_execution_correlations
        WHERE tenant_id = p_tenant_id AND correlation_token_hash = p_correlation_token_hash;
        
        IF FOUND THEN
            v_exec_id := v_corr.execution_id;
            v_attempt_id := v_corr.attempt_id;
        END IF;
    END IF;

    IF v_exec_id IS NULL AND p_provider_message_id IS NOT NULL THEN
        SELECT execution_id, attempt_id INTO v_exec_id, v_attempt_id
        FROM public.atlas_execution_attempts
        WHERE tenant_id = p_tenant_id AND provider_message_id = p_provider_message_id
        LIMIT 1;
    END IF;

    IF v_exec_id IS NOT NULL THEN
        SELECT destination_hash INTO v_dest_hash
        FROM public.atlas_executions
        WHERE execution_id = v_exec_id;
    END IF;

    -- 3. Ingest Event Record
    INSERT INTO public.atlas_mail_provider_events (
        tenant_id, execution_id, attempt_id, provider_id,
        provider_event_id, provider_message_id, correlation_token_hash,
        event_type, event_timestamp, bounce_class, bounce_sub_type,
        canonical_payload_hash, minimized_metadata
    ) VALUES (
        p_tenant_id, v_exec_id, v_attempt_id, 'AWS_SES',
        p_provider_event_id, p_provider_message_id, p_correlation_token_hash,
        p_event_type, p_event_timestamp, p_bounce_class, p_bounce_sub_type,
        p_canonical_payload_hash, p_minimized_metadata
    );

    -- 4. If SEND / DELIVERY and attempt is RESERVED -> commit volume slot
    IF p_event_type IN ('SEND', 'DELIVERY') AND v_attempt_id IS NOT NULL THEN
        PERFORM public.commit_mail_volume_slot_v1(v_attempt_id, p_provider_message_id);
    END IF;

    -- 5. Deliverability Suppression Cascades
    IF v_dest_hash IS NOT NULL THEN
        IF p_event_type = 'BOUNCE' AND p_bounce_class = 'PERMANENT' THEN
            INSERT INTO public.atlas_outreach_suppressions (
                tenant_id, email_hash, scope, reason, source
            ) VALUES (
                p_tenant_id, v_dest_hash, 'ALL', 'HARD_BOUNCE', 'SES_HARD_BOUNCE_WEBHOOK'
            )
            ON CONFLICT (tenant_id, email_hash, scope) DO NOTHING;
            
        ELSIF p_event_type = 'COMPLAINT' THEN
            INSERT INTO public.atlas_outreach_suppressions (
                tenant_id, email_hash, scope, reason, source
            ) VALUES (
                p_tenant_id, v_dest_hash, 'ALL', 'COMPLAINT', 'SES_COMPLAINT_WEBHOOK'
            )
            ON CONFLICT (tenant_id, email_hash, scope) DO NOTHING;
            
        ELSIF p_event_type = 'SUBSCRIPTION' THEN
            INSERT INTO public.atlas_outreach_suppressions (
                tenant_id, email_hash, scope, reason, source
            ) VALUES (
                p_tenant_id, v_dest_hash, 'MARKETING', 'UNSUBSCRIBED', 'SES_SUBSCRIPTION_WEBHOOK'
            )
            ON CONFLICT (tenant_id, email_hash, scope) DO NOTHING;
        END IF;
    END IF;

    -- 6. Project Delivery Outcomes to 10F/10H Outcome Ledger
    IF v_exec_id IS NOT NULL AND v_attempt_id IS NOT NULL AND p_event_type IN ('DELIVERY', 'BOUNCE', 'COMPLAINT', 'REJECT', 'DELAY') THEN
        v_outcome_id := gen_random_uuid();
        INSERT INTO public.atlas_execution_outcomes (
            outcome_id, tenant_id, execution_id, attempt_id,
            provider_message_id, correlation_tag, event_type,
            event_timestamp, event_payload
        ) VALUES (
            v_outcome_id, p_tenant_id, v_exec_id, v_attempt_id,
            COALESCE(p_provider_message_id, 'UNKNOWN'), COALESCE(p_correlation_token_hash, 'NONE'),
            p_event_type, p_event_timestamp, p_minimized_metadata
        );

        -- Project to 10H-A1
        v_proj_res := public.project_10f_outcome_to_10h(v_outcome_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_provider_event_id,
        'execution_id', v_exec_id,
        'destination_hash', v_dest_hash
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.plan_and_route_email_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.commit_mail_volume_slot_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_mail_volume_slot_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_mail_timeout_via_correlation_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ingest_minimized_mail_provider_event_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_pricing_tier_continuity_v1 TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_provider_account_scopes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_tenant_provider_accounts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_provider_pricing_configs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_provider_pricing_tiers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_provider_monthly_usage TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_volume_reservations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_execution_correlations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_mail_provider_events TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_execution_simulations TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_execution_simulation_attempts TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_omnichannel_routing_state TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_execution_budget_reservations TO authenticated, service_role;

