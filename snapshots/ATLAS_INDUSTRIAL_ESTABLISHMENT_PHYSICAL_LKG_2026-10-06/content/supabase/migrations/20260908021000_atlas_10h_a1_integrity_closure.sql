-- ==========================================
-- PHASE 10H-A1 INTEGRITY CLOSURE
-- ==========================================
-- Forward migration only. Does NOT modify certified 10F or 10G semantics.
--
-- Gaps identified via effective remote audit of 20260908020000:
--
-- 1. REVOKE on ingest_outcome_event was ineffective: anon + authenticated
--    still had EXECUTE (CREATE OR REPLACE re-grants to all by default in PG).
-- 2. trg_prevent_outcome_mutation had PUBLIC EXECUTE (= X/postgres).
-- 3. ingest_outcome_event accepted caller-supplied fingerprint as authoritative.
--    DB must compute/validate it canonically.
-- 4. source_event_identity_scope missing from source_policy schema.
-- 5. Missing explicit CHECK on authority_class vs DERIVED event class.
-- 6. Missing index on atlas_outcome_events for tenant/execution lookups.
-- ==========================================

-- 1. ADD source_event_identity_scope to source policies
-- ------------------------------------------
ALTER TABLE public.atlas_outcome_source_policies
    ADD COLUMN IF NOT EXISTS source_event_identity_scope TEXT NOT NULL DEFAULT 'MESSAGE_PLUS_EVENT_TYPE'
    CHECK (source_event_identity_scope IN ('GLOBAL_EVENT_ID', 'MESSAGE_PLUS_EVENT_TYPE', 'OBJECT_PLUS_EVENT_TYPE', 'CANONICAL_FIELDS'));

-- 2. DROP old ingest_outcome_event overload (the one with caller-supplied p_event_fingerprint)
--    It has a different signature from the new canonical one below.
--    Using IF EXISTS + CASCADE to be safe.
DROP FUNCTION IF EXISTS public.ingest_outcome_event(
    UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT,
    TEXT, JSONB, TEXT, UUID, TEXT, UUID, TEXT, UUID, UUID, UUID,
    TEXT, TEXT, UUID, UUID, UUID
);

