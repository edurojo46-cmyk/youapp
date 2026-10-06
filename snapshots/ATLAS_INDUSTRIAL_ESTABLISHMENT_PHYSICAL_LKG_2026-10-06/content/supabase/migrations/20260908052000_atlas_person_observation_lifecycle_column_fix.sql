-- ====================================================================
-- Migration: 20260908052000_atlas_person_observation_lifecycle_column_fix.sql
-- Subsystem: Person Observation Lifecycle V1
-- Purpose: Fix column name source_candidate_id and NULL from_stage in promote_candidate_to_observed_v1
-- ====================================================================

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
