-- ==========================================
-- PHASE 10H-A1: IMMUTABLE OUTCOME LEDGER
-- ==========================================

-- 1. SOURCE AUTHORITY POLICIES
-- ------------------------------------------

CREATE TABLE IF NOT EXISTS public.atlas_outcome_source_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    
    source_system TEXT NOT NULL,
    event_type TEXT NOT NULL,
    authority_class TEXT NOT NULL CHECK (authority_class IN (
        'PROVIDER_AUTHORITY', 
        'PAYMENT_AUTHORITY', 
        'AFFILIATE_AUTHORITY', 
        'FIRST_PARTY_OBSERVATION', 
        'DERIVED',
        'NON_AUTHORITATIVE'
    )),
    verification_method TEXT NOT NULL,
    
    policy_version TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_atlas_outcome_source_policy UNIQUE (tenant_id, source_system, event_type, policy_version),
    CONSTRAINT uq_atlas_source_policy_tenant_id UNIQUE (tenant_id, policy_id)
);

ALTER TABLE public.atlas_outcome_source_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_10h_source_policies_tenant ON public.atlas_outcome_source_policies FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 2. IMMUTABLE OUTCOME LEDGER
-- ------------------------------------------

CREATE TABLE IF NOT EXISTS public.atlas_outcome_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id),
    
    -- Actor (Optional, e.g. for Commerce)
    subject_type TEXT CHECK (subject_type IN ('PERSON', 'COMPANY')),
    subject_id UUID,

    -- Commercial Object/Context
    object_type TEXT CHECK (object_type IN ('PRODUCT', 'OFFER', 'LISTING', 'CONTENT', 'PAGE', 'CAMPAIGN')),
    object_id UUID,

    -- Event Semantics
    business_domain TEXT NOT NULL CHECK (business_domain IN ('OUTREACH', 'GROWTH', 'COMMERCE')),
    event_class TEXT NOT NULL CHECK (event_class IN ('OBSERVED', 'DERIVED')),
    event_type TEXT NOT NULL CHECK (event_type IN (
        -- Provider
        'PROVIDER_ACCEPTED', 'DELIVERED', 'BOUNCED', 'COMPLAINT', 'REJECTED', 'DELIVERY_DELAY', 'UNKNOWN_PROVIDER_OUTCOME',
        -- Engagement
        'OPEN', 'CLICK', 'REPLY', 'UNSUBSCRIBE', 'POSITIVE_REPLY', 'NEGATIVE_REPLY',
        -- Commercial
        'LEAD', 'QUALIFIED_LEAD', 'MEETING_BOOKED', 'PROPOSAL', 'CUSTOMER', 'PURCHASE', 'CANCELLED_PURCHASE', 'REFUND'
    )),

    -- Derived Provenance
    derivation_method TEXT,
    derivation_version TEXT,
    
    -- Source Authority
    source_policy_id UUID NOT NULL,
    CONSTRAINT fk_source_policy FOREIGN KEY (tenant_id, source_policy_id) REFERENCES public.atlas_outcome_source_policies(tenant_id, policy_id),

    -- Idempotency
    event_fingerprint TEXT NOT NULL,
    fingerprint_version TEXT NOT NULL,
    source_system TEXT NOT NULL,
    source_event_id TEXT,
    
    -- Links to 10F/10G/10D
    logical_execution_identity TEXT,
    attempt_id UUID,
    routing_id UUID,
    nba_id UUID,
    
    -- Time
    occurred_at TIMESTAMPTZ NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Explicit Relationships
    supersedes_event_id UUID,
    reverses_event_id UUID,
    related_event_id UUID,
    
    -- Payload Security
    payload_hash TEXT NOT NULL,
    sanitized_metadata JSONB,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_outcome_fingerprint UNIQUE (tenant_id, event_fingerprint, fingerprint_version),
    CONSTRAINT uq_atlas_outcome_tenant_id UNIQUE (tenant_id, event_id)
);

-- Derived provenance validation
ALTER TABLE public.atlas_outcome_events ADD CONSTRAINT chk_atlas_derived_provenance CHECK (
    (event_class = 'OBSERVED' AND derivation_method IS NULL AND derivation_version IS NULL) OR
    (event_class = 'DERIVED' AND derivation_method IS NOT NULL AND derivation_version IS NOT NULL)
);