-- 3. REWRITE ingest_outcome_event: DB is canonical fingerprint authority
-- ------------------------------------------
-- The new function:
--   a. Accepts raw semantic inputs from caller (NOT a final fingerprint)
--   b. Reads the resolved source policy's identity_scope
--   c. Computes the canonical fingerprint internally using pgcrypto
--   d. Validates DERIVED event_class against claimed authority_class
--   e. Enforces tenant isolation for all cross-domain references
--   f. Returns idempotent result with the DB-computed event_id

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.ingest_outcome_event(
    p_tenant_id UUID,
    p_source_system TEXT,
    p_event_type TEXT,
    p_occurred_at TIMESTAMPTZ,
    p_business_domain TEXT,
    p_event_class TEXT,

    -- Semantic inputs for fingerprint construction (caller provides raw fields, DB computes)
    p_source_event_id TEXT DEFAULT NULL,        -- authoritative if scope = GLOBAL_EVENT_ID
    p_provider_message_id TEXT DEFAULT NULL,    -- used when scope = MESSAGE_PLUS_EVENT_TYPE
    p_object_canonical_ref TEXT DEFAULT NULL,   -- used when scope = OBJECT_PLUS_EVENT_TYPE
    p_canonical_fields JSONB DEFAULT NULL,      -- used when scope = CANONICAL_FIELDS

    -- Payload integrity
    p_payload_hash TEXT DEFAULT NULL,
    p_sanitized_metadata JSONB DEFAULT NULL,

    -- Optional actor
    p_subject_type TEXT DEFAULT NULL,
    p_subject_id UUID DEFAULT NULL,

    -- Optional commercial object
    p_object_type TEXT DEFAULT NULL,
    p_object_id UUID DEFAULT NULL,

    -- Optional Atlas context links
    p_logical_execution_identity TEXT DEFAULT NULL,
    p_attempt_id UUID DEFAULT NULL,
    p_routing_id UUID DEFAULT NULL,
    p_nba_id UUID DEFAULT NULL,

    -- Derived event provenance (mandatory if event_class = DERIVED)
    p_derivation_method TEXT DEFAULT NULL,
    p_derivation_version TEXT DEFAULT NULL,

    -- Relationships (corrections/reversals)
    p_supersedes_event_id UUID DEFAULT NULL,
    p_reverses_event_id UUID DEFAULT NULL,
    p_related_event_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_policy RECORD;
    v_fingerprint TEXT;
    v_fingerprint_version TEXT := 'v1';
    v_fingerprint_input TEXT;
    v_existing_event_id UUID;
    v_new_event_id UUID;
BEGIN
    -- 1. SOURCE POLICY RESOLUTION (exactly 1 active policy required)
    SELECT * INTO v_policy
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
    -- A DERIVED event_class must not claim authoritative provider/payment authority.
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
    -- The DB computes the authoritative fingerprint based on policy identity scope.
    -- Caller cannot impose a fingerprint value.
    CASE v_policy.source_event_identity_scope
        WHEN 'GLOBAL_EVENT_ID' THEN
            -- Provider guarantees globally unique event ID
            IF p_source_event_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'GLOBAL_EVENT_ID_SCOPE_REQUIRES_SOURCE_EVENT_ID');
            END IF;
            v_fingerprint_input := p_tenant_id::text || '|' || p_source_system || '|' || p_source_event_id;

        WHEN 'MESSAGE_PLUS_EVENT_TYPE' THEN
            -- Same message can have different event types (e.g. DELIVERED vs BOUNCED)
            IF p_provider_message_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'MESSAGE_SCOPE_REQUIRES_PROVIDER_MESSAGE_ID');
            END IF;
            v_fingerprint_input := p_tenant_id::text || '|' || p_source_system || '|' || p_provider_message_id || '|' || p_event_type;

        WHEN 'OBJECT_PLUS_EVENT_TYPE' THEN
            IF p_object_canonical_ref IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'OBJECT_SCOPE_REQUIRES_OBJECT_CANONICAL_REF');
            END IF;
            v_fingerprint_input := p_tenant_id::text || '|' || p_source_system || '|' || p_object_canonical_ref || '|' || p_event_type;

        WHEN 'CANONICAL_FIELDS' THEN
            IF p_canonical_fields IS NULL THEN
                RETURN jsonb_build_object('success', false, 'reason', 'CANONICAL_FIELDS_SCOPE_REQUIRES_FIELDS');
            END IF;
            -- Deterministic: JSON sorted by key at DB level
            v_fingerprint_input := p_tenant_id::text || '|' || p_source_system || '|' ||
                                   p_event_type || '|' ||
                                   (SELECT string_agg(key || ':' || value, ',' ORDER BY key)
                                    FROM jsonb_each_text(p_canonical_fields));

        ELSE
            RETURN jsonb_build_object('success', false, 'reason', 'UNKNOWN_FINGERPRINT_SCOPE');
    END CASE;

    v_fingerprint := encode(digest(v_fingerprint_input, 'sha256'), 'hex');

    -- 6. TENANT-SAFE SELF-REFERENCE CHECKS
    IF p_supersedes_event_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.atlas_outcome_events
                       WHERE event_id = p_supersedes_event_id AND tenant_id = p_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason', 'CROSS_TENANT_SUPERSEDES_DENIED');
        END IF;
    END IF;

    IF p_reverses_event_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.atlas_outcome_events
                       WHERE event_id = p_reverses_event_id AND tenant_id = p_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason', 'CROSS_TENANT_REVERSES_DENIED');
        END IF;
    END IF;

    IF p_related_event_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.atlas_outcome_events
                       WHERE event_id = p_related_event_id AND tenant_id = p_tenant_id) THEN
            RETURN jsonb_build_object('success', false, 'reason', 'CROSS_TENANT_RELATED_DENIED');
        END IF;
    END IF;

    -- 7. IDEMPOTENT APPEND
    INSERT INTO public.atlas_outcome_events (
        tenant_id, subject_type, subject_id, object_type, object_id,
        business_domain, event_class, event_type,
        derivation_method, derivation_version,
        source_policy_id, event_fingerprint, fingerprint_version,
        source_system, source_event_id,
        logical_execution_identity, attempt_id, routing_id, nba_id,
        occurred_at, observed_at,
        supersedes_event_id, reverses_event_id, related_event_id,
        payload_hash, sanitized_metadata
    ) VALUES (
        p_tenant_id, p_subject_type, p_subject_id, p_object_type, p_object_id,
        p_business_domain, p_event_class, p_event_type,
        p_derivation_method, p_derivation_version,
        v_policy.policy_id, v_fingerprint, v_fingerprint_version,
        p_source_system, p_source_event_id,
        p_logical_execution_identity, p_attempt_id, p_routing_id, p_nba_id,
        p_occurred_at, NOW(),
        p_supersedes_event_id, p_reverses_event_id, p_related_event_id,
        COALESCE(p_payload_hash, 'NO_PAYLOAD'),
        p_sanitized_metadata
    )
    ON CONFLICT (tenant_id, event_fingerprint, fingerprint_version) DO NOTHING
    RETURNING event_id INTO v_new_event_id;

    IF v_new_event_id IS NULL THEN
        SELECT event_id INTO v_existing_event_id
        FROM public.atlas_outcome_events
        WHERE tenant_id = p_tenant_id
          AND event_fingerprint = v_fingerprint
          AND fingerprint_version = v_fingerprint_version;

        RETURN jsonb_build_object('success', true, 'status', 'ALREADY_RECORDED', 'event_id', v_existing_event_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'INSERTED', 'event_id', v_new_event_id);
