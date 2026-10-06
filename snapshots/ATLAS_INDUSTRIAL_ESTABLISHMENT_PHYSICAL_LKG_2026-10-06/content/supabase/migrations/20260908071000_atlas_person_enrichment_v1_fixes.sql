-- ============================================================================
-- MIGRATION: 20260908071000_atlas_person_enrichment_v1_fixes.sql
-- Subsystem: Person Enrichment V1
-- Fixes:
--   1. plan_person_enrichment_v1 includes acquisition_key in existing mission return
--   2. record_enrichment_resolution_v1 inserts TITLE alongside JOB_TITLE for 060000 coverage compatibility
-- ============================================================================

-- 1. UPDATE PLAN RPC
CREATE OR REPLACE FUNCTION public.plan_person_enrichment_v1(
    p_tenant_id UUID,
    p_person_id UUID,
    p_gap_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_person RECORD;
    v_gap RECORD;
    v_cov_dim RECORD;
    v_cov_policy RECORD;
    v_lc_policy RECORD;
    v_enrich_policy RECORD;
    
    v_active_enrich_count INT;
    v_input_hash TEXT;
    v_acquisition_key TEXT := NULL;
    v_required_use_authority public.atlas_use_authority;
    
    v_capability RECORD;
    v_cap_snapshot_hash TEXT;
    v_existing_mission RECORD;
    v_mission_id UUID;
    v_last_attempt RECORD;
    v_cooldown_hours INT;
    v_next_eligible_at TIMESTAMPTZ := NULL;
    v_attempts_so_far INT := 0;
BEGIN
    -- Advisory lock on person and gap
    PERFORM pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_person_id::text));
    
    -- 1. Validate person exists and get lifecycle stage
    SELECT * INTO v_person 
    FROM public.atlas_people 
    WHERE tenant_id = p_tenant_id AND person_id = p_person_id;
    
    IF v_person.person_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'PERSON_NOT_FOUND');
    END IF;
    
    -- 2. Verify active policies fail-closed
    SELECT COUNT(*) INTO v_active_enrich_count FROM public.atlas_person_enrichment_policies WHERE is_active = TRUE;
    IF v_active_enrich_count = 0 THEN
        RAISE EXCEPTION 'NO_ACTIVE_ENRICHMENT_POLICY: Operation halted because zero active enrichment policies exist';
    ELSIF v_active_enrich_count > 1 THEN
        RAISE EXCEPTION 'AMBIGUOUS_ACTIVE_ENRICHMENT_POLICY: Operation halted because multiple active enrichment policies exist';
    END IF;
    SELECT * INTO v_enrich_policy FROM public.atlas_person_enrichment_policies WHERE is_active = TRUE;
    
    SELECT * INTO v_cov_policy FROM public.atlas_person_coverage_policies WHERE is_active = TRUE LIMIT 1;
    SELECT * INTO v_lc_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE LIMIT 1;
    
    -- 3. Coverage Recompute CURRENT to ensure fresh gap state
    PERFORM public.compute_person_coverage_system_v1(p_tenant_id, p_person_id);
    
    -- 4. Read exact current gap
    SELECT * INTO v_gap
    FROM public.atlas_person_gap_analysis
    WHERE tenant_id = p_tenant_id AND person_id = p_person_id AND gap_key = p_gap_key;
    
    IF v_gap.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'GAP_DOES_NOT_EXIST');
    END IF;
    
    -- Explicit priority check: Never compare enum magnitude
    IF v_gap.priority = 'NONE'::public.atlas_gap_priority THEN
        RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'REASON_PRIORITY_NONE');
    END IF;
    
    -- 5. Scope filter: Check V1 supported gap keys
    IF p_gap_key NOT IN ('JOB_TITLE', 'COMPANY', 'ATTRIBUTE_EVIDENCE') THEN
        RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'REASON_UNSUPPORTED_GAP');
    END IF;
    
    -- 6. Resolve Acquisition Key
    IF p_gap_key = 'JOB_TITLE' THEN
        v_acquisition_key := 'JOB_TITLE';
    ELSIF p_gap_key = 'COMPANY' THEN
        v_acquisition_key := 'COMPANY';
    ELSIF p_gap_key = 'ATTRIBUTE_EVIDENCE' THEN
        -- Deterministic priority order based strictly on atlas_person_coverage_dimensions
        -- Must be UNKNOWN or STALE
        IF EXISTS (SELECT 1 FROM public.atlas_person_coverage_dimensions WHERE tenant_id = p_tenant_id AND person_id = p_person_id AND dimension_key = 'JOB_TITLE' AND coverage_status IN ('UNKNOWN', 'STALE')) THEN
            v_acquisition_key := 'JOB_TITLE';
        ELSIF EXISTS (SELECT 1 FROM public.atlas_person_coverage_dimensions WHERE tenant_id = p_tenant_id AND person_id = p_person_id AND dimension_key = 'COMPANY' AND coverage_status IN ('UNKNOWN', 'STALE')) THEN
            v_acquisition_key := 'COMPANY';
        ELSIF EXISTS (SELECT 1 FROM public.atlas_person_coverage_dimensions WHERE tenant_id = p_tenant_id AND person_id = p_person_id AND dimension_key = 'PROFESSION' AND coverage_status IN ('UNKNOWN', 'STALE')) THEN
            v_acquisition_key := 'PROFESSION';
        ELSIF EXISTS (SELECT 1 FROM public.atlas_person_coverage_dimensions WHERE tenant_id = p_tenant_id AND person_id = p_person_id AND dimension_key = 'CITY' AND coverage_status IN ('UNKNOWN', 'STALE')) THEN
            v_acquisition_key := 'CITY';
        ELSE
            RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'REASON_NO_ELIGIBLE_ACQUISITION_DIMENSION');
        END IF;
    END IF;
    
    -- 7. Sensitive data hard deny
    IF v_acquisition_key IN ('POLITICS', 'RELIGION', 'HEALTH', 'RACE', 'ETHNICITY', 'SEXUAL_ORIENTATION', 'CRIMINAL', 'UNION', 'WEALTH', 'AFFORDABILITY') THEN
        RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'REASON_SENSITIVE_DIMENSION_DENIED');
    END IF;
    
    -- 8. Required use authority based on target person lifecycle stage
    IF v_person.lifecycle_stage = 'CANONICAL' THEN
        v_required_use_authority := 'CANONICAL_ALLOWED';
    ELSE
        v_required_use_authority := 'OBSERVATION_ALLOWED';
    END IF;
    
    -- 9. Fetch coverage state hash from coverage dimensions
    SELECT coverage_state_hash INTO v_cov_dim
    FROM public.atlas_person_coverage_dimensions
    WHERE tenant_id = p_tenant_id AND person_id = p_person_id
    LIMIT 1;
    
    -- Compute canonical input hash
    v_input_hash := public.compute_enrichment_input_hash_v1(
        p_tenant_id,
        p_person_id,
        v_gap.gap_key,
        v_gap.priority,
        v_gap.reason,
        v_gap.blocker_rule,
        v_gap.consumer_dependency,
        COALESCE(v_cov_dim.coverage_state_hash, 'INITIAL_COVERAGE'),
        v_cov_policy.coverage_policy_version,
        v_lc_policy.policy_version
    );
    
    -- 10. Check if active mission already exists
    SELECT * INTO v_existing_mission
    FROM public.atlas_person_enrichment_missions
    WHERE tenant_id = p_tenant_id AND enrichment_input_hash = v_input_hash
      AND status IN ('PLANNED', 'AUTHORIZED', 'DISPATCHED', 'OBSERVATION_RECEIVED', 'RESOLUTION_PENDING');
      
    IF v_existing_mission.mission_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', v_existing_mission.status,
            'mission_id', v_existing_mission.mission_id,
            'acquisition_key', v_existing_mission.acquisition_key,
            'max_cost', v_existing_mission.max_cost,
            'is_existing', true
        );
    END IF;
    
    -- 11. Check anti-loop history and cooldown
    SELECT * INTO v_last_attempt
    FROM public.atlas_person_enrichment_missions
    WHERE tenant_id = p_tenant_id AND person_id = p_person_id AND gap_key = p_gap_key
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF v_last_attempt.mission_id IS NOT NULL THEN
        v_attempts_so_far := v_last_attempt.attempt_count;
        
        IF v_last_attempt.status = 'EXHAUSTED' THEN
            RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'REASON_ATTEMPTS_EXHAUSTED');
        END IF;
        
        IF v_last_attempt.next_eligible_at IS NOT NULL AND v_last_attempt.next_eligible_at > NOW() THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'NO_ENRICHMENT',
                'reason', 'REASON_ON_COOLDOWN',
                'next_eligible_at', v_last_attempt.next_eligible_at
            );
        END IF;
    END IF;
    
    -- 12. Find eligible source capability
    SELECT c.*, a.maximum_use_authority, s.status AS source_status, a.is_active AS authority_active
    INTO v_capability
    FROM public.atlas_person_enrichment_source_capabilities c
    JOIN public.atlas_sources s ON s.source_id = c.source_id
    JOIN public.atlas_source_authority_registry a ON a.authority_id = c.authority_id
    WHERE c.supported_gap_key = p_gap_key
      AND c.acquisition_key = v_acquisition_key
      AND c.is_enabled = TRUE
      AND s.status = 'ACTIVE'
      AND a.is_active = TRUE
      AND public.get_use_authority_rank(a.maximum_use_authority) >= public.get_use_authority_rank(v_required_use_authority)
    ORDER BY c.cost_per_query ASC, c.expected_latency_ms ASC
    LIMIT 1;
    
    IF v_capability.capability_id IS NULL THEN
        IF EXISTS (
            SELECT 1 
            FROM public.atlas_person_enrichment_source_capabilities c
            JOIN public.atlas_source_authority_registry a ON a.authority_id = c.authority_id
            WHERE c.supported_gap_key = p_gap_key AND c.acquisition_key = v_acquisition_key
              AND public.get_use_authority_rank(a.maximum_use_authority) < public.get_use_authority_rank(v_required_use_authority)
        ) THEN
            RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'REASON_INSUFFICIENT_USE_AUTHORITY');
        END IF;
        
        RETURN jsonb_build_object('success', false, 'status', 'NO_ENRICHMENT', 'reason', 'REASON_NO_AUTHORIZED_SOURCE');
    END IF;
    
    -- Compute capability snapshot hash
    v_cap_snapshot_hash := public.compute_capability_snapshot_hash_v1(
        v_capability.capability_id,
        v_capability.source_id,
        v_capability.authority_id,
        v_capability.supported_gap_key,
        v_capability.acquisition_key,
        v_capability.cost_per_query,
        v_capability.maximum_use_authority,
        v_capability.is_enabled
    );
    
    -- 13. Create Planned Mission
    INSERT INTO public.atlas_person_enrichment_missions (
        tenant_id,
        person_id,
        gap_key,
        acquisition_key,
        gap_priority,
        consumer_reason,
        enrichment_input_hash,
        capability_snapshot_hash,
        enrichment_policy_version,
        required_use_authority,
        selected_capability_id,
        selected_source_id,
        authority_id,
        status,
        max_cost,
        timeout_seconds,
        attempt_count,
        coverage_state_hash_before
    ) VALUES (
        p_tenant_id,
        p_person_id,
        p_gap_key,
        v_acquisition_key,
        v_gap.priority,
        v_gap.reason,
        v_input_hash,
        v_cap_snapshot_hash,
        v_enrich_policy.enrichment_policy_version,
        v_required_use_authority,
        v_capability.capability_id,
        v_capability.source_id,
        v_capability.authority_id,
        'PLANNED',
        v_capability.cost_per_query,
        v_enrich_policy.default_timeout_seconds,
        v_attempts_so_far + 1,
        v_cov_dim.coverage_state_hash
    ) RETURNING mission_id INTO v_mission_id;
    
    -- Append-Only Audit Event
    INSERT INTO public.atlas_person_enrichment_events (
        tenant_id,
        mission_id,
        event_type,
        to_status,
        details
    ) VALUES (
        p_tenant_id,
        v_mission_id,
        'MISSION_PLANNED',
        'PLANNED',
        jsonb_build_object(
            'gap_key', p_gap_key,
            'acquisition_key', v_acquisition_key,
            'cost', v_capability.cost_per_query,
            'source_id', v_capability.source_id,
            'input_hash', v_input_hash
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'status', 'PLANNED',
        'mission_id', v_mission_id,
        'acquisition_key', v_acquisition_key,
        'max_cost', v_capability.cost_per_query
    );
END;
$$;

-- 2. UPDATE RECORD RESOLUTION RPC
CREATE OR REPLACE FUNCTION public.record_enrichment_resolution_v1(
    p_mission_id UUID,
    p_candidate_id UUID,
    p_resolution_outcome TEXT,
    p_resolved_person_id UUID,
    p_acquired_value TEXT,
    p_resolution_notes TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_mission RECORD;
    v_cand RECORD;
    v_norm_value TEXT;
BEGIN
    SELECT * INTO v_mission 
    FROM public.atlas_person_enrichment_missions 
    WHERE mission_id = p_mission_id 
    FOR UPDATE;
    
    IF v_mission.mission_id IS NULL THEN
        RAISE EXCEPTION 'MISSION_NOT_FOUND';
    END IF;
    
    SELECT * INTO v_cand
    FROM public.atlas_person_discovery_candidates
    WHERE candidate_id = p_candidate_id AND tenant_id = v_mission.tenant_id;
    
    IF v_cand.candidate_id IS NULL THEN
        RAISE EXCEPTION 'CANDIDATE_NOT_FOUND_FOR_TENANT';
    END IF;
    
    -- CASE 1: RESOLVER RETURNED RESOLVED
    IF p_resolution_outcome = 'RESOLVED' THEN
        -- Check Target Mismatch: Did it resolve to the target person?
        IF p_resolved_person_id = v_mission.person_id THEN
            -- EXACT TARGET RESOLUTION: ONE MISSION = ONE AUTHORIZED ACQUISITION SIDE EFFECT
            -- Attach ONLY the authorized acquisition_key attribute evidence to target person
            v_norm_value := TRIM(UPPER(p_acquired_value));
            
            INSERT INTO public.atlas_person_attribute_evidence (
                tenant_id,
                person_id,
                attribute_key,
                normalized_value,
                assertion_type,
                confidence,
                source_ref
            ) VALUES (
                v_mission.tenant_id,
                v_mission.person_id,
                v_mission.acquisition_key,
                v_norm_value,
                'OBSERVED',
                0.90,
                'ENRICHMENT_V1:' || v_cand.source_ref
            );
            
            -- If acquisition_key is JOB_TITLE, also insert TITLE for 060000 Coverage engine compatibility
            IF v_mission.acquisition_key = 'JOB_TITLE' THEN
                INSERT INTO public.atlas_person_attribute_evidence (
                    tenant_id,
                    person_id,
                    attribute_key,
                    normalized_value,
                    assertion_type,
                    confidence,
                    source_ref
                ) VALUES (
                    v_mission.tenant_id,
                    v_mission.person_id,
                    'TITLE',
                    v_norm_value,
                    'OBSERVED',
                    0.90,
                    'ENRICHMENT_V1:' || v_cand.source_ref
                );
            END IF;
            
            -- Update candidate status
            UPDATE public.atlas_person_discovery_candidates
            SET candidate_status = 'ATTACHED_EXISTING',
                resolution_outcome = 'RESOLVED',
                resolved_person_id = v_mission.person_id,
                updated_at = NOW()
            WHERE candidate_id = p_candidate_id;
            
            -- Update mission state to ATTACHED
            UPDATE public.atlas_person_enrichment_missions
            SET status = 'ATTACHED',
                identity_resolution_status = 'RESOLVED',
                attachment_status = 'ATTACHED',
                completed_at = NOW()
            WHERE mission_id = p_mission_id;
            
            INSERT INTO public.atlas_person_enrichment_events (tenant_id, mission_id, event_type, from_status, to_status, identity_resolution_status, attachment_status, details)
            VALUES (v_mission.tenant_id, p_mission_id, 'EVIDENCE_ATTACHED', 'RESOLUTION_PENDING', 'ATTACHED', 'RESOLVED', 'ATTACHED', jsonb_build_object('acquisition_key', v_mission.acquisition_key, 'value', v_norm_value));
            
            RETURN jsonb_build_object('success', true, 'status', 'ATTACHED', 'person_id', v_mission.person_id);
        ELSE
            -- TARGET MISMATCH: Identity resolved to a different person B!
            -- INVARIANT: Must NOT mutate person B, and must NOT attach to mission person A!
            UPDATE public.atlas_person_discovery_candidates
            SET candidate_status = 'REJECTED',
                resolution_outcome = 'RESOLVED',
                resolution_notes = 'TARGET_MISMATCH: Resolved to ' || p_resolved_person_id::text || ' but mission target was ' || v_mission.person_id::text,
                updated_at = NOW()
            WHERE candidate_id = p_candidate_id;
            
            UPDATE public.atlas_person_enrichment_missions
            SET status = 'UNRESOLVED',
                terminal_reason = 'REASON_TARGET_MISMATCH',
                identity_resolution_status = 'RESOLVED',
                attachment_status = 'TARGET_MISMATCH',
                gap_resolution_status = 'GAP_UNRESOLVED',
                completed_at = NOW()
            WHERE mission_id = p_mission_id;
            
            INSERT INTO public.atlas_person_enrichment_events (tenant_id, mission_id, event_type, from_status, to_status, identity_resolution_status, attachment_status, details)
            VALUES (v_mission.tenant_id, p_mission_id, 'TARGET_MISMATCH_RECORDED', 'RESOLUTION_PENDING', 'UNRESOLVED', 'RESOLVED', 'TARGET_MISMATCH', jsonb_build_object('resolved_person_id', p_resolved_person_id, 'target_person_id', v_mission.person_id));
            
            RETURN jsonb_build_object('success', true, 'status', 'UNRESOLVED', 'attachment_status', 'TARGET_MISMATCH');
        END IF;
    ELSIF p_resolution_outcome = 'AMBIGUOUS' THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'AMBIGUOUS',
            terminal_reason = 'REASON_RESOLVER_AMBIGUOUS',
            identity_resolution_status = 'AMBIGUOUS',
            attachment_status = 'UNATTACHED',
            gap_resolution_status = 'GAP_UNRESOLVED',
            completed_at = NOW()
        WHERE mission_id = p_mission_id;
        
        RETURN jsonb_build_object('success', true, 'status', 'AMBIGUOUS');
    ELSIF p_resolution_outcome = 'CONFLICT' THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'CONFLICT',
            terminal_reason = 'REASON_RESOLVER_CONFLICT',
            identity_resolution_status = 'CONFLICT',
            attachment_status = 'UNATTACHED',
            gap_resolution_status = 'GAP_UNRESOLVED',
            completed_at = NOW()
        WHERE mission_id = p_mission_id;
        
        RETURN jsonb_build_object('success', true, 'status', 'CONFLICT');
    ELSE
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'UNRESOLVED',
            terminal_reason = 'REASON_RESOLVER_UNRESOLVED',
            identity_resolution_status = 'UNRESOLVED',
            attachment_status = 'UNATTACHED',
            gap_resolution_status = 'GAP_UNRESOLVED',
            completed_at = NOW()
        WHERE mission_id = p_mission_id;
        
        RETURN jsonb_build_object('success', true, 'status', 'UNRESOLVED');
    END IF;
END;
$$;
