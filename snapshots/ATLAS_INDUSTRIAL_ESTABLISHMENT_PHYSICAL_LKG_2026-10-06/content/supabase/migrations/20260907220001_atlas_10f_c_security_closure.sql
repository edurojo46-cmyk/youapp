-- ==========================================
-- PHASE 10F-C: SECURITY CLOSURE (FORWARD MIGRATION)
-- ==========================================

-- 1. ADD TENANT ISOLATION TO SUPPRESSIONS
ALTER TABLE public.atlas_outreach_suppressions ADD COLUMN IF NOT EXISTS tenant_id UUID;

DO $$ 
DECLARE
    v_unresolved INT;
BEGIN
    UPDATE public.atlas_outreach_suppressions s
    SET tenant_id = c.tenant_id
    FROM public.atlas_contacts c
    WHERE s.contact_id = c.contact_id AND s.tenant_id IS NULL;
    
    SELECT count(*) INTO v_unresolved
    FROM public.atlas_outreach_suppressions
    WHERE tenant_id IS NULL;
    
    IF v_unresolved > 0 THEN
        RAISE EXCEPTION 'MIGRATION BLOCKED: % suppressions cannot be deterministically assigned to a tenant.', v_unresolved;
    END IF;
END $$;

ALTER TABLE public.atlas_outreach_suppressions ALTER COLUMN tenant_id SET NOT NULL;

DROP INDEX IF EXISTS idx_atlas_outreach_suppressions_hash_scope;
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_outreach_suppressions_tenant_hash_scope ON public.atlas_outreach_suppressions(tenant_id, email_hash, scope);

-- Tenant FK constraint omitted as atlas_tenants does not exist natively in this schema context.
ALTER TABLE public.atlas_outreach_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trg_rls_suppressions ON public.atlas_outreach_suppressions;
CREATE POLICY trg_rls_suppressions ON public.atlas_outreach_suppressions FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 2. ENFORCE BINDING CONSTRAINTS
ALTER TABLE public.atlas_execution_jit_authorizations DROP CONSTRAINT IF EXISTS chk_jit_dest_binding;
ALTER TABLE public.atlas_execution_jit_authorizations DROP CONSTRAINT IF EXISTS chk_jit_payload_binding;

ALTER TABLE public.atlas_execution_jit_authorizations ADD CONSTRAINT chk_jit_dest_binding CHECK (destination_hash IS NOT NULL);
ALTER TABLE public.atlas_execution_jit_authorizations ADD CONSTRAINT chk_jit_payload_binding CHECK (prepared_payload_hash IS NOT NULL);

ALTER TABLE public.atlas_execution_jit_authorizations DROP CONSTRAINT IF EXISTS atlas_execution_jit_authorizations_tenant_logical_id_key;
ALTER TABLE public.atlas_execution_jit_authorizations ADD CONSTRAINT atlas_execution_jit_authorizations_tenant_logical_id_key UNIQUE (tenant_id, logical_execution_identity);

