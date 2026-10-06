-- ==========================================
-- PHASE 10H-A2: 10F OUTCOME BRIDGE / PROJECTION
-- ==========================================

-- 1. SEED SOURCE POLICIES FOR EXISTING TENANTS
-- ------------------------------------------
-- Seed ATLAS_10F policy for all existing tenants safely.
INSERT INTO public.atlas_outcome_source_policies (
    tenant_id,
    source_system,
    event_type,
    effective_from,
    authority_class,
    verification_method,
    policy_version
)
SELECT 
    tenant_id,
    'ATLAS_10F',
    'PROVIDER_ACCEPTED',
    NOW(),
    'PROVIDER_AUTHORITY',
    'INTERNAL_CERTIFIED',
    '1.0'
FROM public.atlas_tenants
ON CONFLICT DO NOTHING;

INSERT INTO public.atlas_outcome_source_policies (
    tenant_id,
    source_system,
    event_type,
    effective_from,
    authority_class,
    verification_method,
    policy_version
)
SELECT 
    tenant_id,
    'ATLAS_10F',
    'DELIVERED',
    NOW(),
    'PROVIDER_AUTHORITY',
    'INTERNAL_CERTIFIED',
    '1.0'
FROM public.atlas_tenants
ON CONFLICT DO NOTHING;

INSERT INTO public.atlas_outcome_source_policies (
    tenant_id,
    source_system,
    event_type,
    effective_from,
    authority_class,
    verification_method,
    policy_version
)
SELECT 
    tenant_id,
    'ATLAS_10F',
    'BOUNCED',
    NOW(),
    'PROVIDER_AUTHORITY',
    'INTERNAL_CERTIFIED',
    '1.0'
FROM public.atlas_tenants
ON CONFLICT DO NOTHING;

INSERT INTO public.atlas_outcome_source_policies (
    tenant_id,
    source_system,
    event_type,
    effective_from,
    authority_class,
    verification_method,
    policy_version
)
SELECT 
    tenant_id,
    'ATLAS_10F',
    'COMPLAINT',
    NOW(),
    'PROVIDER_AUTHORITY',
    'INTERNAL_CERTIFIED',
    '1.0'
FROM public.atlas_tenants
ON CONFLICT DO NOTHING;

INSERT INTO public.atlas_outcome_source_policies (
    tenant_id,
    source_system,
    event_type,
    effective_from,
    authority_class,
    verification_method,
    policy_version
)
SELECT 
    tenant_id,
    'ATLAS_10F',
    'REJECTED',
    NOW(),
    'PROVIDER_AUTHORITY',
    'INTERNAL_CERTIFIED',
    '1.0'
FROM public.atlas_tenants
ON CONFLICT DO NOTHING;

