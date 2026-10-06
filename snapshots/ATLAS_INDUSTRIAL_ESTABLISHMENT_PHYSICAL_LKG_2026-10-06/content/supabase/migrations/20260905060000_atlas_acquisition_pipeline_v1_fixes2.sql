-- MIGRATION: ATLAS ACQUISITION PIPELINE V1 FIXES
-- 20260905040000_atlas_acquisition_pipeline_v1_fixes.sql

-- 1. Atomic Enqueue Function with strict binding and logical idempotency
CREATE OR REPLACE FUNCTION public.enqueue_approved_acquisition_message(
    p_run_id UUID,
    p_campaign_id UUID,
    p_canonical_contact_id UUID,
    p_generation_id UUID,
    p_outreach_step TEXT DEFAULT 'INITIAL_CONTACT'
)
RETURNS TABLE (
    success BOOLEAN,
    reason TEXT,
    job_id UUID
) AS $$
DECLARE
    v_contact_status TEXT;
    v_email_hash TEXT;
    v_is_suppressed BOOLEAN;
    v_compliance_status TEXT;
    v_compliance_expires_at TIMESTAMPTZ;
    v_compliance_eval_id UUID;
    v_campaign_enabled BOOLEAN;
    
    v_generation_status TEXT;
    v_gen_contact_id UUID;
    v_gen_campaign_id UUID;
    
    v_unsupported_claims INT;
    v_evidence_count INT;
    v_idempotency_key TEXT;
    v_existing_job UUID;
    v_new_job_id UUID;
BEGIN
    -- 1. Lock and Check Contact
    SELECT status, email_hash INTO v_contact_status, v_email_hash
    FROM public.atlas_contacts
    WHERE contact_id = p_canonical_contact_id
    FOR UPDATE; -- Lock to prevent concurrent changes

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'CONTACT_NOT_FOUND', NULL::UUID;
        RETURN;
    END IF;

    IF v_contact_status = 'SUPPRESSED' THEN
        RETURN QUERY SELECT false, 'CONTACT_SUPPRESSED', NULL::UUID;
        RETURN;
    END IF;

    -- 2. Check Suppression Table
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_outreach_suppressions
        WHERE email_hash = v_email_hash
    ) INTO v_is_suppressed;

    IF v_is_suppressed THEN
        RETURN QUERY SELECT false, 'SUPPRESSION_EXISTS', NULL::UUID;
        RETURN;
    END IF;

    -- 3. Check Compliance Freshness and Decision
    SELECT decision, expires_at, evaluation_id 
    INTO v_compliance_status, v_compliance_expires_at, v_compliance_eval_id
    FROM public.atlas_outreach_compliance
    WHERE contact_id = p_canonical_contact_id AND campaign_id = p_campaign_id
    ORDER BY evaluated_at DESC
    LIMIT 1;

    IF v_compliance_status IS NULL OR v_compliance_status != 'ALLOWED' THEN
        RETURN QUERY SELECT false, 'COMPLIANCE_NOT_ALLOWED', NULL::UUID;
        RETURN;
    END IF;

    IF v_compliance_expires_at IS NOT NULL AND v_compliance_expires_at <= NOW() THEN
        RETURN QUERY SELECT false, 'COMPLIANCE_EXPIRED', NULL::UUID;
        RETURN;
    END IF;

    -- 4. Check Campaign Enabled
    SELECT campaign_enabled INTO v_campaign_enabled
    FROM public.atlas_outreach_campaigns
    WHERE campaign_id = p_campaign_id;

    IF v_campaign_enabled IS NULL OR v_campaign_enabled = false THEN
        RETURN QUERY SELECT false, 'CAMPAIGN_DISABLED', NULL::UUID;
        RETURN;
    END IF;

    -- 5. Check Generation Approved & Binding
    SELECT status, contact_id, campaign_id 
    INTO v_generation_status, v_gen_contact_id, v_gen_campaign_id
    FROM public.atlas_message_generations
    WHERE generation_id = p_generation_id;

    IF v_generation_status IS NULL OR v_generation_status != 'APPROVED' THEN
        RETURN QUERY SELECT false, 'GENERATION_NOT_APPROVED', NULL::UUID;
        RETURN;
    END IF;

    IF v_gen_contact_id != p_canonical_contact_id THEN
        RETURN QUERY SELECT false, 'GENERATION_CONTACT_MISMATCH', NULL::UUID;
        RETURN;
    END IF;

    IF v_gen_campaign_id != p_campaign_id THEN
        RETURN QUERY SELECT false, 'GENERATION_CAMPAIGN_MISMATCH', NULL::UUID;
        RETURN;
    END IF;

    -- 6. Check Unsupported Claims
    SELECT COUNT(*) INTO v_unsupported_claims
    FROM public.atlas_message_claims
    WHERE generation_id = p_generation_id AND validation_status = 'UNSUPPORTED';

    IF v_unsupported_claims > 0 THEN
        RETURN QUERY SELECT false, 'UNSUPPORTED_CLAIMS_EXIST', NULL::UUID;
        RETURN;
    END IF;

    -- 7. Check Evidence Requirements (must have at least 1 high confidence evidence)
    SELECT COUNT(*) INTO v_evidence_count
    FROM public.atlas_contact_evidence
    WHERE contact_id = p_canonical_contact_id;

    IF v_evidence_count = 0 THEN
        RETURN QUERY SELECT false, 'NO_EVIDENCE', NULL::UUID;
        RETURN;
    END IF;

    -- 8. Logical Action Idempotency Check
    v_idempotency_key := encode(digest(p_campaign_id::text || ':' || p_canonical_contact_id::text || ':' || p_outreach_step, 'sha256'), 'hex');

    SELECT public.atlas_outreach_queue.job_id INTO v_existing_job
    FROM public.atlas_outreach_queue
    WHERE idempotency_key = v_idempotency_key;

    IF FOUND THEN
        RETURN QUERY SELECT false, 'IDEMPOTENCY_CONFLICT', v_existing_job;
        RETURN;
    END IF;

    -- 9. Insert into Queue
    INSERT INTO public.atlas_outreach_queue (
        campaign_id,
        contact_id,
        status,
        idempotency_key,
        compliance_evaluation_id
    ) VALUES (
        p_campaign_id,
        p_canonical_contact_id,
        'PENDING',
        v_idempotency_key,
        v_compliance_eval_id
    ) RETURNING public.atlas_outreach_queue.job_id INTO v_new_job_id;

    -- Return success
    RETURN QUERY SELECT true, 'ENQUEUED', v_new_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
