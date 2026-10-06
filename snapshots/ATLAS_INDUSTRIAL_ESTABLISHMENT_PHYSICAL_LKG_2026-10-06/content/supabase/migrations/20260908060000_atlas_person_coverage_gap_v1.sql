-- ============================================================================
-- MIGRATION: 20260908060000_atlas_person_coverage_gap_v1.sql
-- DESCRIPTION: Person Coverage / Gap Analysis Engine V1
-- ZERO SEARCH | ZERO ENRICHMENT | ZERO LLM AUTHORITY | REPRODUCIBLE AS_OF
-- ============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.atlas_coverage_status AS ENUM (
        'KNOWN',
        'UNKNOWN',
        'CONFLICT',
        'STALE',
        'NOT_APPLICABLE',
        'BLOCKED_BY_AUTHORITY'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_gap_priority AS ENUM (
        'CRITICAL',
        'HIGH',
        'MEDIUM',
        'LOW',
        'NONE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. COVERAGE POLICIES TABLE (FRESHNESS ONLY)
CREATE TABLE IF NOT EXISTS public.atlas_person_coverage_policies (
    coverage_policy_version TEXT PRIMARY KEY,
    
    attribute_freshness_days INT NOT NULL DEFAULT 30,
    signal_freshness_days INT NOT NULL DEFAULT 30,
    intent_freshness_days INT NOT NULL DEFAULT 90,
    fit_freshness_days INT NOT NULL DEFAULT 90,
    
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index for single active policy
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_coverage_policy 
ON public.atlas_person_coverage_policies(is_active) 
WHERE is_active = TRUE;

-- Policy Parameter Immutability Trigger
CREATE OR REPLACE FUNCTION public.trg_enforce_coverage_policy_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.attribute_freshness_days IS DISTINCT FROM NEW.attribute_freshness_days) OR
       (OLD.signal_freshness_days IS DISTINCT FROM NEW.signal_freshness_days) OR
       (OLD.intent_freshness_days IS DISTINCT FROM NEW.intent_freshness_days) OR
       (OLD.fit_freshness_days IS DISTINCT FROM NEW.fit_freshness_days) THEN
        RAISE EXCEPTION 'POLICY_IMMUTABLE: Coverage policy parameters cannot be modified. Create a new policy version.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_coverage_policy_immutability ON public.atlas_person_coverage_policies;
CREATE TRIGGER trg_coverage_policy_immutability
BEFORE UPDATE ON public.atlas_person_coverage_policies
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_coverage_policy_immutability();

-- Seed Default Active Policy
INSERT INTO public.atlas_person_coverage_policies (
    coverage_policy_version,
    attribute_freshness_days,
    signal_freshness_days,
    intent_freshness_days,
    fit_freshness_days,
    is_active
) VALUES (
    'cov-v1.0.0-deterministic',
    30,
    30,
    90,
    90,
    TRUE
) ON CONFLICT (coverage_policy_version) DO NOTHING;

-- 3. COVERAGE DIMENSIONS TABLE (CURRENT STATE)
CREATE TABLE IF NOT EXISTS public.atlas_person_coverage_dimensions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    dimension_key TEXT NOT NULL,
    coverage_status public.atlas_coverage_status NOT NULL,
    sufficient_for_lifecycle BOOLEAN NOT NULL DEFAULT FALSE,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_fact_set_hash TEXT NOT NULL,
    coverage_state_hash TEXT NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_person_coverage_dimension UNIQUE(tenant_id, person_id, dimension_key)
);

CREATE INDEX IF NOT EXISTS idx_coverage_dimensions_lookup 
ON public.atlas_person_coverage_dimensions(tenant_id, person_id);

CREATE INDEX IF NOT EXISTS idx_coverage_dimensions_status 
ON public.atlas_person_coverage_dimensions(tenant_id, dimension_key, coverage_status);

-- 4. COVERAGE SNAPSHOTS TABLE (IMMUTABLE AUDIT LEDGER)
CREATE TABLE IF NOT EXISTS public.atlas_person_coverage_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    coverage_policy_version TEXT NOT NULL REFERENCES public.atlas_person_coverage_policies(coverage_policy_version),
    lifecycle_policy_version TEXT NOT NULL REFERENCES public.atlas_lifecycle_policies(policy_version),
    
    source_fact_set_hash TEXT NOT NULL,
    coverage_state_hash TEXT NOT NULL,
    
    dimensions_summary JSONB NOT NULL,
    as_of TIMESTAMPTZ NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_forced BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coverage_snapshots_lookup 
ON public.atlas_person_coverage_snapshots(tenant_id, person_id, created_at DESC);

-- 5. GAP ANALYSIS TABLE (CURRENT STATE)
CREATE TABLE IF NOT EXISTS public.atlas_person_gap_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    gap_key TEXT NOT NULL,
    priority public.atlas_gap_priority NOT NULL,
    reason TEXT NOT NULL,
    blocker_rule TEXT,
    consumer_dependency TEXT,
    
    last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_person_gap_key UNIQUE(tenant_id, person_id, gap_key)
);

CREATE INDEX IF NOT EXISTS idx_gap_analysis_lookup 
ON public.atlas_person_gap_analysis(tenant_id, person_id);

CREATE INDEX IF NOT EXISTS idx_gap_analysis_priority 
ON public.atlas_person_gap_analysis(tenant_id, priority);

-- 6. GAP SNAPSHOTS TABLE (IMMUTABLE AUDIT LEDGER)
CREATE TABLE IF NOT EXISTS public.atlas_person_gap_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    coverage_policy_version TEXT NOT NULL REFERENCES public.atlas_person_coverage_policies(coverage_policy_version),
    lifecycle_policy_version TEXT NOT NULL REFERENCES public.atlas_lifecycle_policies(policy_version),
    
    source_fact_set_hash TEXT NOT NULL,
    coverage_state_hash TEXT NOT NULL,
    
    gaps_summary JSONB NOT NULL,
    as_of TIMESTAMPTZ NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_forced BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gap_snapshots_lookup 
