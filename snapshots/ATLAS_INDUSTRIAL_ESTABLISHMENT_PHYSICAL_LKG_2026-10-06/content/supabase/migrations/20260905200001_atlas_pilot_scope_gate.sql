-- MIGRATION: ATLAS PILOT SCOPE GATES (9E-B2)
-- 20260905200001_atlas_pilot_scope_gate.sql

-- 1. Helper to check if a delivery is authorized under the active pilot
CREATE OR REPLACE FUNCTION public.check_pilot_scope(p_logical_delivery_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config RECORD;
    v_is_pilot BOOLEAN;
BEGIN
    SELECT * INTO v_config FROM public.atlas_outreach_config WHERE id = 1;
    IF v_config.active_pilot_run_id IS NULL THEN
        RETURN TRUE; -- No active pilot, scope is open
    END IF;

    -- If a pilot is active, this delivery MUST be registered to it
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_pilot_run_deliveries 
        WHERE pilot_run_id = v_config.active_pilot_run_id 
          AND logical_delivery_id = p_logical_delivery_id
    ) INTO v_is_pilot;

    RETURN v_is_pilot;
END;
$$;

-- 2. Patch reserve_delivery_economics to enforce PILOT scope
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
    -- [NEW] Pilot Scope Check
    IF NOT public.check_pilot_scope(p_logical_delivery_id) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'PILOT_SCOPE_MISMATCH');
    END IF;

    -- 1. Idempotency Check
    SELECT * INTO v_existing_reservation
    FROM public.atlas_delivery_cost_reservations
    WHERE logical_delivery_id = p_logical_delivery_id;
    
    IF FOUND THEN
        IF v_existing_reservation.provider_id = p_provider_id AND v_existing_reservation.status = 'RESERVED' THEN
            RETURN jsonb_build_object('success', true, 'message', 'Idempotent reservation maintained');
        ELSE
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
