-- ============================================================================
-- MIGRATION: 20260908072000_atlas_person_enrichment_dispatch_fix.sql
-- Subsystem: Person Enrichment V1
-- Fix: Select a.source_authority into v_capability in authorize_and_dispatch_enrichment_mission_v1
-- ============================================================================

CREATE OR REPLACE FUNCTION public.authorize_and_dispatch_enrichment_mission_v1(
    p_mission_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_mission RECORD;
    v_tenant_config RECORD;
    v_daily_budget RECORD;
    v_cov_dim RECORD;
    v_cov_policy RECORD;
    v_lc_policy RECORD;
    v_enrich_policy RECORD;
    v_current_input_hash TEXT;
    v_gap RECORD;
    v_capability RECORD;
    v_current_cap_hash TEXT;
    
    v_utc_today DATE;
    v_reservation_id UUID;
    v_job_id UUID;
    v_queue_idempotency TEXT;
BEGIN
    v_utc_today := (NOW() AT TIME ZONE 'UTC')::DATE;
    
    -- Lock mission
    SELECT * INTO v_mission 
    FROM public.atlas_person_enrichment_missions 
    WHERE mission_id = p_mission_id 
    FOR UPDATE;
    
    IF v_mission.mission_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'MISSION_NOT_FOUND');
    END IF;
    
    IF v_mission.status != 'PLANNED' THEN
        RETURN jsonb_build_object('success', false, 'status', v_mission.status, 'reason', 'MISSION_NOT_IN_PLANNED_STATE');
    END IF;
    
    -- 1. JIT REVALIDATION: Person & Policies
    IF NOT EXISTS (SELECT 1 FROM public.atlas_people WHERE tenant_id = v_mission.tenant_id AND person_id = v_mission.person_id AND status = 'ACTIVE') THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'CANCELLED', terminal_reason = 'REASON_STALE_GAP', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        RETURN jsonb_build_object('success', false, 'status', 'CANCELLED', 'reason', 'PERSON_INACTIVE_OR_DELETED');
    END IF;
    
    SELECT * INTO v_enrich_policy FROM public.atlas_person_enrichment_policies WHERE enrichment_policy_version = v_mission.enrichment_policy_version AND is_active = TRUE;
    IF v_enrich_policy.enrichment_policy_version IS NULL THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'STALE_GAP', terminal_reason = 'REASON_STALE_GAP', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        RETURN jsonb_build_object('success', false, 'status', 'STALE_GAP', 'reason', 'ENRICHMENT_POLICY_DEACTIVATED');
    END IF;
    
    -- 2. JIT REVALIDATION: Coverage & Gap State
    PERFORM public.compute_person_coverage_system_v1(v_mission.tenant_id, v_mission.person_id);
    
    SELECT * INTO v_gap
    FROM public.atlas_person_gap_analysis
    WHERE tenant_id = v_mission.tenant_id AND person_id = v_mission.person_id AND gap_key = v_mission.gap_key;
    
    IF v_gap.id IS NULL OR v_gap.priority = 'NONE'::public.atlas_gap_priority THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'STALE_GAP', terminal_reason = 'REASON_STALE_GAP', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        
        INSERT INTO public.atlas_person_enrichment_events (tenant_id, mission_id, event_type, from_status, to_status, details)
        VALUES (v_mission.tenant_id, p_mission_id, 'JIT_REVALIDATION_FAILED', 'PLANNED', 'STALE_GAP', jsonb_build_object('reason', 'GAP_RESOLVED_OR_NONE'));
        
        RETURN jsonb_build_object('success', false, 'status', 'STALE_GAP', 'reason', 'GAP_NO_LONGER_ACTIVE');
    END IF;
    
    SELECT * INTO v_cov_policy FROM public.atlas_person_coverage_policies WHERE is_active = TRUE LIMIT 1;
    SELECT * INTO v_lc_policy FROM public.atlas_lifecycle_policies WHERE is_active = TRUE LIMIT 1;
    SELECT coverage_state_hash INTO v_cov_dim FROM public.atlas_person_coverage_dimensions WHERE tenant_id = v_mission.tenant_id AND person_id = v_mission.person_id LIMIT 1;
    
    v_current_input_hash := public.compute_enrichment_input_hash_v1(
        v_mission.tenant_id,
        v_mission.person_id,
        v_gap.gap_key,
        v_gap.priority,
        v_gap.reason,
        v_gap.blocker_rule,
        v_gap.consumer_dependency,
        COALESCE(v_cov_dim.coverage_state_hash, 'INITIAL_COVERAGE'),
        v_cov_policy.coverage_policy_version,
        v_lc_policy.policy_version
    );
    
    IF v_current_input_hash != v_mission.enrichment_input_hash THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'STALE_GAP', terminal_reason = 'REASON_STALE_GAP', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        
        INSERT INTO public.atlas_person_enrichment_events (tenant_id, mission_id, event_type, from_status, to_status, details)
        VALUES (v_mission.tenant_id, p_mission_id, 'JIT_REVALIDATION_FAILED', 'PLANNED', 'STALE_GAP', jsonb_build_object('reason', 'INPUT_HASH_CHANGED'));
        
        RETURN jsonb_build_object('success', false, 'status', 'STALE_GAP', 'reason', 'SEMANTIC_GAP_HASH_CHANGED');
    END IF;
    
    -- 3. JIT REVALIDATION: Source Capability Snapshot
    SELECT c.*, a.maximum_use_authority, a.source_authority, s.status AS source_status, a.is_active AS authority_active
    INTO v_capability
    FROM public.atlas_person_enrichment_source_capabilities c
    JOIN public.atlas_sources s ON s.source_id = c.source_id
    JOIN public.atlas_source_authority_registry a ON a.authority_id = c.authority_id
    WHERE c.capability_id = v_mission.selected_capability_id;
    
    IF v_capability.capability_id IS NULL OR NOT v_capability.is_enabled OR v_capability.source_status != 'ACTIVE' OR NOT v_capability.authority_active THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'NO_SOURCE', terminal_reason = 'REASON_NO_AUTHORIZED_SOURCE', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        RETURN jsonb_build_object('success', false, 'status', 'NO_SOURCE', 'reason', 'CAPABILITY_DEACTIVATED');
    END IF;
    
    v_current_cap_hash := public.compute_capability_snapshot_hash_v1(
        v_capability.capability_id,
        v_capability.source_id,
        v_capability.authority_id,
        v_capability.supported_gap_key,
        v_capability.acquisition_key,
        v_capability.cost_per_query,
        v_capability.maximum_use_authority,
        v_capability.is_enabled
    );
    
    IF v_current_cap_hash != v_mission.capability_snapshot_hash THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'CANCELLED', terminal_reason = 'REASON_CAPABILITY_CHANGED', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        RETURN jsonb_build_object('success', false, 'status', 'CANCELLED', 'reason', 'CAPABILITY_SNAPSHOT_CHANGED');
    END IF;
    
    -- 4. ATOMIC BUDGET RESERVATION (Row Lock on Tenant Config + Daily Budget)
    -- Upsert tenant config row if needed
    INSERT INTO public.atlas_person_enrichment_tenant_configs (tenant_id)
    VALUES (v_mission.tenant_id)
    ON CONFLICT (tenant_id) DO NOTHING;
    
    SELECT * INTO v_tenant_config
    FROM public.atlas_person_enrichment_tenant_configs
    WHERE tenant_id = v_mission.tenant_id
    FOR UPDATE;
    
    -- Check total budget limit
    IF (v_tenant_config.total_spent + v_tenant_config.total_reserved + v_mission.max_cost) > v_tenant_config.total_budget_limit THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'BUDGET_DENIED', terminal_reason = 'REASON_BUDGET_EXCEEDED', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        RETURN jsonb_build_object('success', false, 'status', 'BUDGET_DENIED', 'reason', 'TOTAL_BUDGET_EXCEEDED');
    END IF;
    
    -- Upsert and lock daily budget row for UTC today
    INSERT INTO public.atlas_person_enrichment_daily_budgets (tenant_id, period_date)
    VALUES (v_mission.tenant_id, v_utc_today)
    ON CONFLICT (tenant_id, period_date) DO NOTHING;
    
    SELECT * INTO v_daily_budget
    FROM public.atlas_person_enrichment_daily_budgets
    WHERE tenant_id = v_mission.tenant_id AND period_date = v_utc_today
    FOR UPDATE;
    
    -- Check daily budget limit
    IF (v_daily_budget.daily_spent + v_daily_budget.daily_reserved + v_mission.max_cost) > v_tenant_config.daily_budget_limit THEN
        UPDATE public.atlas_person_enrichment_missions
        SET status = 'BUDGET_DENIED', terminal_reason = 'REASON_BUDGET_EXCEEDED', completed_at = NOW()
        WHERE mission_id = p_mission_id;
        RETURN jsonb_build_object('success', false, 'status', 'BUDGET_DENIED', 'reason', 'DAILY_BUDGET_EXCEEDED');
    END IF;
    
    -- Reserve amounts in tenant config and daily budget
    UPDATE public.atlas_person_enrichment_tenant_configs
    SET total_reserved = total_reserved + v_mission.max_cost, updated_at = NOW()
    WHERE tenant_id = v_mission.tenant_id;
    
    UPDATE public.atlas_person_enrichment_daily_budgets
    SET daily_reserved = daily_reserved + v_mission.max_cost, updated_at = NOW()
    WHERE tenant_id = v_mission.tenant_id AND period_date = v_utc_today;
    
    -- Insert reservation record
    INSERT INTO public.atlas_person_enrichment_budget_reservations (
        tenant_id,
        mission_id,
        period_date,
        reserved_amount,
        status,
        expires_at
    ) VALUES (
        v_mission.tenant_id,
        p_mission_id,
        v_utc_today,
        v_mission.max_cost,
        'RESERVED',
        NOW() + (v_enrich_policy.reservation_expiry_minutes || ' minutes')::INTERVAL
    ) RETURNING reservation_id INTO v_reservation_id;
    
    -- 5. HARVESTER QUEUE ENQUEUE (Transactional enqueue)
    v_queue_idempotency := 'ENRICH_' || p_mission_id::text;
    
    INSERT INTO public.atlas_queues (
        queue_type,
        idempotency_key,
        priority,
        payload,
        status,
        tenant_id,
        source_id,
        source_authority,
        use_authority
    ) VALUES (
        'INGEST',
        v_queue_idempotency,
        3, -- High priority for person enrichment
        jsonb_build_object(
            'mission_id', p_mission_id,
            'tenant_id', v_mission.tenant_id,
            'person_id', v_mission.person_id,
            'gap_key', v_mission.gap_key,
            'acquisition_key', v_mission.acquisition_key,
            'required_use_authority', v_mission.required_use_authority
        ),
        'PENDING',
        v_mission.tenant_id,
        v_mission.selected_source_id,
        v_capability.source_authority,
        v_mission.required_use_authority
    ) RETURNING job_id INTO v_job_id;
    
    -- 6. Transition Mission to DISPATCHED
    UPDATE public.atlas_person_enrichment_missions
    SET status = 'DISPATCHED',
        reservation_id = v_reservation_id,
        harvester_job_id = v_job_id,
        authorized_at = NOW(),
        dispatched_at = NOW(),
        deadline_at = NOW() + (v_mission.timeout_seconds || ' seconds')::INTERVAL
    WHERE mission_id = p_mission_id;
    
    -- Record Audit Event
    INSERT INTO public.atlas_person_enrichment_events (
        tenant_id,
        mission_id,
        event_type,
        from_status,
        to_status,
        details
    ) VALUES (
        v_mission.tenant_id,
        p_mission_id,
        'MISSION_DISPATCHED',
        'PLANNED',
        'DISPATCHED',
        jsonb_build_object(
            'reservation_id', v_reservation_id,
            'harvester_job_id', v_job_id,
            'reserved_cost', v_mission.max_cost
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'status', 'DISPATCHED',
        'mission_id', p_mission_id,
        'reservation_id', v_reservation_id,
        'harvester_job_id', v_job_id
    );
END;
$$;