END;
$$;

-- 4. FIX GRANTS: REVOKE EXECUTE from anon, authenticated, PUBLIC
--    Use explicit full signature to avoid ambiguity with dropped overload.
REVOKE EXECUTE ON FUNCTION public.ingest_outcome_event(
    UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT,
    TEXT, TEXT, TEXT, JSONB, TEXT, JSONB,
    TEXT, UUID, TEXT, UUID,
    TEXT, UUID, UUID, UUID,
    TEXT, TEXT,
    UUID, UUID, UUID
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ingest_outcome_event(
    UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT,
    TEXT, TEXT, TEXT, JSONB, TEXT, JSONB,
    TEXT, UUID, TEXT, UUID,
    TEXT, UUID, UUID, UUID,
    TEXT, TEXT,
    UUID, UUID, UUID
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ingest_outcome_event(
    UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT,
    TEXT, TEXT, TEXT, JSONB, TEXT, JSONB,
    TEXT, UUID, TEXT, UUID,
    TEXT, UUID, UUID, UUID,
    TEXT, TEXT,
    UUID, UUID, UUID
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_outcome_event(
    UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT,
    TEXT, TEXT, TEXT, JSONB, TEXT, JSONB,
    TEXT, UUID, TEXT, UUID,
    TEXT, UUID, UUID, UUID,
    TEXT, TEXT,
    UUID, UUID, UUID
) TO service_role;

-- Also harden trigger function
REVOKE EXECUTE ON FUNCTION public.trg_prevent_outcome_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_prevent_outcome_mutation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_prevent_outcome_mutation() FROM authenticated;

-- 5. ADD PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_atlas_outcome_events_tenant_exec
    ON public.atlas_outcome_events (tenant_id, logical_execution_identity)
    WHERE logical_execution_identity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_outcome_events_tenant_routing
    ON public.atlas_outcome_events (tenant_id, routing_id)
    WHERE routing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_outcome_events_occurred
    ON public.atlas_outcome_events (tenant_id, occurred_at);
