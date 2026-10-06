-- ==========================================
-- PHASE 9D: ATLAS COST OPTIMIZATION / PROVIDER ROUTER V1
-- ==========================================

-- 1. Providers
CREATE TABLE IF NOT EXISTS public.atlas_delivery_providers (
    provider_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_key TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    adapter_key TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    routing_priority INTEGER NOT NULL DEFAULT 100, -- Tie-breaker
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Provider Pricing (Versioned)
CREATE TABLE IF NOT EXISTS public.atlas_provider_pricing (
    pricing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.atlas_delivery_providers(provider_id) ON DELETE CASCADE,
    pricing_version TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    pricing_model TEXT NOT NULL CHECK (pricing_model IN ('PAY_AS_YOU_GO', 'MONTHLY_INCLUDED', 'TIERED', 'CUSTOM')),
    
    fixed_monthly_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    included_messages INTEGER NOT NULL DEFAULT 0,
    cost_per_1000 NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    overage_cost_per_1000 NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    
    currency TEXT NOT NULL CHECK (currency = 'USD'), -- Hardcoded to USD for V1 comparability
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (provider_id, pricing_version)
);

-- 3. Provider Capabilities / Policies
CREATE TABLE IF NOT EXISTS public.atlas_provider_capabilities (
    capability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.atlas_delivery_providers(provider_id) ON DELETE CASCADE,
    policy_version TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    allowed_message_types TEXT[] NOT NULL DEFAULT '{}',
    allowed_audience_basis TEXT[] NOT NULL DEFAULT '{}',
    allowed_regions TEXT[] NOT NULL DEFAULT '{}',
    
    supports_transactional BOOLEAN NOT NULL DEFAULT true,
    supports_marketing BOOLEAN NOT NULL DEFAULT false,
    supports_bulk BOOLEAN NOT NULL DEFAULT false,
    
    max_message_size INTEGER NOT NULL DEFAULT 10485760, -- 10MB
    supports_attachments BOOLEAN NOT NULL DEFAULT true,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (provider_id, policy_version)
);

-- 4. Provider Health
CREATE TABLE IF NOT EXISTS public.atlas_provider_health (
    provider_id UUID PRIMARY KEY REFERENCES public.atlas_delivery_providers(provider_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'PAUSED')),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- 5. Provider Quotas
CREATE TABLE IF NOT EXISTS public.atlas_provider_quotas (
    provider_id UUID PRIMARY KEY REFERENCES public.atlas_delivery_providers(provider_id) ON DELETE CASCADE,
    
    daily_limit INTEGER NOT NULL DEFAULT 0,
    daily_committed INTEGER NOT NULL DEFAULT 0,
    daily_reserved INTEGER NOT NULL DEFAULT 0,
    
    monthly_limit INTEGER NOT NULL DEFAULT 0,
    monthly_committed INTEGER NOT NULL DEFAULT 0,
    monthly_reserved INTEGER NOT NULL DEFAULT 0,
    
    rate_limit_per_second INTEGER NOT NULL DEFAULT 1,
    
    quota_version TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Campaign Budgets (Required for atomic reservation check)
CREATE TABLE IF NOT EXISTS public.atlas_campaign_budgets (
    campaign_id UUID PRIMARY KEY, -- Assuming references public.atlas_campaigns(campaign_id) in real DB
    daily_budget NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    daily_committed NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    daily_reserved NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    
    total_budget NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    total_committed NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    total_reserved NUMERIC(12,4) NOT NULL DEFAULT 0.0,
    
    currency TEXT NOT NULL DEFAULT 'USD',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Cost Reservations (Idempotent locks)
CREATE TABLE IF NOT EXISTS public.atlas_delivery_cost_reservations (
    logical_delivery_id UUID PRIMARY KEY, -- Logical ID of the delivery attempt
    campaign_id UUID NOT NULL REFERENCES public.atlas_campaign_budgets(campaign_id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.atlas_delivery_providers(provider_id) ON DELETE CASCADE,
    
    units_reserved INTEGER NOT NULL,
    cost_reserved NUMERIC(12,4) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    
    status TEXT NOT NULL CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED')),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Routing Decisions
CREATE TABLE IF NOT EXISTS public.atlas_provider_routing_decisions (
    routing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    generation_id UUID NOT NULL, -- references public.atlas_message_generations(generation_id)
    campaign_id UUID NOT NULL,
    logical_delivery_id UUID NOT NULL UNIQUE REFERENCES public.atlas_delivery_cost_reservations(logical_delivery_id),
    
    selected_provider_id UUID,
    
    estimated_incremental_cost NUMERIC(12,4),
    currency TEXT NOT NULL DEFAULT 'USD',
    
    -- Audit Provenance Snapshots
    pricing_version TEXT,
    capability_policy_version TEXT,
    health_snapshot_at TIMESTAMPTZ,
    quota_version TEXT,
    routing_policy_version TEXT NOT NULL,
    routing_hash TEXT NOT NULL,
    
    eligible_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
    rejected_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
    rejection_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
    cost_comparison JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    routing_reason TEXT NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Index for expiration queries
CREATE INDEX idx_routing_decisions_expires ON public.atlas_provider_routing_decisions(expires_at);
CREATE INDEX idx_routing_decisions_generation ON public.atlas_provider_routing_decisions(generation_id);

-- ==========================================
-- 9. ATOMIC RESERVATION RPC
-- ==========================================
CREATE OR REPLACE FUNCTION public.reserve_delivery_economics(
    p_logical_delivery_id UUID,
    p_campaign_id UUID,
    p_provider_id UUID,
    p_units INTEGER,
    p_incremental_cost NUMERIC(12,4)
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_campaign_budget RECORD;
    v_provider_quota RECORD;
    v_existing_reservation RECORD;
BEGIN
    -- 1. Idempotency Check: Return success immediately if already reserved for the same provider
    SELECT * INTO v_existing_reservation
    FROM public.atlas_delivery_cost_reservations
    WHERE logical_delivery_id = p_logical_delivery_id;
    
    IF FOUND THEN
        IF v_existing_reservation.provider_id = p_provider_id AND v_existing_reservation.status = 'RESERVED' THEN
            -- Already correctly reserved for this logical delivery
            RETURN jsonb_build_object('success', true, 'message', 'Idempotent reservation maintained');
        ELSE
            -- Cannot double-reserve a logical delivery or change provider without releasing first
            RETURN jsonb_build_object('success', false, 'reason', 'LOGICAL_DELIVERY_ALREADY_RESERVED_DIFFERENTLY');
        END IF;
    END IF;

    -- 2. Lock Campaign Budget
    SELECT * INTO v_campaign_budget
    FROM public.atlas_campaign_budgets
    WHERE campaign_id = p_campaign_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CAMPAIGN_BUDGET_NOT_FOUND');
    END IF;

    -- 3. Check Campaign Budget Limits
    IF v_campaign_budget.daily_committed + v_campaign_budget.daily_reserved + p_incremental_cost > v_campaign_budget.daily_budget THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INSUFFICIENT_DAILY_CAMPAIGN_BUDGET');
    END IF;

    IF v_campaign_budget.total_committed + v_campaign_budget.total_reserved + p_incremental_cost > v_campaign_budget.total_budget THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INSUFFICIENT_TOTAL_CAMPAIGN_BUDGET');
    END IF;

    -- 4. Lock Provider Quotas
    SELECT * INTO v_provider_quota
    FROM public.atlas_provider_quotas
    WHERE provider_id = p_provider_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PROVIDER_QUOTA_NOT_FOUND');
    END IF;
    
    -- 5. Check Provider Quota Limits
    IF v_provider_quota.daily_limit > 0 AND (v_provider_quota.daily_committed + v_provider_quota.daily_reserved + p_units > v_provider_quota.daily_limit) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INSUFFICIENT_DAILY_PROVIDER_CAPACITY');
    END IF;

    IF v_provider_quota.monthly_limit > 0 AND (v_provider_quota.monthly_committed + v_provider_quota.monthly_reserved + p_units > v_provider_quota.monthly_limit) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INSUFFICIENT_MONTHLY_PROVIDER_CAPACITY');
    END IF;

    -- 6. Execute Reservations (Money + Units)
    UPDATE public.atlas_campaign_budgets
    SET daily_reserved = daily_reserved + p_incremental_cost,
        total_reserved = total_reserved + p_incremental_cost,
        updated_at = NOW()
    WHERE campaign_id = p_campaign_id;

    UPDATE public.atlas_provider_quotas
    SET daily_reserved = daily_reserved + p_units,
        monthly_reserved = monthly_reserved + p_units
    WHERE provider_id = p_provider_id;

    -- 7. Persist Reservation Record
    INSERT INTO public.atlas_delivery_cost_reservations (
        logical_delivery_id,
        campaign_id,
        provider_id,
        units_reserved,
        cost_reserved,
        currency,
        status
    ) VALUES (
        p_logical_delivery_id,
        p_campaign_id,
        p_provider_id,
        p_units,
        p_incremental_cost,
        'USD',
        'RESERVED'
    );

    RETURN jsonb_build_object('success', true);
END;
$$;
