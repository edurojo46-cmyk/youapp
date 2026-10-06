-- ==========================================
-- PHASE 10F-B: EXECUTION SIMULATOR
-- ==========================================

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE public.atlas_simulation_aggregate_status AS ENUM (
        'PREPARED',
        'ATTEMPTING',
        'SIMULATED_ACCEPTED',
        'SIMULATED_FAILED_PRE_ACCEPT',
        'SIMULATED_AMBIGUOUS'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_simulation_attempt_status AS ENUM (
        'ATTEMPTING',
        'SIMULATED_ACCEPTED',
        'SIMULATED_FAILED_PRE_ACCEPT',
        'SIMULATED_AMBIGUOUS'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Create Simulation Aggregate Table
CREATE TABLE IF NOT EXISTS public.atlas_execution_simulations (
    simulation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    logical_execution_identity TEXT NOT NULL,
    execution_request_id TEXT NOT NULL,

    action_type TEXT NOT NULL,
    channel TEXT NOT NULL,

    message_certification_id UUID,
    certification_snapshot_hash TEXT,
    
    destination_hash TEXT,
    prepared_payload_hash TEXT,

    status public.atlas_simulation_aggregate_status NOT NULL DEFAULT 'PREPARED',
    attempt_count INT NOT NULL DEFAULT 0,

    simulator_version TEXT NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    terminal_at TIMESTAMPTZ
);

-- RLS & Constraints
ALTER TABLE public.atlas_execution_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_execution_simulations ON public.atlas_execution_simulations 
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

CREATE UNIQUE INDEX idx_atlas_sim_logical_identity ON public.atlas_execution_simulations (tenant_id, logical_execution_identity);

-- 3. Create Simulation Attempts Table
CREATE TABLE IF NOT EXISTS public.atlas_execution_simulation_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES public.atlas_execution_simulations(simulation_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    
    attempt_no INT NOT NULL,
    status public.atlas_simulation_attempt_status NOT NULL DEFAULT 'ATTEMPTING',
    
    fault_profile TEXT NOT NULL,
    payload_hash TEXT NOT NULL,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    recover_after TIMESTAMPTZ NOT NULL,
    
    result_code TEXT,
    reason_code TEXT,
    simulated_provider_acceptance_id TEXT
);

-- RLS & Constraints
ALTER TABLE public.atlas_execution_simulation_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY trg_rls_execution_simulation_attempts ON public.atlas_execution_simulation_attempts 
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

CREATE UNIQUE INDEX idx_atlas_sim_attempt_no ON public.atlas_execution_simulation_attempts (tenant_id, simulation_id, attempt_no);

-- Critical constraint: only ONE attempt can be active (ATTEMPTING) for a given simulation
CREATE UNIQUE INDEX idx_atlas_sim_active_attempt ON public.atlas_execution_simulation_attempts (tenant_id, simulation_id) WHERE status = 'ATTEMPTING';


-- ==========================================
-- RPCs
-- ==========================================

-- A. Prepare Execution Simulation
CREATE OR REPLACE FUNCTION public.prepare_execution_simulation(
    p_logical_execution_identity TEXT,
    p_execution_request_id TEXT,
    p_action_type TEXT,
    p_channel TEXT,
    p_message_certification_id UUID,
    p_certification_snapshot_hash TEXT,
    p_destination_hash TEXT,
    p_prepared_payload_hash TEXT,
    p_simulator_version TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_sim RECORD;
BEGIN
    INSERT INTO public.atlas_execution_simulations (
        tenant_id, logical_execution_identity, execution_request_id,
        action_type, channel, message_certification_id, certification_snapshot_hash,
        destination_hash, prepared_payload_hash, simulator_version, status
    ) VALUES (
        v_tenant_id, p_logical_execution_identity, p_execution_request_id,
        p_action_type, p_channel, p_message_certification_id, p_certification_snapshot_hash,
        p_destination_hash, p_prepared_payload_hash, p_simulator_version, 'PREPARED'
    )
    ON CONFLICT (tenant_id, logical_execution_identity) DO NOTHING;

    SELECT * INTO v_sim FROM public.atlas_execution_simulations 
    WHERE tenant_id = v_tenant_id AND logical_execution_identity = p_logical_execution_identity;

    RETURN jsonb_build_object(
        'success', true, 
        'simulation_id', v_sim.simulation_id, 
        'status', v_sim.status
    );
END;
$$;

-- B. Start Execution Simulation Attempt
CREATE OR REPLACE FUNCTION public.start_execution_simulation_attempt(
    p_simulation_id UUID,
    p_fault_profile TEXT,
    p_payload_hash TEXT,
    p_lease_seconds INT DEFAULT 30
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_sim RECORD;
    v_attempt_id UUID;
    v_attempt_no INT;
BEGIN
    -- Lock aggregate
    SELECT * INTO v_sim FROM public.atlas_execution_simulations
    WHERE tenant_id = v_tenant_id AND simulation_id = p_simulation_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'SIMULATION_NOT_FOUND');
    END IF;

    -- Valid transition check
    IF v_sim.status IN ('SIMULATED_ACCEPTED', 'SIMULATED_AMBIGUOUS') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'TERMINAL_STATE_NO_RETRY', 'current_status', v_sim.status);
    END IF;
    
    IF v_sim.status = 'ATTEMPTING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ALREADY_ATTEMPTING', 'current_status', v_sim.status);
    END IF;

    -- At this point status is PREPARED or SIMULATED_FAILED_PRE_ACCEPT
    v_attempt_id := gen_random_uuid();
    v_attempt_no := v_sim.attempt_count + 1;

    -- The partial unique index idx_atlas_sim_active_attempt guarantees safety against double ATTEMPTING inserts
    BEGIN
        INSERT INTO public.atlas_execution_simulation_attempts (
            attempt_id, simulation_id, tenant_id, attempt_no, fault_profile, payload_hash, status, recover_after
        ) VALUES (
            v_attempt_id, p_simulation_id, v_tenant_id, v_attempt_no, p_fault_profile, p_payload_hash, 'ATTEMPTING', NOW() + (p_lease_seconds || ' seconds')::INTERVAL
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'reason', 'CONCURRENT_ACTIVE_ATTEMPT');
    END;

    UPDATE public.atlas_execution_simulations
    SET status = 'ATTEMPTING', attempt_count = v_attempt_no, updated_at = NOW()
    WHERE simulation_id = p_simulation_id;

    RETURN jsonb_build_object('success', true, 'attempt_id', v_attempt_id, 'attempt_no', v_attempt_no);
END;
$$;


-- C. Complete Execution Simulation Attempt
CREATE OR REPLACE FUNCTION public.complete_execution_simulation_attempt(
    p_simulation_id UUID,
    p_attempt_id UUID,
    p_status TEXT,
    p_simulated_provider_id TEXT DEFAULT NULL,
    p_result_code TEXT DEFAULT NULL,
    p_reason_code TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_sim RECORD;
    v_attempt RECORD;
    v_mapped_status public.atlas_simulation_aggregate_status;
BEGIN
    IF p_status NOT IN ('SIMULATED_ACCEPTED', 'SIMULATED_FAILED_PRE_ACCEPT', 'SIMULATED_AMBIGUOUS') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'INVALID_TERMINAL_STATUS');
    END IF;

    v_mapped_status := p_status::public.atlas_simulation_aggregate_status;

    SELECT * INTO v_sim FROM public.atlas_execution_simulations
    WHERE tenant_id = v_tenant_id AND simulation_id = p_simulation_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'SIMULATION_NOT_FOUND');
    END IF;

    IF v_sim.status != 'ATTEMPTING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'SIMULATION_NOT_ATTEMPTING');
    END IF;

    SELECT * INTO v_attempt FROM public.atlas_execution_simulation_attempts
    WHERE attempt_id = p_attempt_id FOR UPDATE;

    IF v_attempt.status != 'ATTEMPTING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_ATTEMPTING');
    END IF;

    -- Update Attempt
    UPDATE public.atlas_execution_simulation_attempts
    SET status = v_mapped_status::text::public.atlas_simulation_attempt_status, 
        completed_at = NOW(),
        simulated_provider_acceptance_id = p_simulated_provider_id,
        result_code = p_result_code,
        reason_code = p_reason_code
    WHERE attempt_id = p_attempt_id;

    -- Update Aggregate
    UPDATE public.atlas_execution_simulations
    SET status = v_mapped_status, updated_at = NOW(),
        terminal_at = CASE WHEN v_mapped_status IN ('SIMULATED_ACCEPTED', 'SIMULATED_AMBIGUOUS') THEN NOW() ELSE terminal_at END
    WHERE simulation_id = p_simulation_id;

    RETURN jsonb_build_object('success', true);
