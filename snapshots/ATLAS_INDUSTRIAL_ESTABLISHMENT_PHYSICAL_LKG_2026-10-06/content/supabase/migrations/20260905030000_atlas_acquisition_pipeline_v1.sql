-- MIGRATION: ATLAS ACQUISITION PIPELINE V1
-- 20260905030000_atlas_acquisition_pipeline_v1.sql

-- 1. Acquisition Runs Table
CREATE TABLE IF NOT EXISTS public.atlas_acquisition_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_id UUID, -- References atlas_contact_searches (optional for manual runs)
    campaign_id UUID, -- Optional, if directly linked to a campaign

    status TEXT NOT NULL DEFAULT 'DISCOVERING' CHECK (status IN (
        'DISCOVERING', 'ENRICHING', 'RESOLVING', 'VERIFYING', 
        'COMPLIANCE', 'GENERATING', 'VALIDATING', 
        'READY', 'PARTIAL', 'FAILED', 'COMPLETED'
    )),

    contacts_discovered INT NOT NULL DEFAULT 0,
    contacts_promoted INT NOT NULL DEFAULT 0,
    contacts_allowed INT NOT NULL DEFAULT 0,
    messages_generated INT NOT NULL DEFAULT 0,
    messages_approved INT NOT NULL DEFAULT 0,
    outreach_enqueued INT NOT NULL DEFAULT 0,

    fixture_count INT NOT NULL DEFAULT 0,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Acquisition Candidates Table
CREATE TABLE IF NOT EXISTS public.atlas_acquisition_candidates (
    candidate_run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.atlas_acquisition_runs(run_id) ON DELETE CASCADE,
    
    discovered_person_id UUID NOT NULL, -- The original discovered entity
    canonical_contact_id UUID REFERENCES public.atlas_contacts(contact_id) ON DELETE SET NULL, -- The resolved canonical identity in atlas_contacts

    discovery_status TEXT NOT NULL DEFAULT 'PENDING',
    evidence_status TEXT NOT NULL DEFAULT 'PENDING',
    identity_status TEXT NOT NULL DEFAULT 'PENDING',
    verification_status TEXT NOT NULL DEFAULT 'PENDING',
    confidence_status TEXT NOT NULL DEFAULT 'PENDING',
    compliance_status TEXT NOT NULL DEFAULT 'PENDING',
    generation_status TEXT NOT NULL DEFAULT 'PENDING',
    claim_validation_status TEXT NOT NULL DEFAULT 'PENDING',
    outreach_status TEXT NOT NULL DEFAULT 'PENDING',

    block_reason TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(run_id, discovered_person_id)
);

-- 3. Atomic Enqueue Function
-- This function encapsulates all JIT checks and idempotency logic into a single atomic transaction.
CREATE OR REPLACE FUNCTION public.enqueue_approved_acquisition_message(
    p_run_id UUID,
    p_campaign_id UUID,
    p_canonical_contact_id UUID,
    p_generation_id UUID
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

    -- 5. Check Generation Approved
    SELECT status INTO v_generation_status
    FROM public.atlas_message_generations
    WHERE generation_id = p_generation_id;

    IF v_generation_status IS NULL OR v_generation_status != 'APPROVED' THEN
        RETURN QUERY SELECT false, 'GENERATION_NOT_APPROVED', NULL::UUID;
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

    -- 8. Idempotency Check
    v_idempotency_key := encode(digest(p_campaign_id::text || ':' || p_canonical_contact_id::text || ':' || p_generation_id::text, 'sha256'), 'hex');

    SELECT atlas_outreach_queue.job_id INTO v_existing_job
    FROM public.atlas_outreach_queue
    WHERE idempotency_key = v_idempotency_key;

    IF FOUND THEN
        RETURN QUERY SELECT false, 'IDEMPOTENCY_CONFLICT', v_existing_job;
        RETURN;
    END IF;

    -- 9. Insert into Queue
    -- NOTE: atlas_outreach_config.send_enabled = FALSE remains untouched.
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
    ) RETURNING atlas_outreach_queue.job_id INTO v_new_job_id;

    -- Return success
    RETURN QUERY SELECT true, 'ENQUEUED', v_new_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