-- Self-referential constraints with tenant safety
ALTER TABLE public.atlas_outcome_events ADD CONSTRAINT fk_supersedes_event FOREIGN KEY (tenant_id, supersedes_event_id) REFERENCES public.atlas_outcome_events(tenant_id, event_id);
ALTER TABLE public.atlas_outcome_events ADD CONSTRAINT fk_reverses_event FOREIGN KEY (tenant_id, reverses_event_id) REFERENCES public.atlas_outcome_events(tenant_id, event_id);
ALTER TABLE public.atlas_outcome_events ADD CONSTRAINT fk_related_event FOREIGN KEY (tenant_id, related_event_id) REFERENCES public.atlas_outcome_events(tenant_id, event_id);

-- Enforce Append-Only
ALTER TABLE public.atlas_outcome_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_10h_events_tenant_select ON public.atlas_outcome_events FOR SELECT USING (tenant_id = public.get_auth_tenant_id());

REVOKE UPDATE, DELETE ON public.atlas_outcome_events FROM authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.trg_prevent_outcome_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'atlas_outcome_events is append-only. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atlas_10h_outcomes_append_only
BEFORE UPDATE OR DELETE ON public.atlas_outcome_events
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_outcome_mutation();


-- 3. INGESTION BOUNDARY
-- ------------------------------------------

CREATE OR REPLACE FUNCTION public.ingest_outcome_event(
    p_tenant_id UUID,
    p_source_system TEXT,
    p_event_type TEXT,
    p_occurred_at TIMESTAMPTZ,
    
    p_business_domain TEXT,
    p_event_class TEXT,
    
    p_event_fingerprint TEXT,
    p_fingerprint_version TEXT,
    p_payload_hash TEXT,
    
    p_source_event_id TEXT DEFAULT NULL,
    p_sanitized_metadata JSONB DEFAULT NULL,
    p_subject_type TEXT DEFAULT NULL,
    p_subject_id UUID DEFAULT NULL,
    p_object_type TEXT DEFAULT NULL,
    p_object_id UUID DEFAULT NULL,
    p_logical_execution_identity TEXT DEFAULT NULL,
    p_attempt_id UUID DEFAULT NULL,
    p_routing_id UUID DEFAULT NULL,
    p_nba_id UUID DEFAULT NULL,
    p_derivation_method TEXT DEFAULT NULL,
    p_derivation_version TEXT DEFAULT NULL,
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
    v_inserted RECORD;
BEGIN
    -- 1. Source Policy Resolution (must be exactly 1)
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

    -- Check for ambiguity (more than 1 active policy)
    IF (SELECT COUNT(*) FROM public.atlas_outcome_source_policies 
        WHERE tenant_id = p_tenant_id 
          AND source_system = p_source_system 
          AND event_type = p_event_type
          AND effective_from <= NOW() 
          AND (effective_until IS NULL OR effective_until > NOW())) > 1 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'AMBIGUOUS_SOURCE_POLICY');
    END IF;
    
    -- 2. Validate Subject Type if present
    IF p_subject_id IS NOT NULL AND p_subject_type IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_SUBJECT');
    END IF;

    -- 3. Ingestion
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
        v_policy.policy_id, p_event_fingerprint, p_fingerprint_version,
        p_source_system, p_source_event_id,
        p_logical_execution_identity, p_attempt_id, p_routing_id, p_nba_id,
        p_occurred_at, NOW(),
        p_supersedes_event_id, p_reverses_event_id, p_related_event_id,
        p_payload_hash, p_sanitized_metadata
    )
    ON CONFLICT (tenant_id, event_fingerprint, fingerprint_version) DO NOTHING
    RETURNING event_id INTO v_inserted;
    
    IF v_inserted IS NULL THEN
        -- It was deduplicated (already existed)
        -- Let's fetch the existing ID to return ALREADY_RECORDED
        SELECT event_id INTO v_inserted FROM public.atlas_outcome_events
        WHERE tenant_id = p_tenant_id AND event_fingerprint = p_event_fingerprint AND fingerprint_version = p_fingerprint_version;
        
        RETURN jsonb_build_object('success', true, 'status', 'ALREADY_RECORDED', 'event_id', v_inserted.event_id);
    END IF;

    RETURN jsonb_build_object('success', true, 'status', 'INSERTED', 'event_id', v_inserted.event_id);
END;
$$;

-- Protect ingestion function
REVOKE EXECUTE ON FUNCTION public.ingest_outcome_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_outcome_event TO service_role;