-- 3. HARDEN JIT AUTHORIZATION RPC
CREATE OR REPLACE FUNCTION public.authorize_execution_jit(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_auth_tenant UUID;
    v_payload_tenant UUID;
    v_subject_type public.atlas_subject_type;
    v_subject_id UUID;
    v_action_type public.atlas_action_type;
    v_channel TEXT;
    
    v_nba_id UUID;
    v_cert_id UUID;
    v_cert_hash TEXT;
    v_dest_hash TEXT;
    v_payload_hash TEXT;
    v_email_hash TEXT;
    
    v_req_id TEXT;
    v_logical_id TEXT;
    
    v_nba RECORD;
    v_elig RECORD;
    v_cert RECORD;
    
    v_is_suppressed BOOLEAN := false;
    v_status public.atlas_jit_authorization_status := 'UNKNOWN';
    v_reasons TEXT[] := '{}';
    v_bundle_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_failed BOOLEAN := false;
BEGIN
    -- A. AUTHENTICATION & SECURITY
    v_auth_tenant := public.get_auth_tenant_id();
    IF v_auth_tenant IS NULL THEN
        RETURN jsonb_build_object('status', 'DENIED', 'reason_codes', ARRAY['UNAUTHORIZED_TENANT']);
    END IF;
    
    v_payload_tenant := (p_payload->>'tenant_id')::UUID;
    IF v_payload_tenant IS NOT NULL AND v_payload_tenant != v_auth_tenant THEN
        RETURN jsonb_build_object('status', 'DENIED', 'reason_codes', ARRAY['TENANT_MISMATCH']);
    END IF;

    -- B. PAYLOAD EXTRACTION
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
    
    -- Exact Binding Validation
    IF v_dest_hash IS NULL THEN
        v_status := 'DENIED';
        v_reasons := array_append(v_reasons, 'DESTINATION_BINDING_MISSING');
        v_failed := true;
    END IF;
    
    IF v_payload_hash IS NULL THEN
        v_status := 'DENIED';
        v_reasons := array_append(v_reasons, 'PAYLOAD_BINDING_MISSING');
        v_failed := true;
    END IF;
    
    IF v_failed THEN
        RETURN jsonb_build_object('status', v_status, 'reason_codes', v_reasons);
    END IF;

    --------------------------------------------------
    -- DETERMINISTIC LOCK ORDER (1 -> 12)
    --------------------------------------------------
    -- 1. Logical Execution Identity / Subject
    IF v_subject_type = 'PERSON' THEN
        PERFORM 1 FROM public.atlas_subject_registry WHERE subject_id = v_subject_id FOR SHARE;
    END IF;
    
    -- 2. 10D / NBA
    IF v_nba_id IS NOT NULL THEN
        SELECT * INTO v_nba FROM public.atlas_next_best_action_state 
        WHERE nba_id = v_nba_id AND tenant_id = v_auth_tenant 
        FOR SHARE;
    END IF;
    
    -- 3. 10C Eligibility
    SELECT * INTO v_elig FROM public.atlas_channel_eligibility 
    WHERE subject_id = v_subject_id AND channel = v_channel 
    FOR SHARE;
    
    -- 4. Suppression / Consent
    IF v_email_hash IS NOT NULL THEN
        SELECT true INTO v_is_suppressed FROM public.atlas_outreach_suppressions 
        WHERE email_hash = v_email_hash AND scope IN ('ALL', 'MARKETING') AND tenant_id = v_auth_tenant
        FOR SHARE LIMIT 1;
        
        IF v_is_suppressed IS NULL THEN v_is_suppressed := false; END IF;
    ELSE
        IF v_channel = 'EMAIL' THEN
            v_status := 'DENIED';
            v_reasons := array_append(v_reasons, 'UNKNOWN_SUPPRESSION_AUTHORITY');
            v_failed := true;
        END IF;
    END IF;
    
    -- 5. Message Draft + Certification
    IF v_cert_id IS NOT NULL THEN
        SELECT * INTO v_cert FROM public.atlas_message_certifications 
        WHERE id = v_cert_id AND tenant_id = v_auth_tenant 
        FOR SHARE;
    END IF;
    
    --------------------------------------------------
    -- HARD-GATE PRECEDENCE EVALUATION
    --------------------------------------------------
    -- Suppression
    IF v_is_suppressed THEN
        v_status := 'DENIED';
        v_reasons := array_append(v_reasons, 'SUPPRESSED');
        v_failed := true;
    END IF;
    
    -- Eligibility
    IF NOT v_failed AND (v_elig IS NULL OR v_elig.eligibility_status != 'ELIGIBLE') THEN
        v_status := 'DENIED';
        v_reasons := array_append(v_reasons, 'CHANNEL_INELIGIBLE');
        v_failed := true;
    END IF;
    
    -- NBA
    IF NOT v_failed AND v_nba_id IS NOT NULL THEN
        IF v_nba IS NULL THEN
            v_status := 'DENIED';
            v_reasons := array_append(v_reasons, 'NBA_NOT_FOUND');
            v_failed := true;
        ELSIF v_nba.decision_status != 'DO_NOW' OR v_nba.expires_at < now() THEN
            v_status := 'STALE';
            v_reasons := array_append(v_reasons, 'NBA_STALE');
            v_failed := true;
        END IF;
    END IF;
    
    -- Certification
    IF NOT v_failed AND v_cert_id IS NOT NULL THEN
        IF v_cert IS NULL THEN
            v_status := 'DENIED';
            v_reasons := array_append(v_reasons, 'CERTIFICATION_NOT_FOUND');
            v_failed := true;
        ELSIF v_cert.authority_bundle_hash != v_cert_hash THEN
            v_status := 'STALE';
            v_reasons := array_append(v_reasons, 'CERTIFICATION_CHANGED');
            v_failed := true;
        END IF;
    END IF;
    
    IF NOT v_failed THEN
        v_status := 'AUTHORIZED';
        v_reasons := array_append(v_reasons, 'ALL_AUTHORITIES_CURRENT');
    END IF;
    
    --------------------------------------------------
    -- CANONICAL BUNDLE HASH GENERATION
    --------------------------------------------------
    v_bundle_hash := encode(extensions.digest(
        (jsonb_build_object(
            'bundle_version', '10F-C-v1',
            'logical_execution_identity', v_logical_id,
            'destination', jsonb_build_object('applicable', true, 'hash', v_dest_hash),
            'payload', jsonb_build_object('applicable', true, 'hash', v_payload_hash),
            'nba', CASE WHEN v_nba IS NOT NULL THEN jsonb_build_object('applicable', true, 'hash', v_nba.input_snapshot_hash) ELSE jsonb_build_object('applicable', false) END,
            'eligibility', CASE WHEN v_elig IS NOT NULL THEN jsonb_build_object('applicable', true, 'hash', v_elig.evidence_snapshot_hash) ELSE jsonb_build_object('applicable', false) END,
            'certification', CASE WHEN v_cert IS NOT NULL THEN jsonb_build_object('applicable', true, 'hash', v_cert.authority_bundle_hash) ELSE jsonb_build_object('applicable', false) END
        )::text),
        'sha256'
    ), 'hex');
    
    v_expires_at := now() + interval '5 minutes';
    
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
        v_auth_tenant,
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
    )
    ON CONFLICT (tenant_id, logical_execution_identity) 
    DO UPDATE SET 
        status = EXCLUDED.status,
        reason_codes = EXCLUDED.reason_codes,
        authority_bundle_hash = EXCLUDED.authority_bundle_hash,
        expires_at = EXCLUDED.expires_at,
        consumed_at = NULL;
    
    RETURN jsonb_build_object(
        'status', v_status,
        'reason_codes', v_reasons,
        'authority_bundle_hash', v_bundle_hash,
        'expires_at', v_expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_execution_jit(JSONB) FROM public;
GRANT EXECUTE ON FUNCTION public.authorize_execution_jit(JSONB) TO authenticated, service_role;