-- 2. PROJECT ATTEMPT (ACCEPTED -> PROVIDER_ACCEPTED)
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.project_10f_attempt_to_10h(p_attempt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attempt RECORD;
    v_exec RECORD;
    v_tenant_id UUID;
    v_business_domain TEXT := NULL;
    v_routing_id UUID := NULL;
    v_nba_id UUID := NULL;
    v_ingest_res JSONB;
BEGIN
    -- Only read from 10F schema
    SELECT * INTO v_attempt 
    FROM public.atlas_execution_attempts 
    WHERE attempt_id = p_attempt_id;
    
    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_FOUND');
    END IF;

    v_tenant_id := v_attempt.tenant_id;

    SELECT * INTO v_exec
    FROM public.atlas_executions
    WHERE execution_id = v_attempt.execution_id;

    IF v_attempt.status != 'ACCEPTED' THEN
        -- FAILED_PRE_ACCEPT, ATTEMPTING, AMBIGUOUS are NOT mapped to outcome events!
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_NOT_PROJECTABLE', 'status', v_attempt.status);
    END IF;

    -- Resolve business domain from execution_request_id if it's a valid routing_id
    BEGIN
        v_routing_id := v_exec.execution_request_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        v_routing_id := NULL;
    END;

    IF v_routing_id IS NOT NULL THEN
        SELECT business_domain::text, nba_id INTO v_business_domain, v_nba_id
        FROM public.atlas_omnichannel_routing_state
        WHERE routing_id = v_routing_id AND tenant_id = v_tenant_id;
    END IF;

    IF v_business_domain IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_MISSING_DOMAIN_AUTHORITY');
    END IF;

    -- Call certified 10H-A1 ingestion boundary
    SELECT public.ingest_outcome_event(
        p_tenant_id := v_tenant_id,
        p_source_system := 'ATLAS_10F',
        p_event_type := 'PROVIDER_ACCEPTED',
        p_occurred_at := v_attempt.completed_at,
        p_business_domain := v_business_domain,
        p_event_class := 'OBSERVED',
        p_source_event_id := v_attempt.attempt_id::text,
        p_provider_message_id := v_attempt.provider_message_id,
        p_logical_execution_identity := v_exec.logical_execution_identity,
        p_attempt_id := v_attempt.attempt_id,
        p_routing_id := v_routing_id,
        p_nba_id := v_nba_id
    ) INTO v_ingest_res;

    RETURN v_ingest_res;
END;
$$;

-- 3. PROJECT OUTCOME (DELIVERY, BOUNCE, COMPLAINT, REJECT)
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.project_10f_outcome_to_10h(p_outcome_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_out RECORD;
    v_exec RECORD;
    v_tenant_id UUID;
    v_business_domain TEXT := NULL;
    v_routing_id UUID := NULL;
    v_nba_id UUID := NULL;
    v_mapped_event_type TEXT;
    v_ingest_res JSONB;
BEGIN
    SELECT * INTO v_out 
    FROM public.atlas_execution_outcomes 
    WHERE outcome_id = p_outcome_id;
    
    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'OUTCOME_NOT_FOUND');
    END IF;

    v_tenant_id := v_out.tenant_id;

    SELECT * INTO v_exec
    FROM public.atlas_executions
    WHERE execution_id = v_out.execution_id;

    -- Strict Semantic Mapping
    CASE v_out.event_type
        WHEN 'DELIVERY' THEN v_mapped_event_type := 'DELIVERED';
        WHEN 'BOUNCE' THEN v_mapped_event_type := 'BOUNCED';
        WHEN 'COMPLAINT' THEN v_mapped_event_type := 'COMPLAINT';
        WHEN 'REJECT' THEN v_mapped_event_type := 'REJECTED';
        ELSE
            -- e.g. 'DELAY' or unknown is not supported in the standard outcome ledger semantics requested.
            RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_NOT_PROJECTABLE', 'event_type', v_out.event_type);
    END CASE;

    -- Resolve business domain from execution_request_id if it's a valid routing_id
    BEGIN
        v_routing_id := v_exec.execution_request_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        v_routing_id := NULL;
    END;

    IF v_routing_id IS NOT NULL THEN
        SELECT business_domain::text, nba_id INTO v_business_domain, v_nba_id
        FROM public.atlas_omnichannel_routing_state
        WHERE routing_id = v_routing_id AND tenant_id = v_tenant_id;
    END IF;

    IF v_business_domain IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_MISSING_DOMAIN_AUTHORITY');
    END IF;

    -- Call certified 10H-A1 ingestion boundary
    SELECT public.ingest_outcome_event(
        p_tenant_id := v_tenant_id,
        p_source_system := 'ATLAS_10F',
        p_event_type := v_mapped_event_type,
        p_occurred_at := v_out.event_timestamp,
        p_business_domain := v_business_domain,
        p_event_class := 'OBSERVED',
        p_source_event_id := v_out.outcome_id::text,
        p_provider_message_id := v_out.provider_message_id,
        p_logical_execution_identity := v_exec.logical_execution_identity,
        p_attempt_id := v_out.attempt_id,
        p_routing_id := v_routing_id,
        p_nba_id := v_nba_id,
        p_sanitized_metadata := v_out.event_payload
    ) INTO v_ingest_res;

    RETURN v_ingest_res;
END;
$$;

-- 4. BATCH WRAPPER
-- ------------------------------------------
CREATE OR REPLACE FUNCTION public.project_10f_events_to_10h(p_tenant_id UUID, p_limit INT DEFAULT 1000)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
    v_res JSONB;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_error_count INT := 0;
    v_results JSONB := '[]'::jsonb;
BEGIN
    -- Project ACCEPTED Attempts
    FOR v_rec IN 
        SELECT attempt_id FROM public.atlas_execution_attempts 
        WHERE tenant_id = p_tenant_id AND status = 'ACCEPTED' 
        LIMIT p_limit
    LOOP
        SELECT public.project_10f_attempt_to_10h(v_rec.attempt_id) INTO v_res;
        v_results := v_results || pg_catalog.jsonb_build_object('attempt_id', v_rec.attempt_id, 'result', v_res);
        IF v_res->>'success' = 'true' THEN
            v_success_count := v_success_count + 1;
        ELSIF v_res->>'reason' LIKE 'SKIPPED_%' THEN
            v_skip_count := v_skip_count + 1;
        ELSE
            v_error_count := v_error_count + 1;
        END IF;
    END LOOP;

    -- Project Outcomes
    FOR v_rec IN 
        SELECT outcome_id FROM public.atlas_execution_outcomes 
        WHERE tenant_id = p_tenant_id 
        LIMIT p_limit
    LOOP
        SELECT public.project_10f_outcome_to_10h(v_rec.outcome_id) INTO v_res;
        v_results := v_results || pg_catalog.jsonb_build_object('outcome_id', v_rec.outcome_id, 'result', v_res);
        IF v_res->>'success' = 'true' THEN
            v_success_count := v_success_count + 1;
        ELSIF v_res->>'reason' LIKE 'SKIPPED_%' THEN
            v_skip_count := v_skip_count + 1;
        ELSE
            v_error_count := v_error_count + 1;
        END IF;
    END LOOP;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'projected', v_success_count,
        'skipped', v_skip_count,
        'errors', v_error_count,
        'details', v_results
    );
END;
$$;

-- 5. REVOKE PUBLIC ACCESS
-- ------------------------------------------
REVOKE ALL ON FUNCTION public.project_10f_attempt_to_10h FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_10f_outcome_to_10h FROM PUBLIC;
REVOKE ALL ON FUNCTION public.project_10f_events_to_10h FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.project_10f_attempt_to_10h TO authenticator;
GRANT EXECUTE ON FUNCTION public.project_10f_attempt_to_10h TO service_role;
GRANT EXECUTE ON FUNCTION public.project_10f_outcome_to_10h TO authenticator;
GRANT EXECUTE ON FUNCTION public.project_10f_outcome_to_10h TO service_role;
GRANT EXECUTE ON FUNCTION public.project_10f_events_to_10h TO authenticator;
GRANT EXECUTE ON FUNCTION public.project_10f_events_to_10h TO service_role;
