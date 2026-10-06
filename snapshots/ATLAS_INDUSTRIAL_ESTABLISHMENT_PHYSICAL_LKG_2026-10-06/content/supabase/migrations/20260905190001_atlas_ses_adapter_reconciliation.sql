-- ==========================================
-- PHASE 9E: SES ADAPTER V1 - AMBIGUOUS RECONCILIATION
-- ==========================================

-- Atomic RPC: Reconcile Ambiguous Delivery
CREATE OR REPLACE FUNCTION public.reconcile_ambiguous_delivery(
    p_logical_delivery_id UUID,
    p_attempt_id UUID,
    p_provider_message_id TEXT,
    p_is_accepted BOOLEAN,
    p_error_details JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt RECORD;
    v_res JSONB;
BEGIN
    SELECT * INTO v_attempt FROM public.atlas_delivery_attempts
    WHERE attempt_id = p_attempt_id AND logical_delivery_id = p_logical_delivery_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_FOUND');
    END IF;

    IF v_attempt.status != 'AMBIGUOUS' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'NOT_AMBIGUOUS');
    END IF;

    IF p_is_accepted THEN
        UPDATE public.atlas_delivery_attempts
        SET status = 'ACCEPTED', provider_message_id = p_provider_message_id, updated_at = NOW()
        WHERE attempt_id = p_attempt_id;

        -- Atomically commit economics
        v_res := public.commit_delivery_economics(p_logical_delivery_id);
    ELSE
        UPDATE public.atlas_delivery_attempts
        SET status = 'FAILED_PRE_ACCEPT', error_details = p_error_details, updated_at = NOW()
        WHERE attempt_id = p_attempt_id;

        -- Atomically release economics
        v_res := public.release_delivery_economics(p_logical_delivery_id);
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;
