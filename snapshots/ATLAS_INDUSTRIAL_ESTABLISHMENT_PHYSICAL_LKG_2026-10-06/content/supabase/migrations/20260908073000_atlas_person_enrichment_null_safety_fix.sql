-- ============================================================================
-- MIGRATION: 20260908073000_atlas_person_enrichment_null_safety_fix.sql
-- Subsystem: Person Enrichment V1
-- Fix: Null-safety for is_stable_anchor in record_enrichment_result_v1
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_enrichment_result_v1(
    p_mission_id UUID,
    p_job_id UUID,
    p_lock_token UUID,
    p_candidate_identity_key TEXT,
    p_source_ref TEXT,
    p_extracted_name TEXT,
    p_payload JSONB,
    p_identifiers JSONB,
    p_acquired_value TEXT,
    p_incurred_cost NUMERIC DEFAULT 0.0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_mission RECORD;
    v_queue RECORD;
    v_policy RECORD;
    v_candidate_id UUID;
    v_canonical_hash TEXT;
    v_expires_at TIMESTAMPTZ;
    v_ident JSONB;
    v_is_stable BOOLEAN;
    v_conf NUMERIC;
    v_attempt_number INT;
BEGIN
    -- 1. Validate mission
    SELECT * INTO v_mission 
    FROM public.atlas_person_enrichment_missions 
    WHERE mission_id = p_mission_id 
    FOR UPDATE;
    
    IF v_mission.mission_id IS NULL THEN
        RAISE EXCEPTION 'MISSION_NOT_FOUND';
    END IF;
    
    -- 2. Validate Harvester job and lock lease
    SELECT * INTO v_queue
    FROM public.atlas_queues
    WHERE job_id = p_job_id
      AND lock_token = p_lock_token
      AND status = 'PROCESSING';
      
    IF v_queue.job_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_HARVEST_JOB: Invalid job or lock token lease.';
    END IF;
    
    IF v_queue.tenant_id != v_mission.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Queue tenant does not match mission tenant.';
    END IF;
    
    -- Record attempt in attempt ledger
    SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_number
    FROM public.atlas_person_enrichment_attempts
    WHERE mission_id = p_mission_id;
    
    INSERT INTO public.atlas_person_enrichment_attempts (
        tenant_id,
        mission_id,
        harvester_job_id,
        attempt_number,
        execution_status,
        incurred_cost,
        finished_at
    ) VALUES (
        v_mission.tenant_id,
        p_mission_id,
        p_job_id,
        v_attempt_number,
        CASE WHEN p_acquired_value IS NOT NULL THEN 'SUCCESS' ELSE 'FAILED' END,
        COALESCE(p_incurred_cost, 0.0),
        NOW()
    );
    
    -- If no candidate data or acquired value found
    IF p_acquired_value IS NULL OR p_acquired_value = '' THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'NO_RESULT',
            terminal_reason = 'REASON_NO_RESULT',
            execution_status = 'SUCCESS',
            observation_status = 'NO_RESULT',
            identity_resolution_status = 'N/A',
            attachment_status = 'N/A',
            gap_resolution_status = 'GAP_UNRESOLVED',
            actual_cost = actual_cost + COALESCE(p_incurred_cost, 0.0),
            completed_at = NOW()
        WHERE mission_id = p_mission_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'status', 'NO_RESULT',
            'mission_id', p_mission_id
        );
    END IF;
    
    -- 3. Stage candidate in atlas_person_discovery_candidates using verified queue authorities
    SELECT * INTO v_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE LIMIT 1;
    v_canonical_hash := pg_catalog.encode(extensions.digest(p_payload::TEXT, 'sha256'), 'hex');
    v_expires_at := NOW() + (v_policy.candidate_retention_days || ' days')::INTERVAL;
    
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
        v_mission.tenant_id,
        p_candidate_identity_key,
        'API_CONNECTOR',
        p_source_ref,
        v_queue.source_authority,
        'LICENSED_PARTNER_API',
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
    
    -- 4. Stage ONLY identifiers necessary for identity resolution (RESOLUTION_ONLY)
    -- Do NOT insert unverified sensitive channels
    FOR v_ident IN SELECT * FROM jsonb_array_elements(p_identifiers) LOOP
        -- Data minimization: allowlist identity resolution anchors only
        IF (v_ident->>'identifier_type') IN ('EMAIL', 'PHONE', 'INSTAGRAM', 'X', 'YOUTUBE', 'LINKEDIN') THEN
            v_is_stable := COALESCE((v_ident->>'verification_status') IN ('VERIFIED', 'OBSERVED_DIRECT'), FALSE) AND (v_queue.use_authority != 'DISCOVERY_ONLY');
            v_conf := CASE WHEN v_is_stable THEN 0.90 ELSE 0.50 END;
            
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
                v_mission.tenant_id,
                v_candidate_id,
                (v_ident->>'identifier_type')::public.atlas_identifier_type,
                v_ident->>'normalized_value_hash',
                v_ident->>'display_value',
                v_ident->>'safe_value',
                COALESCE(v_is_stable, FALSE),
                COALESCE(v_ident->>'verification_status', 'UNVERIFIED'),
                v_conf
            ) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
    
    -- 5. Update Mission state to RESOLUTION_PENDING
    UPDATE public.atlas_person_enrichment_missions
    SET status = 'RESOLUTION_PENDING',
        execution_status = 'SUCCESS',
        observation_status = 'FOUND',
        actual_cost = actual_cost + COALESCE(p_incurred_cost, 0.0)
    WHERE mission_id = p_mission_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'status', 'RESOLUTION_PENDING',
        'mission_id', p_mission_id,
        'candidate_id', v_candidate_id,
        'acquisition_key', v_mission.acquisition_key,
        'acquired_value', p_acquired_value
    );
END;
$$;
