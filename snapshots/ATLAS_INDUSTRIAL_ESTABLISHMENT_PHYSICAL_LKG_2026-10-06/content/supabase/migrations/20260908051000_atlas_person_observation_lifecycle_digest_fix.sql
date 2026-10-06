-- ====================================================================
-- Migration: 20260908051000_atlas_person_observation_lifecycle_digest_fix.sql
-- Subsystem: Person Observation Lifecycle V1
-- Purpose: Schema-qualify extensions.digest and add extensions to search_path
--          for candidate ingestion and promotion functions.
-- ====================================================================

-- 1. Ingest from Browser UI (authenticated context)
CREATE OR REPLACE FUNCTION public.ingest_discovery_candidate_from_ui_v1(
    p_candidate_identity_key TEXT,
    p_source_type public.atlas_candidate_source_type,
    p_source_ref TEXT,
    p_source_authority TEXT,
    p_extracted_name TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'::jsonb,
    p_identifiers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_authority RECORD;
    v_policy RECORD;
    v_active_count INT;
    v_candidate_id UUID;
    v_canonical_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_ident JSONB;
    v_is_stable BOOLEAN;
    v_conf NUMERIC;
BEGIN
    v_tenant_id := public.get_auth_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: missing auth tenant context';
    END IF;

    -- Look up active policy fail-closed
    SELECT COUNT(*) INTO v_active_count FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;
    IF v_active_count = 0 THEN
        RAISE EXCEPTION 'NO_ACTIVE_LIFECYCLE_POLICY: Operation halted because zero active lifecycle policies exist';
    ELSIF v_active_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LIFECYCLE_POLICY: Operation halted because multiple active lifecycle policies exist';
    END IF;

    SELECT * INTO v_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;

    -- Look up authority
    SELECT * INTO v_authority
    FROM public.atlas_source_authority_registry
    WHERE source_type = p_source_type
      AND source_authority = p_source_authority
      AND is_active = TRUE;
      
    IF v_authority.authority_id IS NULL THEN
        RAISE EXCEPTION 'UNKNOWN_SOURCE_AUTHORITY: Source authority % not registered or inactive', p_source_authority;
    END IF;

    v_canonical_hash := pg_catalog.encode(extensions.digest(p_payload::TEXT, 'sha256'), 'hex');
    v_expires_at := NOW() + (v_policy.candidate_retention_days || ' days')::INTERVAL;

    -- Upsert candidate (replaying 100x updates count)
    INSERT INTO public.atlas_person_discovery_candidates (
        tenant_id,
        candidate_identity_key,
        source_type,
        source_ref,
        source_authority,
        access_authority,
        use_authority,
        source_payload_canonical_sha256,
        extracted_name,
        policy_version,
        expires_at
    ) VALUES (
        v_tenant_id,
        p_candidate_identity_key,
        p_source_type,
        p_source_ref,
        p_source_authority,
        v_authority.access_authority,
        v_authority.maximum_use_authority,
        v_canonical_hash,
        p_extracted_name,
        v_policy.policy_version,
        v_expires_at
    )
    ON CONFLICT (tenant_id, candidate_identity_key) DO UPDATE
    SET observation_count = atlas_person_discovery_candidates.observation_count + 1,
        last_seen_at = NOW(),
        updated_at = NOW()
    RETURNING candidate_id INTO v_candidate_id;

    -- Process identifiers
    FOR v_ident IN SELECT * FROM jsonb_array_elements(p_identifiers) LOOP
        -- Derive stability (caller cannot self-declare is_stable_anchor)
        IF (v_ident->>'identifier_type') IN ('EMAIL', 'PHONE', 'INSTAGRAM', 'X', 'YOUTUBE', 'LINKEDIN') 
           AND (v_ident->>'verification_status') IN ('VERIFIED', 'OBSERVED_DIRECT')
           AND v_authority.maximum_use_authority != 'DISCOVERY_ONLY' THEN
            v_is_stable := TRUE;
            v_conf := 0.90;
        ELSE
            v_is_stable := FALSE;
            v_conf := 0.50;
        END IF;

        INSERT INTO public.atlas_person_candidate_identifiers (
            tenant_id,
            candidate_id,
            identifier_type,
            normalized_value_hash,
            display_value,
            safe_value,
            is_stable_anchor,
            verification_status,
            confidence
        ) VALUES (
            v_tenant_id,
            v_candidate_id,
            (v_ident->>'identifier_type')::public.atlas_identifier_type,
            v_ident->>'normalized_value_hash',
            v_ident->>'display_value',
            v_ident->>'safe_value',
            v_is_stable,
            COALESCE(v_ident->>'verification_status', 'UNVERIFIED'),
            v_conf
        ) ON CONFLICT (tenant_id, candidate_id, identifier_type, normalized_value_hash) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
        'candidate_id', v_candidate_id,
        'status', 'STAGED',
        'use_authority', v_authority.maximum_use_authority
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_discovery_candidate_from_ui_v1 FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.ingest_discovery_candidate_from_ui_v1 TO authenticated;

-- 2. Ingest from Harvester Worker (service_role context with job lock)
CREATE OR REPLACE FUNCTION public.ingest_discovery_candidate_from_harvest_v1(
    p_job_id UUID,
    p_lock_token UUID,
    p_candidate_identity_key TEXT,
    p_source_ref TEXT,
    p_extracted_name TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'::jsonb,
    p_identifiers JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_queue RECORD;
    v_policy RECORD;
    v_active_count INT;
    v_candidate_id UUID;
    v_canonical_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_ident JSONB;
    v_is_stable BOOLEAN;
    v_conf NUMERIC;
BEGIN
    -- Authoritative validation of job and lock token
    SELECT * INTO v_queue
    FROM public.atlas_queues
    WHERE job_id = p_job_id
      AND lock_token = p_lock_token
      AND status = 'PROCESSING';
      
    IF v_queue.job_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_HARVEST_JOB: Invalid job or lock token';
    END IF;

    IF v_queue.tenant_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_JOB_TENANT: Harvester job has no tenant context';
    END IF;

    -- Look up active policy fail-closed
    SELECT COUNT(*) INTO v_active_count FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;
    IF v_active_count = 0 THEN
        RAISE EXCEPTION 'NO_ACTIVE_LIFECYCLE_POLICY: Operation halted because zero active lifecycle policies exist';
    ELSIF v_active_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LIFECYCLE_POLICY: Operation halted because multiple active lifecycle policies exist';
    END IF;

    SELECT * INTO v_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;

    v_canonical_hash := pg_catalog.encode(extensions.digest(p_payload::TEXT, 'sha256'), 'hex');
    v_expires_at := NOW() + (v_policy.candidate_retention_days || ' days')::INTERVAL;

    -- Upsert candidate
    INSERT INTO public.atlas_person_discovery_candidates (
        tenant_id,
        candidate_identity_key,
        source_type,
        source_ref,
        source_authority,
        access_authority,
        use_authority,
        source_payload_canonical_sha256,
        extracted_name,
        policy_version,
        expires_at
    ) VALUES (
        v_queue.tenant_id,
        p_candidate_identity_key,
        'WEB_HARVEST',
        p_source_ref,
        COALESCE(v_queue.source_authority, 'PUBLIC_WEB_CRAWL'),
        'PUBLIC_DATA',
        v_queue.use_authority,
        v_canonical_hash,
        p_extracted_name,
        v_policy.policy_version,
        v_expires_at
    )
    ON CONFLICT (tenant_id, candidate_identity_key) DO UPDATE
    SET observation_count = atlas_person_discovery_candidates.observation_count + 1,
        last_seen_at = NOW(),
        updated_at = NOW()
    RETURNING candidate_id INTO v_candidate_id;

    -- Process identifiers
    FOR v_ident IN SELECT * FROM jsonb_array_elements(p_identifiers) LOOP
        IF (v_ident->>'identifier_type') IN ('EMAIL', 'PHONE', 'INSTAGRAM', 'X', 'YOUTUBE', 'LINKEDIN') 
           AND (v_ident->>'verification_status') IN ('VERIFIED', 'OBSERVED_DIRECT')
           AND v_queue.use_authority != 'DISCOVERY_ONLY' THEN
            v_is_stable := TRUE;
            v_conf := 0.90;
        ELSE
            v_is_stable := FALSE;
            v_conf := 0.50;
        END IF;

        INSERT INTO public.atlas_person_candidate_identifiers (
            tenant_id,
            candidate_id,
            identifier_type,
            normalized_value_hash,
            display_value,
            safe_value,
            is_stable_anchor,
            verification_status,
            confidence
        ) VALUES (
            v_queue.tenant_id,
            v_candidate_id,
            (v_ident->>'identifier_type')::public.atlas_identifier_type,
            v_ident->>'normalized_value_hash',
            v_ident->>'display_value',
            v_ident->>'safe_value',
            v_is_stable,
            COALESCE(v_ident->>'verification_status', 'UNVERIFIED'),
            v_conf
        ) ON CONFLICT (tenant_id, candidate_id, identifier_type, normalized_value_hash) DO NOTHING;
    END LOOP;

    RETURN jsonb_build_object(
        'candidate_id', v_candidate_id,
        'tenant_id', v_queue.tenant_id,
        'status', 'STAGED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_discovery_candidate_from_harvest_v1 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_discovery_candidate_from_harvest_v1 TO service_role;

-- 3. Promote Candidate to OBSERVED (Deterministic Gate 1)
CREATE OR REPLACE FUNCTION public.promote_candidate_to_observed_v1(
    p_candidate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_cand RECORD;
    v_policy RECORD;
    v_active_count INT;
    v_person_id UUID;
    v_existing_person_id UUID;
    v_stable_anchor_count INT;
    v_ident_count INT;
    v_matched_person_ids UUID[];
    v_cause_hash TEXT;
    v_event_fp TEXT;
    v_id RECORD;
BEGIN
    -- Row lock candidate
    SELECT * INTO v_cand 
    FROM public.atlas_person_discovery_candidates 
    WHERE candidate_id = p_candidate_id
    FOR UPDATE;

    IF v_cand.candidate_id IS NULL THEN
        RAISE EXCEPTION 'CANDIDATE_NOT_FOUND';
    END IF;

    -- Check if already processed
    IF v_cand.candidate_status IN ('PROMOTED_NEW', 'ATTACHED_EXISTING') THEN
        RETURN jsonb_build_object(
            'status', 'ALREADY_PROCESSED',
            'person_id', v_cand.resolved_person_id
        );
    END IF;

    -- Check expiry
    IF v_cand.expires_at < NOW() THEN
        UPDATE public.atlas_person_discovery_candidates
        SET candidate_status = 'EXPIRED',
            resolution_outcome = 'EXPIRED',
            resolution_notes = 'Candidate retention expired',
            updated_at = NOW()
        WHERE candidate_id = p_candidate_id;
        
        RETURN jsonb_build_object(
            'status', 'REJECTED',
            'reason', 'REASON_CANDIDATE_EXPIRED'
        );
    END IF;

    -- Verify active policy count fail-closed
    SELECT COUNT(*) INTO v_active_count FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;
    IF v_active_count = 0 THEN
        RAISE EXCEPTION 'NO_ACTIVE_LIFECYCLE_POLICY: Promotion halted because zero active lifecycle policies exist';
    ELSIF v_active_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LIFECYCLE_POLICY: Promotion halted because multiple active lifecycle policies exist';
    END IF;

    SELECT * INTO v_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;

    -- Check Use Authority
    IF v_cand.use_authority = 'DISCOVERY_ONLY' THEN
        UPDATE public.atlas_person_discovery_candidates
        SET candidate_status = 'REJECTED',
            resolution_outcome = 'REJECTED',
            resolution_notes = 'Use authority DISCOVERY_ONLY prohibits person persistence',
            updated_at = NOW()
        WHERE candidate_id = p_candidate_id;
        
        RETURN jsonb_build_object(
            'status', 'REJECTED',
            'reason', 'REASON_INSUFFICIENT_USE_AUTHORITY'
        );
    END IF;

    -- Evaluate identity anchors
    SELECT 
        COUNT(*) FILTER (WHERE is_stable_anchor = TRUE),
        COUNT(*)
    INTO v_stable_anchor_count, v_ident_count
    FROM public.atlas_person_candidate_identifiers
    WHERE candidate_id = p_candidate_id;

    -- Gate 1: Name-only rejection
    IF v_ident_count = 0 THEN
        UPDATE public.atlas_person_discovery_candidates
        SET candidate_status = 'AMBIGUOUS',
            resolution_outcome = 'AMBIGUOUS',
            resolution_notes = 'Name only resolution is not safe without identifiers',
            updated_at = NOW()
        WHERE candidate_id = p_candidate_id;

        RETURN jsonb_build_object(
            'status', 'AMBIGUOUS',
            'reason', 'REASON_NAME_ONLY_INSUFFICIENT'
        );
    END IF;

    IF v_stable_anchor_count < v_policy.min_identity_anchors THEN
        UPDATE public.atlas_person_discovery_candidates
        SET candidate_status = 'AMBIGUOUS',
            resolution_outcome = 'AMBIGUOUS',
            resolution_notes = 'Missing required stable identity anchor',
            updated_at = NOW()
        WHERE candidate_id = p_candidate_id;

        RETURN jsonb_build_object(
            'status', 'AMBIGUOUS',
            'reason', 'REASON_MISSING_STABLE_ANCHOR'
        );
    END IF;

    -- Resolve against existing person identifiers
    SELECT ARRAY_AGG(DISTINCT pi.person_id)
    INTO v_matched_person_ids
    FROM public.atlas_person_candidate_identifiers ci
    JOIN public.atlas_person_identifiers pi 
      ON pi.tenant_id = v_cand.tenant_id 
     AND pi.identifier_type = ci.identifier_type 
     AND pi.normalized_value_hash = ci.normalized_value_hash
    WHERE ci.candidate_id = p_candidate_id;

    IF ARRAY_LENGTH(v_matched_person_ids, 1) > 1 THEN
        -- CONFLICT: maps to multiple distinct persons
        UPDATE public.atlas_person_discovery_candidates
        SET candidate_status = 'CONFLICT',
            resolution_outcome = 'CONFLICT',
            resolution_notes = 'Candidate mapped to multiple distinct persons: ' || ARRAY_TO_STRING(v_matched_person_ids, ','),
            updated_at = NOW()
        WHERE candidate_id = p_candidate_id;

        RETURN jsonb_build_object(
            'status', 'CONFLICT',
            'reason', 'REASON_RESOLVER_CONFLICT'
        );
    ELSIF ARRAY_LENGTH(v_matched_person_ids, 1) = 1 THEN
        -- ATTACH TO EXISTING PERSON (0 new people created)
        v_existing_person_id := v_matched_person_ids[1];

        -- Attach identifiers
        FOR v_id IN SELECT * FROM public.atlas_person_candidate_identifiers WHERE candidate_id = p_candidate_id LOOP
            INSERT INTO public.atlas_person_identifiers (
                tenant_id,
                person_id,
                identifier_type,
                normalized_value_hash,
                display_value,
                safe_value,
                verification_status
            ) VALUES (
                v_cand.tenant_id,
                v_existing_person_id,
                v_id.identifier_type,
                v_id.normalized_value_hash,
                v_id.display_value,
                v_id.safe_value,
                v_id.verification_status
            ) ON CONFLICT (tenant_id, identifier_type, normalized_value_hash) DO NOTHING;
        END LOOP;

        UPDATE public.atlas_person_discovery_candidates
        SET candidate_status = 'ATTACHED_EXISTING',
            resolution_outcome = 'RESOLVED',
            resolved_person_id = v_existing_person_id,
            updated_at = NOW()
        WHERE candidate_id = p_candidate_id;

        RETURN jsonb_build_object(
            'status', 'ATTACHED_EXISTING',
            'person_id', v_existing_person_id,
            'reason', 'REASON_ATTACHED_TO_EXISTING_PERSON'
        );
    ELSE
        -- CREATE NEW OBSERVED PERSON (explicitly OBSERVED, never default)
        INSERT INTO public.atlas_people (
            tenant_id,
            full_name,
            status,
            lifecycle_stage
        ) VALUES (
            v_cand.tenant_id,
            v_cand.extracted_name,
            'ACTIVE',
            'OBSERVED'
        ) RETURNING person_id INTO v_person_id;

        -- Attach candidate identifiers to new person
        FOR v_id IN SELECT * FROM public.atlas_person_candidate_identifiers WHERE candidate_id = p_candidate_id LOOP
            INSERT INTO public.atlas_person_identifiers (
                tenant_id,
                person_id,
                identifier_type,
                normalized_value_hash,
                display_value,
                safe_value,
                verification_status
            ) VALUES (
                v_cand.tenant_id,
                v_person_id,
                v_id.identifier_type,
                v_id.normalized_value_hash,
                v_id.display_value,
                v_id.safe_value,
                v_id.verification_status
            ) ON CONFLICT (tenant_id, identifier_type, normalized_value_hash) DO NOTHING;
        END LOOP;

        -- Create coverage record
        INSERT INTO public.atlas_person_coverage (
            person_id,
            tenant_id,
            identity_known,
            email_known,
            phone_known
        ) VALUES (
            v_person_id,
            v_cand.tenant_id,
            TRUE,
            EXISTS (SELECT 1 FROM public.atlas_person_candidate_identifiers WHERE candidate_id = p_candidate_id AND identifier_type = 'EMAIL'),
            EXISTS (SELECT 1 FROM public.atlas_person_candidate_identifiers WHERE candidate_id = p_candidate_id AND identifier_type = 'PHONE')
        ) ON CONFLICT (person_id) DO NOTHING;

        -- Emit lifecycle ledger event
        v_cause_hash := pg_catalog.encode(extensions.digest(p_candidate_id::TEXT || ':' || v_cand.source_payload_canonical_sha256, 'sha256'), 'hex');
        v_event_fp := pg_catalog.encode(extensions.digest(
            v_cand.tenant_id::TEXT || ':' ||
            v_person_id::TEXT || ':NONE:OBSERVED:' ||
            v_policy.policy_version || ':REASON_ANCHOR_IDENTIFIER_RESOLVED:' ||
            v_cause_hash,
            'sha256'
        ), 'hex');

        INSERT INTO public.atlas_person_lifecycle_events (
            tenant_id,
            person_id,
            from_stage,
            to_stage,
            source_candidate_id,
            reason_codes,
            policy_version,
            event_fingerprint
        ) VALUES (
            v_cand.tenant_id,
            v_person_id,
            NULL,
            'OBSERVED',
            p_candidate_id,
            ARRAY['REASON_ANCHOR_IDENTIFIER_RESOLVED'],
            v_policy.policy_version,
            v_event_fp
        ) ON CONFLICT (tenant_id, person_id, to_stage, event_fingerprint) DO NOTHING;

        UPDATE public.atlas_person_discovery_candidates
        SET candidate_status = 'PROMOTED_NEW',
            resolution_outcome = 'RESOLVED',
            resolved_person_id = v_person_id,
            updated_at = NOW()
        WHERE candidate_id = p_candidate_id;

        RETURN jsonb_build_object(
            'status', 'PROMOTED_NEW',
            'person_id', v_person_id,
            'reason', 'REASON_ANCHOR_IDENTIFIER_RESOLVED'
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_candidate_to_observed_v1 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_candidate_to_observed_v1 TO authenticated, service_role;

-- 4. Promote OBSERVED to CANONICAL (Deterministic Gate 2)
CREATE OR REPLACE FUNCTION public.promote_observed_to_canonical_v1(
    p_person_id UUID,
    p_reason_override TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_person RECORD;
    v_policy RECORD;
    v_active_count INT;
    v_ev_count INT;
    v_has_signal BOOLEAN := FALSE;
    v_has_intent BOOLEAN := FALSE;
    v_reasons TEXT[] := '{}';
    v_evidence_refs JSONB := '[]'::jsonb;
    v_cause_hash TEXT;
    v_event_fp TEXT;
BEGIN
    -- Row lock person
    SELECT * INTO v_person
    FROM public.atlas_people
    WHERE person_id = p_person_id
    FOR UPDATE;

    IF v_person.person_id IS NULL THEN
        RAISE EXCEPTION 'PERSON_NOT_FOUND';
    END IF;

    IF v_person.lifecycle_stage = 'CANONICAL' THEN
        RETURN jsonb_build_object(
            'status', 'ALREADY_CANONICAL',
            'person_id', p_person_id
        );
    END IF;

    -- Verify active policy count fail-closed
    SELECT COUNT(*) INTO v_active_count FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;
    IF v_active_count = 0 THEN
        RAISE EXCEPTION 'NO_ACTIVE_LIFECYCLE_POLICY: Promotion halted because zero active lifecycle policies exist';
    ELSIF v_active_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_LIFECYCLE_POLICY: Promotion halted because multiple active lifecycle policies exist';
    END IF;

    SELECT * INTO v_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE;

    -- 1. Evidence sufficiency check
    SELECT COUNT(*)
    INTO v_ev_count
    FROM public.atlas_person_attribute_evidence
    WHERE person_id = p_person_id
      AND tenant_id = v_person.tenant_id
      AND confidence >= v_policy.min_attribute_confidence
      AND (valid_until IS NULL OR valid_until > NOW());

    IF v_ev_count < v_policy.min_attribute_evidence_count THEN
        RETURN jsonb_build_object(
            'status', 'DENIED',
            'reason', 'REASON_EVIDENCE_SUFFICIENCY_INSUFFICIENT'
        );
    END IF;
    v_reasons := ARRAY_APPEND(v_reasons, 'REASON_EVIDENCE_SUFFICIENCY_MET');

    -- 2. Domain Relevance check (strictly 10B signal OR 10P-B intent)
    -- 2A. 10B Confirmed Signal within freshness window and unexpired
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_social_signals ss
        WHERE ss.canonical_entity_type = 'PERSON'
          AND ss.canonical_entity_id = p_person_id
          AND ss.status = 'CONFIRMED'
          AND ss.detected_at >= NOW() - (v_policy.signal_freshness_days || ' days')::INTERVAL
          AND ss.valid_until > NOW()
    ) INTO v_has_signal;

    -- 2B. 10P-B Qualified Intent (exact canonical enum values: MEDIUM, HIGH)
    SELECT EXISTS (
        SELECT 1 FROM public.atlas_person_intent_state it
        WHERE it.person_id = p_person_id
          AND it.tenant_id = v_person.tenant_id
          AND it.intent_level IN ('MEDIUM', 'HIGH')
          AND it.intent_score >= v_policy.min_intent_score
          AND (it.expires_at IS NULL OR it.expires_at > NOW())
    ) INTO v_has_intent;

    IF v_has_signal THEN
        v_reasons := ARRAY_APPEND(v_reasons, 'REASON_DOMAIN_RELEVANCE_SIGNAL_ACTIVE');
    END IF;
    
    IF v_has_intent THEN
        v_reasons := ARRAY_APPEND(v_reasons, 'REASON_INTENT_THRESHOLD_EXCEEDED');
    END IF;

    IF NOT (v_has_signal OR v_has_intent) THEN
        RETURN jsonb_build_object(
            'status', 'DENIED',
            'reason', 'REASON_RELEVANCE_INSUFFICIENT'
        );
    END IF;

    -- Collect evidence refs
    SELECT COALESCE(jsonb_agg(evidence_id::TEXT), '[]'::jsonb)
    INTO v_evidence_refs
    FROM public.atlas_person_attribute_evidence
    WHERE person_id = p_person_id
      AND tenant_id = v_person.tenant_id
      AND confidence >= v_policy.min_attribute_confidence
      AND (valid_until IS NULL OR valid_until > NOW());

    -- Promote to CANONICAL
    UPDATE public.atlas_people
    SET lifecycle_stage = 'CANONICAL',
        updated_at = NOW()
    WHERE person_id = p_person_id;

    -- Compute causal event fingerprint
    v_cause_hash := pg_catalog.encode(extensions.digest(v_evidence_refs::TEXT || ':' || ARRAY_TO_STRING(v_reasons, ','), 'sha256'), 'hex');
    v_event_fp := pg_catalog.encode(extensions.digest(
        v_person.tenant_id::TEXT || ':' ||
        p_person_id::TEXT || ':OBSERVED:CANONICAL:' ||
        v_policy.policy_version || ':' ||
        ARRAY_TO_STRING(v_reasons, ',') || ':' ||
        v_cause_hash,
        'sha256'
    ), 'hex');

    -- Insert into immutable lifecycle ledger
    INSERT INTO public.atlas_person_lifecycle_events (
        tenant_id,
        person_id,
        from_stage,
        to_stage,
        reason_codes,
        policy_version,
        evidence_refs,
        event_fingerprint
    ) VALUES (
        v_person.tenant_id,
        p_person_id,
        'OBSERVED',
        'CANONICAL',
        v_reasons,
        v_policy.policy_version,
        v_evidence_refs,
        v_event_fp
    ) ON CONFLICT (tenant_id, person_id, to_stage, event_fingerprint) DO NOTHING;

    RETURN jsonb_build_object(
        'status', 'PROMOTED_CANONICAL',
        'person_id', p_person_id,
        'reasons', v_reasons
    );
END;
$$;

REVOKE ALL ON FUNCTION public.promote_observed_to_canonical_v1 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_observed_to_canonical_v1 TO authenticated, service_role;