END;
$$;


-- D. Recover Stale Simulation Attempt
CREATE OR REPLACE FUNCTION public.recover_stale_simulation_attempt(
    p_simulation_id UUID,
    p_attempt_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_sim RECORD;
    v_attempt RECORD;
BEGIN
    SELECT * INTO v_sim FROM public.atlas_execution_simulations
    WHERE tenant_id = v_tenant_id AND simulation_id = p_simulation_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'SIMULATION_NOT_FOUND');
    END IF;

    IF v_sim.status != 'ATTEMPTING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'SIMULATION_NOT_ATTEMPTING');
    END IF;

    SELECT * INTO v_attempt FROM public.atlas_execution_simulation_attempts
    WHERE attempt_id = p_attempt_id FOR UPDATE;

    IF v_attempt.status != 'ATTEMPTING' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ATTEMPT_NOT_ATTEMPTING');
    END IF;

    IF v_attempt.recover_after > NOW() THEN
        RETURN jsonb_build_object('success', false, 'reason', 'NOT_STALE', 'recover_after', v_attempt.recover_after);
    END IF;

    -- We recover it to AMBIGUOUS always, never to FAILED_PRE_ACCEPT, because we don't know if the provider received it.
    UPDATE public.atlas_execution_simulation_attempts
    SET status = 'SIMULATED_AMBIGUOUS', completed_at = NOW(), reason_code = 'CRASH_RECOVERY'
    WHERE attempt_id = p_attempt_id;

    UPDATE public.atlas_execution_simulations
    SET status = 'SIMULATED_AMBIGUOUS', updated_at = NOW(), terminal_at = NOW()
    WHERE simulation_id = p_simulation_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
