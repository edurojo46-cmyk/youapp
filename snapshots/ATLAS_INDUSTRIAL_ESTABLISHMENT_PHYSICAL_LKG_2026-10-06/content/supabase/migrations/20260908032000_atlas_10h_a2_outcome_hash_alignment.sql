-- ==========================================
-- PHASE 10H-A2: OUTCOME PAYLOAD HASH ALIGNMENT (FORWARD-ONLY)
-- ==========================================

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
    v_payload_hash TEXT;
    v_ingest_res JSONB;
BEGIN
    -- 1. Read exclusively from 10F source truth
    SELECT * INTO v_out 
    FROM public.atlas_execution_outcomes 
    WHERE outcome_id = p_outcome_id;
    
    IF NOT FOUND THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'OUTCOME_NOT_FOUND');
    END IF;

    -- Tenant derived strictly from source fact
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
            -- e.g. 'DELAY' or unmapped is skipped deterministically
            RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_NOT_PROJECTABLE', 'event_type', v_out.event_type);
    END CASE;

    -- 2. Authoritative Occurred At (Strict: zero NOW() fallback)
    IF v_out.event_timestamp IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_MISSING_OCCURRED_AT');
    END IF;

    -- 3. Canonical Payload Hash of the source event payload (Strict: zero attempt hash reuse, zero MD5, zero fabrication)
    IF v_out.event_payload IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_MISSING_PAYLOAD_HASH_SOURCE');
    END IF;

    -- JSONB canonical representation hashing via extensions.digest (SHA-256)
    -- In PostgreSQL, jsonb normalizes key order and whitespace deterministically.
    v_payload_hash := pg_catalog.encode(extensions.digest(v_out.event_payload::text, 'sha256'), 'hex');

    IF v_payload_hash IS NULL OR v_payload_hash = '' THEN
        RETURN pg_catalog.jsonb_build_object('success', false, 'reason', 'SKIPPED_MISSING_PAYLOAD_HASH_SOURCE');
    END IF;

    -- 4. Resolve business domain authority from routing state
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

    -- 5. Delegate to certified 10H-A1 ingestion boundary
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
        p_sanitized_metadata := v_out.event_payload,
        p_payload_hash := v_payload_hash
    ) INTO v_ingest_res;

    RETURN v_ingest_res;
END;
$$;

-- Security Grants & Restrictions
REVOKE ALL ON FUNCTION public.project_10f_outcome_to_10h(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.project_10f_outcome_to_10h(UUID) TO service_role;
