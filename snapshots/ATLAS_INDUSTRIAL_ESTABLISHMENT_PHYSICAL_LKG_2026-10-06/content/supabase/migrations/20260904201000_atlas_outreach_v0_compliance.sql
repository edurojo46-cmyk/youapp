-- MIGRATION: ATLAS OUTREACH V0 COMPLIANCE GATE
-- 20260904201000_atlas_outreach_v0_compliance.sql

-- ==========================================
-- 1. Helper: Check Suppression
-- ==========================================
CREATE OR REPLACE FUNCTION public.check_outreach_suppression(
    p_email_hash TEXT,
    p_campaign_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_suppressed BOOLEAN;
BEGIN
    -- Check ALL or MARKETING or CAMPAIGN
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_outreach_suppressions
        WHERE email_hash = p_email_hash
        AND (
            scope IN ('ALL', 'MARKETING')
            -- Future enhancement: CAMPAIGN specific suppression checking
        )
    ) INTO v_is_suppressed;

    RETURN v_is_suppressed;
END;
$$;


-- ==========================================
-- 2. Core Compliance Engine
-- ==========================================
-- This function MUST return an evaluation_id if a valid contact was evaluated.
-- It applies the strict FAIL-CLOSED rules requested.
CREATE OR REPLACE FUNCTION public.evaluate_outreach_contact(
    p_contact_id UUID,
    p_campaign_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_contact RECORD;
    v_campaign RECORD;
    v_policy RECORD;
    v_is_suppressed BOOLEAN;
    
    v_decision TEXT;
    v_reason_codes JSONB := '[]'::jsonb;
    v_evaluation_id UUID;
BEGIN
    -- 1. Load Contact
    SELECT * INTO v_contact FROM public.atlas_contacts WHERE contact_id = p_contact_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contact % not found', p_contact_id;
    END IF;

    -- 2. Load Campaign
    SELECT * INTO v_campaign FROM public.atlas_outreach_campaigns WHERE campaign_id = p_campaign_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign % not found', p_campaign_id;
    END IF;

    <<eval_block>>
    BEGIN
        -- FAIL CLOSED RULE 1: Country unknown
        IF v_contact.country_code IS NULL OR v_contact.country_code = '' THEN
            v_decision := 'BLOCKED';
            v_reason_codes := v_reason_codes || '["MISSING_COUNTRY_CODE"]'::jsonb;
            EXIT eval_block;
        END IF;
    
        -- FAIL CLOSED RULE 2: Recipient Type unknown
        IF v_contact.recipient_type = 'UNKNOWN' THEN
            v_decision := 'BLOCKED';
            v_reason_codes := v_reason_codes || '["UNKNOWN_RECIPIENT_TYPE"]'::jsonb;
            EXIT eval_block;
        END IF;

        -- FAIL CLOSED RULE 3: Suppression Check
        v_is_suppressed := public.check_outreach_suppression(v_contact.email_hash, p_campaign_id);
        IF v_is_suppressed THEN
            v_decision := 'BLOCKED';
            v_reason_codes := v_reason_codes || '["SUPPRESSED"]'::jsonb;
            EXIT eval_block;
        END IF;

    -- 3. Load Active Policy
    SELECT * INTO v_policy 
    FROM public.atlas_outreach_policies
    WHERE country_code = v_contact.country_code
      AND recipient_type = v_contact.recipient_type
      AND message_type = v_campaign.message_type
      AND status = 'ACTIVE'
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY created_at DESC LIMIT 1;
    
        -- FAIL CLOSED RULE 4: No active valid policy found
        IF NOT FOUND THEN
            v_decision := 'BLOCKED';
            v_reason_codes := v_reason_codes || '["NO_ACTIVE_POLICY"]'::jsonb;
            EXIT eval_block;
        END IF;

    -- 4. Evaluate specific policy rules (simulated for V0)
    -- In a real scenario, we parse v_policy.rules. 
    -- e.g., if rules->>'consent_required' = 'true', we'd check if we have explicit consent.
    -- For V0 SHADOW MODE, we mock the decision logic via simple JSON rules if present.
        IF v_policy.rules ? 'requires_consent' AND (v_policy.rules->>'requires_consent')::BOOLEAN = TRUE THEN
            v_decision := 'CONSENT_REQUIRED';
            v_reason_codes := v_reason_codes || '["MISSING_CONSENT"]'::jsonb;
            EXIT eval_block;
        END IF;
        
        IF v_policy.rules ? 'requires_review' AND (v_policy.rules->>'requires_review')::BOOLEAN = TRUE THEN
            v_decision := 'REVIEW_REQUIRED';
            v_reason_codes := v_reason_codes || '["MANUAL_REVIEW_MANDATED"]'::jsonb;
            EXIT eval_block;
        END IF;

        -- If all passed, ALLOWED
        v_decision := 'ALLOWED';
        v_reason_codes := v_reason_codes || '["COMPLIANCE_CHECKS_PASSED"]'::jsonb;

    END eval_block;
    
    -- 5. Create immutable compliance record
    INSERT INTO public.atlas_outreach_compliance (
        contact_id,
        campaign_id,
        jurisdiction,
        recipient_type,
        message_type,
        policy_version,
        decision,
        reason_codes,
        legal_basis,
        expires_at
    ) VALUES (
        p_contact_id,
        p_campaign_id,
        v_contact.country_code,
        v_contact.recipient_type,
        v_campaign.message_type,
        v_policy.policy_version, -- Might be NULL if no policy found, which is fine for BLOCKED
        v_decision,
        v_reason_codes,
        v_policy.rules->>'legal_basis',
        NOW() + INTERVAL '30 days' -- Evaluations expire to force re-check
    ) RETURNING evaluation_id INTO v_evaluation_id;

    RETURN v_evaluation_id;
END;
$$;
