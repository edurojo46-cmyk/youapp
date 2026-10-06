-- ==========================================
-- PHASE 10H-A1 EXTENSION SCHEMA QUALIFICATION
-- ==========================================
-- Forward migration: fix digest() call inside ingest_outcome_event.
-- The function uses search_path=public for SECURITY DEFINER safety,
-- which means pgcrypto functions must be schema-qualified (extensions.digest).
-- Also enable pgcrypto just in case it's not.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.ingest_outcome_event(
    p_tenant_id UUID,
    p_source_system TEXT,
    p_event_type TEXT,
    p_occurred_at TIMESTAMPTZ,
    
    p_business_domain TEXT,
    p_event_class TEXT,
    
    -- Semantic fields used by DB for fingerprint construction (scope-dependent)
    p_source_event_id TEXT DEFAULT NULL,
    p_provider_message_id TEXT DEFAULT NULL,
    p_object_canonical_ref TEXT DEFAULT NULL,
    p_canonical_fields JSONB DEFAULT NULL,
    
    -- Payload integrity
    p_payload_hash TEXT DEFAULT NULL,
    p_sanitized_metadata JSONB DEFAULT NULL,
    
    -- Optional actor
    p_subject_type TEXT DEFAULT NULL,
    p_subject_id UUID DEFAULT NULL,
    
    -- Optional commercial object
    p_object_type TEXT DEFAULT NULL,
    p_object_id UUID DEFAULT NULL,
    
    -- Optional Atlas context links (for attribution)
    p_logical_execution_identity TEXT DEFAULT NULL,
    p_attempt_id UUID DEFAULT NULL,
    p_routing_id UUID DEFAULT NULL,
    p_nba_id UUID DEFAULT NULL,
    
    -- Derived provenance
    p_derivation_method TEXT DEFAULT NULL,
    p_derivation_version TEXT DEFAULT NULL,
    
    -- Immutable relationships
    p_supersedes_event_id UUID DEFAULT NULL,
    p_reverses_event_id UUID DEFAULT NULL,
    p_related_event_id UUID DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_policy RECORD;
    v_event_id UUID;
    v_canonical_string TEXT;
    v_fingerprint TEXT;
BEGIN
    -- 1. SOURCE AUTHORITY RESOLUTION
    SELECT *
    INTO v_policy
    FROM public.atlas_outcome_source_policies
    WHERE tenant_id = p_tenant_id
      AND source_system = p_source_system
      AND event_type = p_event_type
      AND effective_from <= NOW()
      AND (effective_until IS NULL OR effective_until > NOW());

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'MISSING_SOURCE_POLICY');
    END IF;

    -- Check ambiguity
    IF (SELECT COUNT(*) FROM public.atlas_outcome_source_policies
        WHERE tenant_id = p_tenant_id
          AND source_system = p_source_system
          AND event_type = p_event_type
          AND effective_from <= NOW()
          AND (effective_until IS NULL OR effective_until > NOW())) > 1 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'AMBIGUOUS_SOURCE_POLICY');
    END IF;

    -- 2. DERIVED EVENT AUTHORITY VALIDATION
    IF p_event_class = 'DERIVED' AND v_policy.authority_class IN ('PROVIDER_AUTHORITY', 'PAYMENT_AUTHORITY', 'AFFILIATE_AUTHORITY') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'DERIVED_CANNOT_CLAIM_AUTHORITATIVE_POLICY');
    END IF;

    -- 3. DERIVED EVENT PROVENANCE VALIDATION
    IF p_event_class = 'DERIVED' AND (p_derivation_method IS NULL OR p_derivation_version IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'DERIVED_REQUIRES_PROVENANCE');
    END IF;

    -- 4. SUBJECT VALIDATION
    IF p_subject_id IS NOT NULL AND p_subject_type IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_SUBJECT');
    END IF;

    -- 5. DB-CANONICAL FINGERPRINT CONSTRUCTION
    CASE v_policy.source_event_identity_scope
        WHEN 'GLOBAL_EVENT_ID' THEN
            IF p_source_event_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'MISSING_SOURCE_EVENT_ID_FOR_SCOPE');
            END IF;
            v_canonical_string := p_tenant_id::text || '|' || p_source_system || '|' || p_source_event_id;
            
        WHEN 'MESSAGE_PLUS_EVENT_TYPE' THEN
            IF p_provider_message_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'MISSING_PROVIDER_MESSAGE_ID_FOR_SCOPE');
            END IF;
            v_canonical_string := p_tenant_id::text || '|' || p_source_system || '|' || p_provider_message_id || '|' || p_event_type;
            
        WHEN 'OBJECT_PLUS_EVENT_TYPE' THEN
            IF p_object_canonical_ref IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'MISSING_OBJECT_REF_FOR_SCOPE');
            END IF;
            v_canonical_string := p_tenant_id::text || '|' || p_source_system || '|' || p_object_canonical_ref || '|' || p_event_type;
            
        WHEN 'CANONICAL_FIELDS' THEN
            IF p_canonical_fields IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'MISSING_CANONICAL_FIELDS_FOR_SCOPE');
            END IF;
            -- Sort keys for determinism
            SELECT string_agg(key || ':' || value, ',' ORDER BY key)
            INTO v_canonical_string
            FROM jsonb_each_text(p_canonical_fields);
            
            v_canonical_string := p_tenant_id::text || '|' || p_source_system || '|' || p_event_type || '|' || COALESCE(v_canonical_string, '');
            
        ELSE
            RETURN jsonb_build_object('success', false, 'reason', 'UNKNOWN_IDENTITY_SCOPE');
    END CASE;

    -- USE EXTENSIONS SCHEMA FOR DIGEST
    v_fingerprint := encode(extensions.digest(v_canonical_string, 'sha256'), 'hex');

    -- 6. INSERTION (IMMUTABLE APPEND-ONLY)
    INSERT INTO public.atlas_outcome_events (
        tenant_id,
        source_system,
        event_type,
        occurred_at,
        business_domain,
        event_class,
        source_event_id,
        provider_message_id,
        object_canonical_ref,
        canonical_fields,
        payload_hash,
        sanitized_metadata,
        subject_type,
        subject_id,
        object_type,
        object_id,
        logical_execution_identity,
        attempt_id,
        routing_id,
        nba_id,
        derivation_method,
        derivation_version,
        supersedes_event_id,
        reverses_event_id,
        related_event_id,
        event_fingerprint,
        fingerprint_version
    ) VALUES (
        p_tenant_id,
        p_source_system,
        p_event_type,
        p_occurred_at,
        p_business_domain,
        p_event_class,
        p_source_event_id,
        p_provider_message_id,
        p_object_canonical_ref,
        p_canonical_fields,
        p_payload_hash,
        p_sanitized_metadata,
        p_subject_type,
        p_subject_id,
        p_object_type,
        p_object_id,
        p_logical_execution_identity,
        p_attempt_id,
        p_routing_id,
        p_nba_id,
        p_derivation_method,
        p_derivation_version,
        p_supersedes_event_id,
        p_reverses_event_id,
        p_related_event_id,
        v_fingerprint,
        'v1'
    ) RETURNING event_id INTO v_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'INSERTED',
        'event_id', v_event_id
    );

EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'ALREADY_RECORDED'
        );
END;
$$;