ON public.atlas_person_gap_snapshots(tenant_id, person_id, created_at DESC);

-- 7. ROW LEVEL SECURITY
ALTER TABLE public.atlas_person_coverage_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_coverage_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_coverage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_gap_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_gap_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coverage_policies_read_all ON public.atlas_person_coverage_policies;
CREATE POLICY coverage_policies_read_all ON public.atlas_person_coverage_policies
FOR SELECT TO authenticated, service_role USING (true);

DROP POLICY IF EXISTS coverage_dimensions_tenant_isolation ON public.atlas_person_coverage_dimensions;
CREATE POLICY coverage_dimensions_tenant_isolation ON public.atlas_person_coverage_dimensions
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

DROP POLICY IF EXISTS coverage_snapshots_tenant_isolation ON public.atlas_person_coverage_snapshots;
CREATE POLICY coverage_snapshots_tenant_isolation ON public.atlas_person_coverage_snapshots
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

DROP POLICY IF EXISTS gap_analysis_tenant_isolation ON public.atlas_person_gap_analysis;
CREATE POLICY gap_analysis_tenant_isolation ON public.atlas_person_gap_analysis
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

DROP POLICY IF EXISTS gap_snapshots_tenant_isolation ON public.atlas_person_gap_snapshots;
CREATE POLICY gap_snapshots_tenant_isolation ON public.atlas_person_gap_snapshots
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

-- 8. SOURCE FACT SET HASH FUNCTION (PERSISTED FACTS ONLY - TEMPORALLY INDEPENDENT)
CREATE OR REPLACE FUNCTION public.calculate_person_source_fact_set_hash(
    p_tenant_id UUID,
    p_person_id UUID
) RETURNS TEXT AS $$
DECLARE
    v_cov_ver TEXT;
    v_lc_ver TEXT;
    v_identifiers JSONB;
    v_attributes JSONB;
    v_signals JSONB;
    v_intent JSONB;
    v_fit JSONB;
    v_eligibility JSONB;
    v_nba JSONB;
    v_canonical_fact_set JSONB;
