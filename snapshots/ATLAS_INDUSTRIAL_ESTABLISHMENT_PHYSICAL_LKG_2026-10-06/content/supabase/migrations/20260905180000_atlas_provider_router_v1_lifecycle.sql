-- ==========================================
-- PHASE 9D: PROVIDER ROUTER LIFECYCLE
-- ==========================================

-- 1. Commit Reservation (Provider Accepted)
CREATE OR REPLACE FUNCTION public.commit_delivery_economics(
    p_logical_delivery_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res RECORD;
BEGIN
    SELECT * INTO v_res
    FROM public.atlas_delivery_cost_reservations
    WHERE logical_delivery_id = p_logical_delivery_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'RESERVATION_NOT_FOUND');
    END IF;

    IF v_res.status = 'COMMITTED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already committed');
    END IF;

    IF v_res.status = 'RELEASED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CANNOT_COMMIT_RELEASED_RESERVATION');
    END IF;

    -- Update Reservation
    UPDATE public.atlas_delivery_cost_reservations
    SET status = 'COMMITTED', updated_at = NOW()
    WHERE logical_delivery_id = p_logical_delivery_id;

    -- Update Campaign Budget (Move reserved to committed)
    UPDATE public.atlas_campaign_budgets
    SET daily_reserved = GREATEST(0, daily_reserved - v_res.cost_reserved),
        total_reserved = GREATEST(0, total_reserved - v_res.cost_reserved),
        daily_committed = daily_committed + v_res.cost_reserved,
        total_committed = total_committed + v_res.cost_reserved,
        updated_at = NOW()
    WHERE campaign_id = v_res.campaign_id;

    -- Update Provider Quota (Move reserved to committed)
    UPDATE public.atlas_provider_quotas
    SET daily_reserved = GREATEST(0, daily_reserved - v_res.units_reserved),
        monthly_reserved = GREATEST(0, monthly_reserved - v_res.units_reserved),
        daily_committed = daily_committed + v_res.units_reserved,
        monthly_committed = monthly_committed + v_res.units_reserved
    WHERE provider_id = v_res.provider_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Release Reservation (Definitive Pre-Accept Failure)
CREATE OR REPLACE FUNCTION public.release_delivery_economics(
    p_logical_delivery_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_res RECORD;
BEGIN
    SELECT * INTO v_res
    FROM public.atlas_delivery_cost_reservations
    WHERE logical_delivery_id = p_logical_delivery_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'RESERVATION_NOT_FOUND');
    END IF;

    IF v_res.status = 'RELEASED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Already released');
    END IF;

    -- ONLY allow release if NOT committed (cannot release a committed charge without refunds)
    IF v_res.status = 'COMMITTED' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CANNOT_RELEASE_COMMITTED_RESERVATION');
    END IF;

    -- Update Reservation
    UPDATE public.atlas_delivery_cost_reservations
    SET status = 'RELEASED', updated_at = NOW()
    WHERE logical_delivery_id = p_logical_delivery_id;

    -- Refund Campaign Budget (Remove from reserved)
    UPDATE public.atlas_campaign_budgets
    SET daily_reserved = GREATEST(0, daily_reserved - v_res.cost_reserved),
        total_reserved = GREATEST(0, total_reserved - v_res.cost_reserved),
        updated_at = NOW()
    WHERE campaign_id = v_res.campaign_id;

    -- Refund Provider Quota (Remove from reserved)
    UPDATE public.atlas_provider_quotas
    SET daily_reserved = GREATEST(0, daily_reserved - v_res.units_reserved),
        monthly_reserved = GREATEST(0, monthly_reserved - v_res.units_reserved)
    WHERE provider_id = v_res.provider_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
