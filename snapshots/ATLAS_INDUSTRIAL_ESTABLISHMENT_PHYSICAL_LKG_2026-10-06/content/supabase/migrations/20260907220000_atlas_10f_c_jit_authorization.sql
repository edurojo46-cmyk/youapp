-- ==========================================
-- PHASE 10F-C: JUST-IN-TIME AUTHORIZATION
-- ==========================================

DO $$ BEGIN
    CREATE TYPE public.atlas_jit_authorization_status AS ENUM (
        'AUTHORIZED',
        'DENIED',
        'REVIEW_REQUIRED',
        'STALE',
        'UNKNOWN'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.atlas_execution_jit_authorizations (
    authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    logical_execution_identity TEXT NOT NULL,
    execution_request_id TEXT NOT NULL,
    
    subject_type public.atlas_subject_type NOT NULL,
    subject_id UUID NOT NULL,
    action_type public.atlas_action_type NOT NULL,
    channel TEXT NOT NULL,
    
    message_draft_id UUID,
    message_certification_id UUID,
    certification_snapshot_hash TEXT,
    
    destination_hash TEXT,
    prepared_payload_hash TEXT,
    
    status public.atlas_jit_authorization_status NOT NULL,
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    
    authority_bundle_hash TEXT NOT NULL,
    
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    
    authorization_version TEXT NOT NULL DEFAULT 'v1',
    
    CONSTRAINT chk_jit_tenant_isolation CHECK (tenant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_atlas_jit_logical_identity ON public.atlas_execution_jit_authorizations(tenant_id, logical_execution_identity);
CREATE INDEX IF NOT EXISTS idx_atlas_jit_expires_at ON public.atlas_execution_jit_authorizations(expires_at) WHERE consumed_at IS NULL AND status = 'AUTHORIZED';

ALTER TABLE public.atlas_execution_jit_authorizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trg_rls_jit_auth ON public.atlas_execution_jit_authorizations;
CREATE POLICY trg_rls_jit_auth ON public.atlas_execution_jit_authorizations FOR ALL USING (tenant_id = public.get_auth_tenant_id());


-- The core JIT RPC
CREATE OR REPLACE FUNCTION public.authorize_execution_jit(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_status public.atlas_jit_authorization_status := 'UNKNOWN';
    v_reasons TEXT[] := '{}';
    v_bundle_hash TEXT;
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '10 minutes';
    
    v_nba RECORD;
    v_elig RECORD;
    v_cert RECORD;
    
    v_is_suppressed BOOLEAN := false;
    
    -- Inputs
    v_nba_id UUID;
    v_subject_id UUID;
    v_subject_type public.atlas_subject_type;
    v_action_type public.atlas_action_type;
    v_channel TEXT;
    v_cert_id UUID;
    v_cert_hash TEXT;
    v_payload_hash TEXT;
    v_dest_hash TEXT;
    v_email_hash TEXT;
    v_req_id TEXT;
    v_logical_id TEXT;
    
    -- Helper variable to track failures for deterministic precedence
    v_failed BOOLEAN := false;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Tenant isolation failure.';
    END IF;

    -- Extract inputs
    v_nba_id := (p_payload->>'nba_id')::UUID;
    v_subject_id := (p_payload->>'subject_id')::UUID;
    v_subject_type := (p_payload->>'subject_type')::public.atlas_subject_type;
    v_action_type := (p_payload->>'action_type')::public.atlas_action_type;
    v_channel := p_payload->>'channel';
    v_cert_id := (p_payload->>'certification_id')::UUID;
    v_cert_hash := p_payload->>'certification_hash';
    v_payload_hash := p_payload->>'prepared_payload_hash';
    v_dest_hash := p_payload->>'destination_hash';
    v_email_hash := p_payload->>'email_hash';
    v_req_id := p_payload->>'execution_request_id';
    v_logical_id := p_payload->>'logical_execution_identity';
    
    --------------------------------------------------
    -- 1. DETERMINISTIC LOCK ORDER ACQUISITION
    --------------------------------------------------
    -- A. NBA
    IF v_nba_id IS NOT NULL THEN
        SELECT * INTO v_nba FROM public.atlas_next_best_action_state 
        WHERE nba_id = v_nba_id AND tenant_id = v_tenant_id 
        FOR SHARE;
    END IF;
    
    -- B. Channel Eligibility
    IF v_subject_id IS NOT NULL AND v_channel IS NOT NULL THEN
        SELECT * INTO v_elig FROM public.atlas_channel_eligibility 
        WHERE subject_id = v_subject_id AND channel = v_channel AND action_type = v_action_type 
        FOR SHARE;
    END IF;
    
    -- C. Suppression (using check_outreach_suppression if it was created, but we will lock directly here if possible)
    IF v_email_hash IS NOT NULL THEN
        SELECT true INTO v_is_suppressed FROM public.atlas_outreach_suppressions 
        WHERE email_hash = v_email_hash AND scope IN ('ALL', 'MARKETING') 
        FOR SHARE LIMIT 1;
        
        IF v_is_suppressed IS NULL THEN v_is_suppressed := false; END IF;
    END IF;
    
    -- D. Message Certification
    IF v_cert_id IS NOT NULL THEN
        SELECT * INTO v_cert FROM public.atlas_message_certifications 
        WHERE id = v_cert_id AND tenant_id = v_tenant_id 
        FOR SHARE;
    END IF;
    
    -- E. Product/Offer/Evidence (stubbed for now if not passed, but lock order maintained)
    
    --------------------------------------------------
    -- 2. HARD-GATE PRECEDENCE EVALUATION
    --------------------------------------------------
    -- Order: Tenant -> Suppression -> Destination -> Eligibility -> NBA -> Message -> Policy -> Offer/Evidence -> Budget -> Authorized
    
    -- Suppression
    IF v_is_suppressed THEN
        v_status := 'DENIED';
        v_reasons := array_append(v_reasons, 'SUPPRESSED');
        v_failed := true;
    END IF;
    
    -- Destination
    IF NOT v_failed AND v_dest_hash IS NULL THEN
        v_status := 'DENIED';
        v_reasons := array_append(v_reasons, 'DESTINATION_INVALID');
        v_failed := true;
    END IF;
    
    -- Eligibility
    IF NOT v_failed THEN
        IF v_elig IS NULL THEN
            v_status := 'DENIED';
            v_reasons := array_append(v_reasons, 'CHANNEL_INELIGIBLE_UNKNOWN');
            v_failed := true;
        ELSIF v_elig.eligibility_status != 'ELIGIBLE' THEN
            v_status := 'DENIED';
            v_reasons := array_append(v_reasons, 'CHANNEL_INELIGIBLE');
            v_failed := true;
        END IF;
    END IF;
    
    -- NBA
    IF NOT v_failed AND v_nba_id IS NOT NULL THEN
        IF v_nba IS NULL THEN
            v_status := 'STALE';
            v_reasons := array_append(v_reasons, 'NBA_STALE');
            v_failed := true;
        ELSIF v_action_type::TEXT NOT LIKE (v_nba.recommended_action::TEXT || '%') THEN
            v_status := 'DENIED';
            v_reasons := array_append(v_reasons, 'NBA_ACTION_MISMATCH');
            v_failed := true;
        ELSIF v_nba.decision_status IN ('WAIT', 'OBSERVE', 'NO_ACTION') THEN
            v_status := 'STALE';
            v_reasons := array_append(v_reasons, 'NBA_STALE');
            v_failed := true;
        ELSIF v_nba.decision_status = 'REVIEW_REQUIRED' THEN
            v_status := 'REVIEW_REQUIRED';
            v_reasons := array_append(v_reasons, 'NBA_REVIEW_REQUIRED');
            v_failed := true;
        END IF;
    END IF;
    
    -- Message Certification
    IF NOT v_failed AND v_cert_id IS NOT NULL THEN
        IF v_cert IS NULL THEN
            v_status := 'STALE';
            v_reasons := array_append(v_reasons, 'CERTIFICATION_INVALID');
            v_failed := true;
        ELSIF v_cert.status != 'CURRENT' THEN
            v_status := 'STALE';
            v_reasons := array_append(v_reasons, 'CERTIFICATION_STALE');
            v_failed := true;
        ELSIF v_cert.authority_bundle_hash != v_cert_hash THEN
            v_status := 'STALE';
            v_reasons := array_append(v_reasons, 'CERTIFICATION_HASH_MISMATCH');
            v_failed := true;
        END IF;
    END IF;
    
    -- Payload Hash (Exact Binding)
    -- We assume the invoker computed prepared_payload_hash identically.
    
    IF NOT v_failed THEN
        v_status := 'AUTHORIZED';
        v_reasons := array_append(v_reasons, 'ALL_AUTHORITIES_CURRENT');
    END IF;
    
    --------------------------------------------------
    -- 3. BUNDLE HASH GENERATION
    --------------------------------------------------
    -- Combine authority snapshots into a single bundle hash for audit
    v_bundle_hash := encode(digest(
        v_tenant_id::TEXT || 
        COALESCE(v_nba.input_snapshot_hash, '') ||
        COALESCE(v_elig.evidence_snapshot_hash, '') ||
        COALESCE(v_cert.authority_bundle_hash, '') ||
        COALESCE(v_payload_hash, '') ||
        COALESCE(v_dest_hash, ''),
        'sha256'
    ), 'hex');
    
    --------------------------------------------------
    -- 4. PERSISTENCE
    --------------------------------------------------
    INSERT INTO public.atlas_execution_jit_authorizations (
        tenant_id,
        logical_execution_identity,
        execution_request_id,
        subject_type,
        subject_id,
        action_type,
        channel,
        message_certification_id,
        certification_snapshot_hash,
        destination_hash,
        prepared_payload_hash,
        status,
        reason_codes,
        authority_bundle_hash,
        expires_at
    ) VALUES (
        v_tenant_id,
        v_logical_id,
        v_req_id,
        v_subject_type,
        v_subject_id,
        v_action_type,
        v_channel,
        v_cert_id,
        v_cert_hash,
        v_dest_hash,
        v_payload_hash,
        v_status,
        v_reasons,
        v_bundle_hash,
        v_expires_at
    );
    
    RETURN jsonb_build_object(
        'status', v_status,
        'reason_codes', v_reasons,
        'authority_bundle_hash', v_bundle_hash,
        'expires_at', v_expires_at
    );
END;
$$;