BEGIN
    -- Active policy versions
    SELECT coverage_policy_version INTO v_cov_ver 
    FROM public.atlas_person_coverage_policies 
    WHERE is_active = TRUE LIMIT 1;

    SELECT policy_version INTO v_lc_ver 
    FROM public.atlas_lifecycle_policies 
    WHERE is_active = TRUE LIMIT 1;

    -- 1. Identifiers (Deterministic order by canonical json string)
    SELECT COALESCE(jsonb_agg(item ORDER BY item::text ASC), '[]'::jsonb)
    INTO v_identifiers
    FROM (
        SELECT jsonb_build_object(
            'type', pi.identifier_type::text,
            'hash', pi.normalized_value_hash,
            'status', pi.verification_status,
            'first_seen', pi.first_seen_at,
            'last_seen', pi.last_seen_at
        ) AS item
        FROM public.atlas_person_identifiers pi
        WHERE pi.person_id = p_person_id AND pi.tenant_id = p_tenant_id
    ) q;

    -- 2. Attribute Evidence (Deterministic order by canonical json string)
    SELECT COALESCE(jsonb_agg(item ORDER BY item::text ASC), '[]'::jsonb)
    INTO v_attributes
    FROM (
        SELECT jsonb_build_object(
            'key', pa.attribute_key,
            'val', pa.normalized_value,
            'assertion', pa.assertion_type::text,
            'conf', pa.confidence,
            'observed_at', pa.observed_at,
            'valid_until', pa.valid_until
        ) AS item
        FROM public.atlas_person_attribute_evidence pa
        WHERE pa.person_id = p_person_id AND pa.tenant_id = p_tenant_id
    ) q;

    -- 3. Social Signals (Deterministic order by canonical json string)
    SELECT COALESCE(jsonb_agg(item ORDER BY item::text ASC), '[]'::jsonb)
    INTO v_signals
    FROM (
        SELECT jsonb_build_object(
            'type', ss.signal_type,
            'status', ss.status::text,
            'conf', ss.confidence,
            'fingerprint', ss.signal_fingerprint,
            'detected_at', ss.detected_at,
            'valid_until', ss.valid_until
        ) AS item
        FROM public.atlas_social_signals ss
        WHERE ss.canonical_entity_id = p_person_id 
          AND ss.canonical_entity_type = 'PERSON'
    ) q;

    -- 4. Intent State (Deterministic order by canonical json string)
    SELECT COALESCE(jsonb_agg(item ORDER BY item::text ASC), '[]'::jsonb)
    INTO v_intent
    FROM (
        SELECT jsonb_build_object(
            'topic', pit.topic,
            'product_ref', pit.product_ref,
            'level', pit.intent_level::text,
            'score', pit.intent_score,
            'calculated_at', pit.calculated_at,
            'expires_at', pit.expires_at
        ) AS item
        FROM public.atlas_person_intent_state pit
        WHERE pit.person_id = p_person_id AND pit.tenant_id = p_tenant_id
    ) q;

    -- 5. Product Fit State (Deterministic order by canonical json string)
    SELECT COALESCE(jsonb_agg(item ORDER BY item::text ASC), '[]'::jsonb)
    INTO v_fit
    FROM (
        SELECT jsonb_build_object(
            'product_id', pf.product_id,
            'offer_id', pf.offer_id,
            'level', pf.fit_level::text,
            'score', pf.fit_score,
            'calculated_at', pf.calculated_at,
            'expires_at', pf.expires_at
        ) AS item
        FROM public.atlas_person_product_fit_state pf
        WHERE pf.person_id = p_person_id AND pf.tenant_id = p_tenant_id
    ) q;

    -- 6. Channel Eligibility (10C) - Scoped via atlas_subject_registry
    SELECT COALESCE(jsonb_agg(item ORDER BY item::text ASC), '[]'::jsonb)
    INTO v_eligibility
    FROM (
        SELECT jsonb_build_object(
            'channel', ce.channel::text,
            'action_type', ce.action_type::text,
            'status', ce.eligibility_status::text,
            'evaluated_at', ce.evaluated_at,
            'expires_at', ce.expires_at
        ) AS item
        FROM public.atlas_subject_registry sr
        JOIN public.atlas_channel_eligibility ce ON ce.subject_id = sr.subject_id
        WHERE sr.person_id = p_person_id 
          AND sr.subject_type = 'PERSON'
    ) q;

    -- 7. Next Best Action (10D)
    SELECT COALESCE(jsonb_agg(item ORDER BY item::text ASC), '[]'::jsonb)
    INTO v_nba
    FROM (
        SELECT jsonb_build_object(
            'action', nba.recommended_action,
            'channel', nba.recommended_channel::text,
            'status', nba.decision_status::text,
            'score', nba.priority_score,
            'product_id', nba.product_id,
            'offer_id', nba.offer_id,
            'opp_id', nba.opportunity_id,
            'evaluated_at', nba.evaluated_at,
            'expires_at', nba.expires_at
        ) AS item
        FROM public.atlas_subject_registry sr
        JOIN public.atlas_next_best_action_state nba ON nba.subject_id = sr.subject_id
        WHERE sr.person_id = p_person_id 
          AND sr.subject_type = 'PERSON' 
          AND nba.tenant_id = p_tenant_id
    ) q;

    -- Root canonical representation (strictly excludes NOW() and execution timestamp)
    v_canonical_fact_set := jsonb_build_object(
        'coverage_policy', COALESCE(v_cov_ver, 'NONE'),
        'lifecycle_policy', COALESCE(v_lc_ver, 'NONE'),
        'identifiers', v_identifiers,
        'attributes', v_attributes,
        'signals', v_signals,
        'intent', v_intent,
        'fit', v_fit,
        'eligibility', v_eligibility,
        'nba', v_nba
    );

    RETURN encode(digest(v_canonical_fact_set::text, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 9. SYSTEM COMPUTATION ENGINE (CORE DETERMINISTIC EVALUATION)
CREATE OR REPLACE FUNCTION public.compute_person_coverage_system_v1(
    p_tenant_id UUID,
    p_person_id UUID,
    p_as_of TIMESTAMPTZ DEFAULT NULL,
    p_force_snapshot BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
    v_is_historical BOOLEAN;
    v_eval_time TIMESTAMPTZ;
    v_person RECORD;
    v_cov_policy RECORD;
    v_lc_policy RECORD;
    v_active_cov_count INT;
    v_active_lc_count INT;
    
    v_source_fact_set_hash TEXT;
    v_coverage_state_hash TEXT;
    
    -- Evaluation tracking variables
    v_dimensions JSONB := '[]'::jsonb;
    v_gaps JSONB := '[]'::jsonb;
    v_dim_record JSONB;
    v_gap_record JSONB;
    
    -- Identity Anchor metrics
    v_stable_anchor_count INT := 0;
    v_ident_count INT := 0;
    
    -- Attribute Evidence metrics
    v_attr_evidence_count INT := 0;
    v_avg_attr_confidence NUMERIC := NULL;
    
    -- Granular Attributes
    v_has_location BOOLEAN := FALSE;
    v_has_country BOOLEAN := FALSE;
    v_has_city BOOLEAN := FALSE;
    v_has_neighborhood BOOLEAN := FALSE;
    v_has_profession BOOLEAN := FALSE;
    v_has_job_title BOOLEAN := FALSE;
    v_has_company BOOLEAN := FALSE;
    v_has_work_city BOOLEAN := FALSE;
    
    -- Contact channels
    v_has_email BOOLEAN := FALSE;
    v_has_phone BOOLEAN := FALSE;
    v_has_instagram BOOLEAN := FALSE;
    v_has_telegram BOOLEAN := FALSE;
    v_has_youtube BOOLEAN := FALSE;
    v_has_linkedin BOOLEAN := FALSE;
    
    -- Social Signals & Intent metrics
    v_has_fresh_signal BOOLEAN := FALSE;
    v_intent_status public.atlas_coverage_status := 'UNKNOWN';
    v_intent_qualified BOOLEAN := FALSE;
    v_fit_status public.atlas_coverage_status := 'UNKNOWN';
    v_fit_qualified BOOLEAN := FALSE;
    
    -- 10C / 10D
    v_subject_id UUID := NULL;
    v_10c_status public.atlas_coverage_status := 'UNKNOWN';
    v_10d_status public.atlas_coverage_status := 'UNKNOWN';
    
    v_conflict_exists BOOLEAN := FALSE;
    v_last_snapshot RECORD;
    v_should_snapshot BOOLEAN := FALSE;
BEGIN
    -- Advisory lock: serialize evaluation of the SAME person strictly within transaction
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_person_id::text));

    -- Determine mode
    v_is_historical := (p_as_of IS NOT NULL);
    v_eval_time := COALESCE(p_as_of, CURRENT_TIMESTAMP);

    -- Person verification
    SELECT * INTO v_person FROM public.atlas_people 
    WHERE person_id = p_person_id AND tenant_id = p_tenant_id;
    IF v_person.person_id IS NULL THEN
        RAISE EXCEPTION 'PERSON_NOT_FOUND: Person % does not exist for tenant %', p_person_id, p_tenant_id;
    END IF;

    -- Fail-closed policy checks: exactly ONE active policy required for each domain
    SELECT COUNT(*) INTO v_active_cov_count FROM public.atlas_person_coverage_policies WHERE is_active = TRUE;
    IF v_active_cov_count = 0 THEN
        RAISE EXCEPTION 'NO_ACTIVE_COVERAGE_POLICY: Computation halted because zero active coverage policies exist';
    ELSIF v_active_cov_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_COVERAGE_POLICY: Computation halted because multiple active coverage policies exist';
    END IF;
    SELECT * INTO v_cov_policy FROM public.atlas_person_coverage_policies WHERE is_active = TRUE;

    SELECT COUNT(*) INTO v_active_lc_count FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;
    IF v_active_lc_count = 0 THEN
        RAISE EXCEPTION 'NO_ACTIVE_LIFECYCLE_POLICY: Computation halted because zero active lifecycle policies exist';
    ELSIF v_active_lc_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LIFECYCLE_POLICY: Computation halted because multiple active lifecycle policies exist';
    END IF;
    SELECT * INTO v_lc_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;

    -- 1. Compute temporally independent SOURCE_FACT_SET_HASH
    v_source_fact_set_hash := public.calculate_person_source_fact_set_hash(p_tenant_id, p_person_id);

    -- 2. Resolve Subject Registry Linkage (10C / 10D bridge)
    SELECT sr.subject_id INTO v_subject_id 
    FROM public.atlas_subject_registry sr
    WHERE sr.person_id = p_person_id AND sr.subject_type = 'PERSON';

    -- 3. Check for linked identifier conflict
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_person_discovery_candidates c
        JOIN public.atlas_person_candidate_identifiers ci ON ci.candidate_id = c.candidate_id
        JOIN public.atlas_person_identifiers pi ON pi.normalized_value_hash = ci.normalized_value_hash
                                               AND pi.identifier_type = ci.identifier_type
        WHERE c.candidate_status = 'CONFLICT'
          AND pi.person_id = p_person_id
          AND pi.tenant_id = p_tenant_id
    ) INTO v_conflict_exists;

    -- 4. Evaluate Identity Anchors
    -- Classifier: EMAIL, PHONE, INSTAGRAM, X, YOUTUBE, LINKEDIN with status 'VERIFIED'
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE identifier_type IN ('EMAIL', 'PHONE', 'INSTAGRAM', 'X', 'YOUTUBE', 'LINKEDIN') AND verification_status = 'VERIFIED')
    INTO v_ident_count, v_stable_anchor_count
    FROM public.atlas_person_identifiers
    WHERE person_id = p_person_id AND tenant_id = p_tenant_id;

    v_dim_record := jsonb_build_object(
        'dimension_key', 'IDENTITY_ANCHORS',
        'coverage_status', CASE 
            WHEN v_conflict_exists THEN 'CONFLICT'
            WHEN v_stable_anchor_count > 0 THEN 'KNOWN'
            WHEN v_ident_count > 0 THEN 'KNOWN'
            ELSE 'UNKNOWN'
        END,
        'sufficient_for_lifecycle', (v_stable_anchor_count >= v_lc_policy.min_identity_anchors),
        'details', jsonb_build_object(
            'total_identifiers', v_ident_count,
            'stable_anchors', v_stable_anchor_count,
            'min_required', v_lc_policy.min_identity_anchors
        )
    );
    v_dimensions := v_dimensions || jsonb_build_array(v_dim_record);

    -- 5. Contact Channels (Verified Identifiers)
    SELECT 
        EXISTS (SELECT 1 FROM public.atlas_person_identifiers WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND identifier_type = 'EMAIL' AND verification_status = 'VERIFIED'),
        EXISTS (SELECT 1 FROM public.atlas_person_identifiers WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND identifier_type = 'PHONE' AND verification_status = 'VERIFIED'),
        EXISTS (SELECT 1 FROM public.atlas_person_identifiers WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND identifier_type = 'INSTAGRAM' AND verification_status = 'VERIFIED'),
        EXISTS (SELECT 1 FROM public.atlas_person_identifiers WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND identifier_type = 'TELEGRAM' AND verification_status = 'VERIFIED'),
        EXISTS (SELECT 1 FROM public.atlas_person_identifiers WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND identifier_type = 'YOUTUBE' AND verification_status = 'VERIFIED'),
        EXISTS (SELECT 1 FROM public.atlas_person_identifiers WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND identifier_type = 'LINKEDIN' AND verification_status = 'VERIFIED')
    INTO v_has_email, v_has_phone, v_has_instagram, v_has_telegram, v_has_youtube, v_has_linkedin;

    v_dimensions := v_dimensions || jsonb_build_array(
        jsonb_build_object('dimension_key', 'EMAIL', 'coverage_status', CASE WHEN v_has_email THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_email, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'PHONE', 'coverage_status', CASE WHEN v_has_phone THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_phone, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'SOCIAL_ACCOUNT', 'coverage_status', CASE WHEN (v_has_instagram OR v_has_telegram OR v_has_youtube OR v_has_linkedin) THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', (v_has_instagram OR v_has_telegram OR v_has_youtube OR v_has_linkedin), 'details', jsonb_build_object('instagram', v_has_instagram, 'telegram', v_has_telegram, 'youtube', v_has_youtube, 'linkedin', v_has_linkedin))
    );

    -- 6. Evaluate Attribute Evidence & Granular Attributes
    SELECT 
        COUNT(*),
        AVG(confidence)
    INTO v_attr_evidence_count, v_avg_attr_confidence
    FROM public.atlas_person_attribute_evidence
    WHERE person_id = p_person_id AND tenant_id = p_tenant_id
      AND (valid_until IS NULL OR valid_until > v_eval_time);

    v_dim_record := jsonb_build_object(
        'dimension_key', 'ATTRIBUTE_EVIDENCE',
        'coverage_status', CASE WHEN v_attr_evidence_count > 0 THEN 'KNOWN' ELSE 'UNKNOWN' END,
        'sufficient_for_lifecycle', (v_attr_evidence_count >= v_lc_policy.min_attribute_evidence_count),
        'details', jsonb_build_object(
            'count', v_attr_evidence_count,
            'min_required', v_lc_policy.min_attribute_evidence_count
        )
    );
    v_dimensions := v_dimensions || jsonb_build_array(v_dim_record);

    -- Evidence Confidence dimension: confidence value present -> KNOWN (never STALE, sufficiency evaluated separately)
    v_dim_record := jsonb_build_object(
        'dimension_key', 'EVIDENCE_CONFIDENCE',
        'coverage_status', CASE WHEN v_avg_attr_confidence IS NOT NULL THEN 'KNOWN' ELSE 'UNKNOWN' END,
        'sufficient_for_lifecycle', (COALESCE(v_avg_attr_confidence, 0.0) >= v_lc_policy.min_attribute_confidence),
        'details', jsonb_build_object(
            'average_confidence', v_avg_attr_confidence,
            'min_required', v_lc_policy.min_attribute_confidence
        )
    );
    v_dimensions := v_dimensions || jsonb_build_array(v_dim_record);

    -- Strict Granular Attribute Mapping (No coarse inference)
    SELECT 
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key = 'LOCATION' AND (valid_until IS NULL OR valid_until > v_eval_time)),
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key = 'residence_country' AND (valid_until IS NULL OR valid_until > v_eval_time)),
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key = 'residence_city' AND (valid_until IS NULL OR valid_until > v_eval_time)),
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key = 'residence_neighborhood' AND (valid_until IS NULL OR valid_until > v_eval_time)),
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key = 'profession' AND (valid_until IS NULL OR valid_until > v_eval_time)),
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key = 'TITLE' AND (valid_until IS NULL OR valid_until > v_eval_time)),
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key IN ('company', 'COMPANY') AND (valid_until IS NULL OR valid_until > v_eval_time)),
        EXISTS (SELECT 1 FROM public.atlas_person_attribute_evidence WHERE person_id = p_person_id AND tenant_id = p_tenant_id AND attribute_key = 'work_city' AND (valid_until IS NULL OR valid_until > v_eval_time))
    INTO v_has_location, v_has_country, v_has_city, v_has_neighborhood, v_has_profession, v_has_job_title, v_has_company, v_has_work_city;

    v_dimensions := v_dimensions || jsonb_build_array(
        jsonb_build_object('dimension_key', 'LOCATION', 'coverage_status', CASE WHEN v_has_location THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_location, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'COUNTRY', 'coverage_status', CASE WHEN v_has_country THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_country, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'CITY', 'coverage_status', CASE WHEN v_has_city THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_city, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'NEIGHBORHOOD', 'coverage_status', CASE WHEN v_has_neighborhood THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_neighborhood, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'PROFESSION', 'coverage_status', CASE WHEN v_has_profession THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_profession, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'JOB_TITLE', 'coverage_status', CASE WHEN v_has_job_title THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_job_title, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'COMPANY', 'coverage_status', CASE WHEN v_has_company THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_company, 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'WORK_CITY', 'coverage_status', CASE WHEN v_has_work_city THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_work_city, 'details', '{}'::jsonb),
        -- Strict Unsupported keys remain UNKNOWN
        jsonb_build_object('dimension_key', 'REGION', 'coverage_status', 'UNKNOWN', 'sufficient_for_lifecycle', false, 'details', '{"status": "UNSUPPORTED_V1"}'::jsonb),
        jsonb_build_object('dimension_key', 'WORK_NEIGHBORHOOD', 'coverage_status', 'UNKNOWN', 'sufficient_for_lifecycle', false, 'details', '{"status": "UNSUPPORTED_V1"}'::jsonb)
    );

    -- 7. Social Signals (10B)
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_social_signals ss
        WHERE ss.canonical_entity_id = p_person_id 
          AND ss.canonical_entity_type = 'PERSON'
          AND ss.status = 'CONFIRMED'
          AND ss.detected_at >= v_eval_time - (v_cov_policy.signal_freshness_days || ' days')::INTERVAL
          AND (ss.valid_until IS NULL OR ss.valid_until > v_eval_time)
    ) INTO v_has_fresh_signal;

    v_dimensions := v_dimensions || jsonb_build_array(
        jsonb_build_object('dimension_key', 'SIGNALS', 'coverage_status', CASE WHEN v_has_fresh_signal THEN 'KNOWN' ELSE 'UNKNOWN' END, 'sufficient_for_lifecycle', v_has_fresh_signal, 'details', '{}'::jsonb)
    );

    -- 8. Intent State (10P-B)
    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN 'UNKNOWN'
            WHEN bool_or(expires_at IS NOT NULL AND expires_at <= v_eval_time) THEN 'STALE'
            ELSE 'KNOWN'
        END,
        COALESCE(bool_or(intent_level IN ('MEDIUM', 'HIGH') AND intent_score >= v_lc_policy.min_intent_score AND (expires_at IS NULL OR expires_at > v_eval_time)), FALSE)
    INTO v_intent_status, v_intent_qualified
    FROM public.atlas_person_intent_state
    WHERE person_id = p_person_id AND tenant_id = p_tenant_id;

    v_dimensions := v_dimensions || jsonb_build_array(
        jsonb_build_object('dimension_key', 'INTENT_STATE', 'coverage_status', v_intent_status, 'sufficient_for_lifecycle', v_intent_qualified, 'details', '{}'::jsonb)
    );

    -- 9. Product Fit State (10P-C)
    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN 'UNKNOWN'
            WHEN bool_or(expires_at IS NOT NULL AND expires_at <= v_eval_time) THEN 'STALE'
            ELSE 'KNOWN'
        END,
        COALESCE(bool_or(fit_level IN ('MODERATE_FIT', 'STRONG_FIT') AND (expires_at IS NULL OR expires_at > v_eval_time)), FALSE)
    INTO v_fit_status, v_fit_qualified
    FROM public.atlas_person_product_fit_state
    WHERE person_id = p_person_id AND tenant_id = p_tenant_id;

    v_dimensions := v_dimensions || jsonb_build_array(
        jsonb_build_object('dimension_key', 'PRODUCT_FIT_STATE', 'coverage_status', v_fit_status, 'sufficient_for_lifecycle', v_fit_qualified, 'details', '{}'::jsonb)
    );

    -- 10. Channel Eligibility (10C) & Next Best Action (10D) via Subject Registry
    IF v_subject_id IS NOT NULL THEN
        SELECT 
            CASE 
                WHEN COUNT(*) = 0 THEN 'UNKNOWN'
                WHEN bool_or(expires_at IS NOT NULL AND expires_at <= v_eval_time) THEN 'STALE'
                ELSE 'KNOWN'
            END
        INTO v_10c_status
        FROM public.atlas_channel_eligibility
        WHERE subject_id = v_subject_id;

        SELECT 
            CASE 
                WHEN COUNT(*) = 0 THEN 'UNKNOWN'
                WHEN bool_or(expires_at IS NOT NULL AND expires_at <= v_eval_time) THEN 'STALE'
                ELSE 'KNOWN'
            END
        INTO v_10d_status
        FROM public.atlas_next_best_action_state
        WHERE subject_id = v_subject_id AND tenant_id = p_tenant_id;
    END IF;

    v_dimensions := v_dimensions || jsonb_build_array(
        jsonb_build_object('dimension_key', 'CHANNEL_ELIGIBILITY', 'coverage_status', v_10c_status, 'sufficient_for_lifecycle', (v_10c_status = 'KNOWN'), 'details', '{}'::jsonb),
        jsonb_build_object('dimension_key', 'NEXT_BEST_ACTION', 'coverage_status', v_10d_status, 'sufficient_for_lifecycle', (v_10d_status = 'KNOWN'), 'details', '{}'::jsonb)
    );

    -- 11. Evaluate Gaps and Authoritative Priorities
    -- Rules:
    -- OBSERVED: Blocker gaps (HIGH priority)
    IF v_person.lifecycle_stage = 'OBSERVED' THEN
        -- Identity Anchors Blocker
        IF v_stable_anchor_count < v_lc_policy.min_identity_anchors THEN
            v_gaps := v_gaps || jsonb_build_array(jsonb_build_object(
                'gap_key', 'IDENTITY_ANCHORS',
                'priority', 'HIGH',
                'reason', 'Insufficient stable identity anchors for promotion',
                'blocker_rule', 'min_identity_anchors',
                'consumer_dependency', 'atlas_lifecycle_policies'
            ));
        END IF;

        -- Attribute Evidence Blocker
        IF v_attr_evidence_count < v_lc_policy.min_attribute_evidence_count THEN
            v_gaps := v_gaps || jsonb_build_array(jsonb_build_object(
                'gap_key', 'ATTRIBUTE_EVIDENCE',
                'priority', 'HIGH',
                'reason', 'Insufficient attribute evidence count for promotion',
                'blocker_rule', 'min_attribute_evidence_count',
                'consumer_dependency', 'atlas_lifecycle_policies'
            ));
        END IF;

        -- Composite Signal OR Intent Gate
        IF NOT (v_has_fresh_signal OR v_intent_qualified) THEN
            v_gaps := v_gaps || jsonb_build_array(jsonb_build_object(
                'gap_key', 'DOMAIN_RELEVANCE',
                'priority', 'HIGH',
                'reason', 'Neither confirmed social signal nor qualified intent exists for promotion',
                'blocker_rule', 'require_signal_or_intent',
                'consumer_dependency', 'atlas_lifecycle_policies'
            ));
        END IF;
    END IF;

    -- CANONICAL gaps
    IF v_person.lifecycle_stage = 'CANONICAL' THEN
        -- Missing contact without active outreach queue -> priority NONE
        IF NOT v_has_email THEN
            v_gaps := v_gaps || jsonb_build_array(jsonb_build_object(
                'gap_key', 'EMAIL',
                'priority', 'NONE',
                'reason', 'Email unknown but no active campaign requires delivery',
                'blocker_rule', NULL,
                'consumer_dependency', NULL
            ));
        END IF;

        IF NOT v_has_phone THEN
            v_gaps := v_gaps || jsonb_build_array(jsonb_build_object(
                'gap_key', 'PHONE',
                'priority', 'NONE',
                'reason', 'Phone unknown but no active consumer requires telephony',
                'blocker_rule', NULL,
                'consumer_dependency', NULL
            ));
        END IF;

        -- Missing job title / company -> optional context for 10P-C -> LOW priority
        IF NOT v_has_job_title THEN
            v_gaps := v_gaps || jsonb_build_array(jsonb_build_object(
                'gap_key', 'JOB_TITLE',
                'priority', 'LOW',
                'reason', 'Job title missing for optimal product fit scoring',
                'blocker_rule', NULL,
                'consumer_dependency', '10P-C'
            ));
        END IF;

        IF NOT v_has_company THEN
            v_gaps := v_gaps || jsonb_build_array(jsonb_build_object(
                'gap_key', 'COMPANY',
                'priority', 'LOW',
                'reason', 'Company missing for optimal product fit scoring',
                'blocker_rule', NULL,
                'consumer_dependency', '10P-C'
            ));
        END IF;
    END IF;

    -- 12. Calculate COVERAGE_STATE_HASH (Deterministic JSON order)
    SELECT encode(digest(jsonb_build_object(
        'dimensions', v_dimensions,
        'gaps', v_gaps
    )::text, 'sha256'), 'hex') INTO v_coverage_state_hash;

    -- 13. State Persistence (CURRENT MODE ONLY: Must NEVER mutate if v_is_historical is TRUE)
    IF NOT v_is_historical THEN
        -- A. Update atlas_person_coverage_dimensions
        FOR v_dim_record IN SELECT * FROM jsonb_array_elements(v_dimensions) LOOP
            INSERT INTO public.atlas_person_coverage_dimensions (
                tenant_id,
                person_id,
                dimension_key,
                coverage_status,
                sufficient_for_lifecycle,
                details,
                last_evaluated_at,
                source_fact_set_hash,
                coverage_state_hash,
                updated_at
            ) VALUES (
                p_tenant_id,
                p_person_id,
                v_dim_record->>'dimension_key',
                (v_dim_record->>'coverage_status')::public.atlas_coverage_status,
                (v_dim_record->>'sufficient_for_lifecycle')::boolean,
                v_dim_record->'details',
                v_eval_time,
                v_source_fact_set_hash,
                v_coverage_state_hash,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (tenant_id, person_id, dimension_key) DO UPDATE SET
                coverage_status = EXCLUDED.coverage_status,
                sufficient_for_lifecycle = EXCLUDED.sufficient_for_lifecycle,
                details = EXCLUDED.details,
                last_evaluated_at = EXCLUDED.last_evaluated_at,
                source_fact_set_hash = EXCLUDED.source_fact_set_hash,
                coverage_state_hash = EXCLUDED.coverage_state_hash,
                updated_at = CURRENT_TIMESTAMP;
        END LOOP;

        -- B. Update atlas_person_gap_analysis (Clean previous gaps and insert current)
        DELETE FROM public.atlas_person_gap_analysis 
        WHERE person_id = p_person_id AND tenant_id = p_tenant_id;

        FOR v_gap_record IN SELECT * FROM jsonb_array_elements(v_gaps) LOOP
            INSERT INTO public.atlas_person_gap_analysis (
                tenant_id,
                person_id,
                gap_key,
                priority,
                reason,
                blocker_rule,
                consumer_dependency,
                last_evaluated_at,
                updated_at
            ) VALUES (
                p_tenant_id,
                p_person_id,
                v_gap_record->>'gap_key',
                (v_gap_record->>'priority')::public.atlas_gap_priority,
                v_gap_record->>'reason',
                v_gap_record->>'blocker_rule',
                v_gap_record->>'consumer_dependency',
                v_eval_time,
                CURRENT_TIMESTAMP
            ) ON CONFLICT (tenant_id, person_id, gap_key) DO UPDATE SET
                priority = EXCLUDED.priority,
                reason = EXCLUDED.reason,
                blocker_rule = EXCLUDED.blocker_rule,
                consumer_dependency = EXCLUDED.consumer_dependency,
                last_evaluated_at = EXCLUDED.last_evaluated_at,
                updated_at = CURRENT_TIMESTAMP;
        END LOOP;

        -- C. Synchronize Legacy Projection: public.atlas_person_coverage
        -- Updates ONLY existing audited columns; strictly preserves age_range_known
        INSERT INTO public.atlas_person_coverage (
            person_id,
            tenant_id,
            identity_known,
            location_known,
            email_known,
            phone_known,
            instagram_known,
            telegram_known,
            youtube_known,
            linkedin_known,
            occupation_known,
            last_updated_at
        ) VALUES (
            p_person_id,
            p_tenant_id,
            (v_ident_count > 0),
            (v_has_location OR v_has_city OR v_has_country),
            v_has_email,
            v_has_phone,
            v_has_instagram,
            v_has_telegram,
            v_has_youtube,
            v_has_linkedin,
            (v_has_profession OR v_has_job_title),
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (person_id) DO UPDATE SET
            identity_known = EXCLUDED.identity_known,
            location_known = EXCLUDED.location_known,
            email_known = EXCLUDED.email_known,
            phone_known = EXCLUDED.phone_known,
            instagram_known = EXCLUDED.instagram_known,
            telegram_known = EXCLUDED.telegram_known,
            youtube_known = EXCLUDED.youtube_known,
            linkedin_known = EXCLUDED.linkedin_known,
            occupation_known = EXCLUDED.occupation_known,
            last_updated_at = CURRENT_TIMESTAMP;
    END IF;

    -- 14. Snapshot Deduplication Contract
    -- Check most recent snapshot for this person
    SELECT * INTO v_last_snapshot 
    FROM public.atlas_person_coverage_snapshots
    WHERE person_id = p_person_id AND tenant_id = p_tenant_id
    ORDER BY created_at DESC LIMIT 1;

    v_should_snapshot := (
        p_force_snapshot = TRUE OR
        v_last_snapshot.snapshot_id IS NULL OR
        v_last_snapshot.source_fact_set_hash IS DISTINCT FROM v_source_fact_set_hash OR
        v_last_snapshot.coverage_state_hash IS DISTINCT FROM v_coverage_state_hash OR
        v_last_snapshot.coverage_policy_version IS DISTINCT FROM v_cov_policy.coverage_policy_version OR
        v_last_snapshot.lifecycle_policy_version IS DISTINCT FROM v_lc_policy.policy_version
    );

    IF v_should_snapshot THEN
        INSERT INTO public.atlas_person_coverage_snapshots (
            tenant_id,
            person_id,
            coverage_policy_version,
            lifecycle_policy_version,
            source_fact_set_hash,
            coverage_state_hash,
            dimensions_summary,
            as_of,
            evaluated_at,
            is_forced
        ) VALUES (
            p_tenant_id,
            p_person_id,
            v_cov_policy.coverage_policy_version,
            v_lc_policy.policy_version,
            v_source_fact_set_hash,
            v_coverage_state_hash,
            v_dimensions,
            v_eval_time,
            CURRENT_TIMESTAMP,
            p_force_snapshot
        );

        INSERT INTO public.atlas_person_gap_snapshots (
            tenant_id,
            person_id,
            coverage_policy_version,
            lifecycle_policy_version,
            source_fact_set_hash,
            coverage_state_hash,
            gaps_summary,
            as_of,
            evaluated_at,
            is_forced
        ) VALUES (
            p_tenant_id,
            p_person_id,
            v_cov_policy.coverage_policy_version,
            v_lc_policy.policy_version,
            v_source_fact_set_hash,
            v_coverage_state_hash,
            v_gaps,
            v_eval_time,
            CURRENT_TIMESTAMP,
            p_force_snapshot
        );
    END IF;

    -- Return evaluation summary payload
    RETURN jsonb_build_object(
        'person_id', p_person_id,
        'tenant_id', p_tenant_id,
        'lifecycle_stage', v_person.lifecycle_stage,
        'is_historical', v_is_historical,
        'as_of', v_eval_time,
        'source_fact_set_hash', v_source_fact_set_hash,
        'coverage_state_hash', v_coverage_state_hash,
        'snapshot_inserted', v_should_snapshot,
        'coverage_policy_version', v_cov_policy.coverage_policy_version,
        'lifecycle_policy_version', v_lc_policy.policy_version,
        'dimensions_count', jsonb_array_length(v_dimensions),
        'gaps_count', jsonb_array_length(v_gaps),
        'dimensions', v_dimensions,
        'gaps', v_gaps
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. AUTHENTICATED USER RPC (CURRENT COMPUTE ONLY - NO AS_OF PARAMETER)
CREATE OR REPLACE FUNCTION public.compute_person_coverage_v1(
    p_person_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID;
BEGIN
    v_tenant_id := (SELECT get_auth_tenant_id());
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Valid tenant JWT required';
    END IF;

    -- Validates tenant boundary and computes current coverage
    RETURN public.compute_person_coverage_system_v1(v_tenant_id, p_person_id, NULL, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.compute_person_coverage_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_person_coverage_v1(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.compute_person_coverage_system_v1(UUID, UUID, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_person_coverage_system_v1(UUID, UUID, TIMESTAMPTZ, BOOLEAN) TO service_role;

-- 11. BATCH MAINTENANCE RPC (CURRENT COMPUTE ONLY - SERVICE_ROLE)
CREATE OR REPLACE FUNCTION public.recompute_person_coverage_batch_v1(
    p_tenant_id UUID,
    p_limit INT DEFAULT 100
) RETURNS JSONB AS $$
DECLARE
    v_person RECORD;
    v_processed INT := 0;
    v_snapshots_created INT := 0;
    v_res JSONB;
BEGIN
    FOR v_person IN 
        SELECT person_id FROM public.atlas_people 
        WHERE tenant_id = p_tenant_id 
        ORDER BY created_at ASC 
        LIMIT p_limit 
    LOOP
        v_res := public.compute_person_coverage_system_v1(p_tenant_id, v_person.person_id, NULL, FALSE);
        v_processed := v_processed + 1;
        IF (v_res->>'snapshot_inserted')::boolean = TRUE THEN
            v_snapshots_created := v_snapshots_created + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'tenant_id', p_tenant_id,
        'limit', p_limit,
        'persons_processed', v_processed,
        'snapshots_created', v_snapshots_created
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.recompute_person_coverage_batch_v1(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_person_coverage_batch_v1(UUID, INT) TO service_role;

-- 12. ATOMIC POLICY SWITCHER (SERVICE_ROLE ONLY)
CREATE OR REPLACE FUNCTION public.activate_coverage_policy_v1(
    p_coverage_policy_version TEXT
) RETURNS VOID AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.atlas_person_coverage_policies WHERE coverage_policy_version = p_coverage_policy_version) THEN
        RAISE EXCEPTION 'POLICY_NOT_FOUND: Coverage policy version % does not exist', p_coverage_policy_version;
    END IF;

    UPDATE public.atlas_person_coverage_policies SET is_active = FALSE WHERE is_active = TRUE;
    UPDATE public.atlas_person_coverage_policies SET is_active = TRUE WHERE coverage_policy_version = p_coverage_policy_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.activate_coverage_policy_v1(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_coverage_policy_v1(TEXT) TO service_role;

-- 13. VIEW FOR DETAIL QUERYING
CREATE OR REPLACE VIEW public.v_atlas_person_coverage_detail AS
SELECT 
    d.tenant_id,
    d.person_id,
    p.full_name,
    p.lifecycle_stage,
    d.dimension_key,
    d.coverage_status,
    d.sufficient_for_lifecycle,
    d.details,
    d.last_evaluated_at,
    d.source_fact_set_hash,
    d.coverage_state_hash
FROM public.atlas_person_coverage_dimensions d
JOIN public.atlas_people p ON p.person_id = d.person_id AND p.tenant_id = d.tenant_id;

GRANT SELECT ON public.v_atlas_person_coverage_detail TO authenticated, service_role;
