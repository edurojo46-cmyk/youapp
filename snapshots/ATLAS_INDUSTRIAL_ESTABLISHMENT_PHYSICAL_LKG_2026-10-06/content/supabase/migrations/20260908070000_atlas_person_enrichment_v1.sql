-- ============================================================================
-- MIGRATION: 20260908070000_atlas_person_enrichment_v1.sql
-- DESCRIPTION: Person Enrichment Engine V1
-- ZERO SEARCH WITHOUT NEED | ZERO DIRECT PERSON WRITES | TARGET PERSON != IDENTITY PROOF
-- ONE MISSION = ONE AUTHORIZED ACQUISITION SIDE EFFECT
-- ============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE public.atlas_enrichment_mission_status AS ENUM (
        'PLANNED',
        'AUTHORIZED',
        'DISPATCHED',
        'OBSERVATION_RECEIVED',
        'RESOLUTION_PENDING',
        'ATTACHED',
        'NO_SOURCE',
        'AUTHORITY_DENIED',
        'STALE_GAP',
        'BUDGET_DENIED',
        'TIMEOUT',
        'NO_RESULT',
        'AMBIGUOUS',
        'CONFLICT',
        'UNRESOLVED',
        'EXPIRED',
        'CANCELLED',
        'EXHAUSTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_enrichment_terminal_reason AS ENUM (
        'REASON_PRIORITY_NONE',
        'REASON_UNSUPPORTED_GAP',
        'REASON_NO_ELIGIBLE_ACQUISITION_DIMENSION',
        'REASON_NO_AUTHORIZED_SOURCE',
        'REASON_INSUFFICIENT_USE_AUTHORITY',
        'REASON_SENSITIVE_DIMENSION_DENIED',
        'REASON_BUDGET_EXCEEDED',
        'REASON_ON_COOLDOWN',
        'REASON_ATTEMPTS_EXHAUSTED',
        'REASON_STALE_GAP',
        'REASON_CAPABILITY_CHANGED',
        'REASON_TIMEOUT',
        'REASON_NO_RESULT',
        'REASON_TARGET_MISMATCH',
        'REASON_RESOLVER_AMBIGUOUS',
        'REASON_RESOLVER_CONFLICT',
        'REASON_RESOLVER_UNRESOLVED',
        'REASON_EXECUTION_FAILED',
        'REASON_MANUAL_CANCEL'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. COMPOSITE INTEGRITY ANCHOR ON ATLAS_PEOPLE
-- Enables composite foreign keys (tenant_id, person_id) for hard DB-level tenant consistency
CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_people_tenant_person 
ON public.atlas_people(tenant_id, person_id);

-- 3. ENRICHMENT POLICIES TABLE (GLOBAL, IMMUTABLE PARAMETERS)
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_policies (
    enrichment_policy_version TEXT PRIMARY KEY,
    
    max_attempts_per_gap INT NOT NULL DEFAULT 3 CHECK (max_attempts_per_gap > 0),
    cooldown_attempt_1_hours INT NOT NULL DEFAULT 24 CHECK (cooldown_attempt_1_hours >= 0),
    cooldown_attempt_2_hours INT NOT NULL DEFAULT 168 CHECK (cooldown_attempt_2_hours >= 0),
    default_timeout_seconds INT NOT NULL DEFAULT 30 CHECK (default_timeout_seconds > 0),
    reservation_expiry_minutes INT NOT NULL DEFAULT 10 CHECK (reservation_expiry_minutes > 0),
    
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index for exact single active policy
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_enrichment_policy 
ON public.atlas_person_enrichment_policies(is_active) 
WHERE is_active = TRUE;

-- Policy Immutability Trigger
CREATE OR REPLACE FUNCTION public.trg_enforce_enrichment_policy_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.max_attempts_per_gap IS DISTINCT FROM NEW.max_attempts_per_gap) OR
       (OLD.cooldown_attempt_1_hours IS DISTINCT FROM NEW.cooldown_attempt_1_hours) OR
       (OLD.cooldown_attempt_2_hours IS DISTINCT FROM NEW.cooldown_attempt_2_hours) OR
       (OLD.default_timeout_seconds IS DISTINCT FROM NEW.default_timeout_seconds) OR
       (OLD.reservation_expiry_minutes IS DISTINCT FROM NEW.reservation_expiry_minutes) THEN
        RAISE EXCEPTION 'POLICY_IMMUTABLE: Enrichment policy parameters cannot be modified. Create a new policy version.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrichment_policy_immutability ON public.atlas_person_enrichment_policies;
CREATE TRIGGER trg_enrichment_policy_immutability
BEFORE UPDATE ON public.atlas_person_enrichment_policies
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_enrichment_policy_immutability();

-- Seed Default Active Policy
INSERT INTO public.atlas_person_enrichment_policies (
    enrichment_policy_version,
    max_attempts_per_gap,
    cooldown_attempt_1_hours,
    cooldown_attempt_2_hours,
    default_timeout_seconds,
    reservation_expiry_minutes,
    is_active
) VALUES (
    'enrich-v1.0.0-deterministic',
    3,
    24,
    168,
    30,
    10,
    TRUE
) ON CONFLICT (enrichment_policy_version) DO NOTHING;

-- 4. SOURCE CAPABILITIES TABLE (GLOBAL SYSTEM CONFIGURATION)
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_source_capabilities (
    capability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.atlas_sources(source_id) ON DELETE CASCADE,
    authority_id UUID NOT NULL REFERENCES public.atlas_source_authority_registry(authority_id) ON DELETE CASCADE,
    
    supported_gap_key TEXT NOT NULL,
    acquisition_key TEXT NOT NULL,
    
    cost_per_query NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (cost_per_query >= 0),
    expected_latency_ms INT NOT NULL DEFAULT 1000 CHECK (expected_latency_ms > 0),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_capability_source_gap_acq UNIQUE(source_id, supported_gap_key, acquisition_key)
);

-- Capability Consistency Trigger: validates existence of source and authority
CREATE OR REPLACE FUNCTION public.trg_validate_source_capability_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_source RECORD;
    v_auth RECORD;
BEGIN
    SELECT * INTO v_source FROM public.atlas_sources WHERE source_id = NEW.source_id;
    SELECT * INTO v_auth FROM public.atlas_source_authority_registry WHERE authority_id = NEW.authority_id;
    
    IF v_source.source_id IS NULL THEN
        RAISE EXCEPTION 'CAPABILITY_INVALID_SOURCE: Source does not exist.';
    END IF;
    IF v_auth.authority_id IS NULL THEN
        RAISE EXCEPTION 'CAPABILITY_INVALID_AUTHORITY: Source authority does not exist.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_source_capability_consistency ON public.atlas_person_enrichment_source_capabilities;
CREATE TRIGGER trg_validate_source_capability_consistency
BEFORE INSERT OR UPDATE ON public.atlas_person_enrichment_source_capabilities
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_source_capability_consistency();

-- 5. TENANT BUDGET LIMITS & USAGE (CONCURRENCY-SAFE LEDGER)
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_tenant_configs (
    tenant_id UUID PRIMARY KEY REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    
    daily_budget_limit NUMERIC(10,4) NOT NULL DEFAULT 10.00 CHECK (daily_budget_limit >= 0),
    total_budget_limit NUMERIC(10,4) NOT NULL DEFAULT 100.00 CHECK (total_budget_limit >= 0),
    total_reserved NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (total_reserved >= 0),
    total_spent NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (total_spent >= 0),
    
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily Ledger: Keyed by (tenant_id, period_date) for deterministic UTC day boundary isolation
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_daily_budgets (
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    period_date DATE NOT NULL,
    
    daily_reserved NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (daily_reserved >= 0),
    daily_spent NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (daily_spent >= 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (tenant_id, period_date)
);

-- 6. PER-MISSION BUDGET RESERVATION LEDGER
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_budget_reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    mission_id UUID NOT NULL,
    period_date DATE NOT NULL, -- captures the exact daily period of reservation
    
    currency TEXT NOT NULL DEFAULT 'USD',
    reserved_amount NUMERIC(10,4) NOT NULL CHECK (reserved_amount >= 0),
    committed_amount NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (committed_amount >= 0),
    
    status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED')),
    
    reserved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    committed_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_enrichment_reservations_tenant_status 
ON public.atlas_person_enrichment_budget_reservations(tenant_id, status);

-- 7. ENRICHMENT MISSIONS TABLE (BOUNDED, SINGLE-PERSON, SINGLE-GAP, RECOVERABLE)
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_missions (
    mission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL,
    
    gap_key TEXT NOT NULL,
    acquisition_key TEXT NOT NULL,
    gap_priority public.atlas_gap_priority NOT NULL,
    consumer_reason TEXT NOT NULL,
    
    enrichment_input_hash TEXT NOT NULL,
    capability_snapshot_hash TEXT,
    enrichment_policy_version TEXT NOT NULL REFERENCES public.atlas_person_enrichment_policies(enrichment_policy_version),
    required_use_authority public.atlas_use_authority NOT NULL,
    
    selected_capability_id UUID REFERENCES public.atlas_person_enrichment_source_capabilities(capability_id),
    selected_source_id UUID REFERENCES public.atlas_sources(source_id),
    authority_id UUID REFERENCES public.atlas_source_authority_registry(authority_id),
    
    harvester_job_id UUID REFERENCES public.atlas_queues(job_id),
    reservation_id UUID REFERENCES public.atlas_person_enrichment_budget_reservations(reservation_id),
    
    status public.atlas_enrichment_mission_status NOT NULL DEFAULT 'PLANNED',
    terminal_reason public.atlas_enrichment_terminal_reason,
    
    max_cost NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (max_cost >= 0),
    actual_cost NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (actual_cost >= 0),
    max_requests INT NOT NULL DEFAULT 3 CHECK (max_requests > 0),
    timeout_seconds INT NOT NULL DEFAULT 30 CHECK (timeout_seconds > 0),
    deadline_at TIMESTAMPTZ,
    
    attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_eligible_at TIMESTAMPTZ,
    
    -- Execution and resolution decoupling
    execution_status TEXT,
    observation_status TEXT,
    identity_resolution_status TEXT,
    attachment_status TEXT,
    gap_resolution_status TEXT,
    
    coverage_state_hash_before TEXT,
    coverage_state_hash_after TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    authorized_at TIMESTAMPTZ,
    dispatched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Strict DB-level Composite Cross-Tenant Referential Integrity
    CONSTRAINT fk_mission_tenant_person FOREIGN KEY (tenant_id, person_id) 
        REFERENCES public.atlas_people(tenant_id, person_id) ON DELETE CASCADE,
    CONSTRAINT uq_mission_tenant_mission UNIQUE (tenant_id, mission_id)
);

-- Partial unique index for active mission deduplication (one active mission per semantic input)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_mission_dedup 
ON public.atlas_person_enrichment_missions(tenant_id, enrichment_input_hash)
WHERE status IN ('PLANNED', 'AUTHORIZED', 'DISPATCHED', 'OBSERVATION_RECEIVED', 'RESOLUTION_PENDING');

CREATE INDEX IF NOT EXISTS idx_enrichment_missions_lookup 
ON public.atlas_person_enrichment_missions(tenant_id, person_id, gap_key);

-- 8. ENRICHMENT ATTEMPTS LEDGER (TRANSACTIONAL ACTUAL COST & WORKER TRACEABILITY)
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_attempts (
    attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    mission_id UUID NOT NULL,
    harvester_job_id UUID REFERENCES public.atlas_queues(job_id),
    
    attempt_number INT NOT NULL CHECK (attempt_number > 0),
    request_count INT NOT NULL DEFAULT 1 CHECK (request_count > 0),
    
    execution_status TEXT NOT NULL CHECK (execution_status IN ('RUNNING', 'SUCCESS', 'TIMEOUT', 'FAILED', 'NETWORK_ERROR')),
    incurred_cost NUMERIC(10,4) NOT NULL DEFAULT 0.0 CHECK (incurred_cost >= 0),
    currency TEXT NOT NULL DEFAULT 'USD',
    
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Strict DB-level Cross-Tenant Referential Integrity
    CONSTRAINT fk_attempt_tenant_mission FOREIGN KEY (tenant_id, mission_id) 
        REFERENCES public.atlas_person_enrichment_missions(tenant_id, mission_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_enrichment_attempts_mission 
ON public.atlas_person_enrichment_attempts(tenant_id, mission_id, attempt_number);

-- 9. ENRICHMENT AUDIT EVENTS (APPEND-ONLY LEDGER)
CREATE TABLE IF NOT EXISTS public.atlas_person_enrichment_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    mission_id UUID NOT NULL,
    
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    
    execution_status TEXT,
    observation_status TEXT,
    identity_resolution_status TEXT,
    attachment_status TEXT,
    gap_resolution_status TEXT,
    
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Strict DB-level Cross-Tenant Referential Integrity
    CONSTRAINT fk_event_tenant_mission FOREIGN KEY (tenant_id, mission_id) 
        REFERENCES public.atlas_person_enrichment_missions(tenant_id, mission_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_enrichment_events_mission 
ON public.atlas_person_enrichment_events(tenant_id, mission_id, created_at DESC);

-- Trigger: Enforce Append-Only on Events (No Updates or Deletions)
CREATE OR REPLACE FUNCTION public.trg_enforce_enrichment_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: Updates and deletions are prohibited on atlas_person_enrichment_events.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrichment_events_append_only ON public.atlas_person_enrichment_events;
CREATE TRIGGER trg_enrichment_events_append_only
BEFORE UPDATE OR DELETE ON public.atlas_person_enrichment_events
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_enrichment_events_append_only();

-- Trigger: Enforce Append-Only on Attempts (No Deletion, Updates only while RUNNING)
CREATE OR REPLACE FUNCTION public.trg_enforce_enrichment_attempts_append_only()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: Deletions are prohibited on atlas_person_enrichment_attempts.';
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.execution_status != 'RUNNING' THEN
            RAISE EXCEPTION 'IMMUTABLE_ATTEMPT: Finished attempts cannot be modified.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrichment_attempts_append_only ON public.atlas_person_enrichment_attempts;
CREATE TRIGGER trg_enrichment_attempts_append_only
BEFORE UPDATE OR DELETE ON public.atlas_person_enrichment_attempts
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_enrichment_attempts_append_only();

-- 10. HELPER: USE AUTHORITY RANK (DETERMINISTIC INTEGER COMPARISON)
CREATE OR REPLACE FUNCTION public.get_use_authority_rank(p_authority public.atlas_use_authority)
RETURNS INT IMMUTABLE LANGUAGE sql AS $$
    SELECT CASE p_authority
        WHEN 'DISCOVERY_ONLY' THEN 1
        WHEN 'OBSERVATION_ALLOWED' THEN 2
        WHEN 'CANONICAL_ALLOWED' THEN 3
        ELSE 0
    END;
$$;

-- 11. HELPER: COMPUTE CANONICAL ENRICHMENT INPUT HASH
CREATE OR REPLACE FUNCTION public.compute_enrichment_input_hash_v1(
    p_tenant_id UUID,
    p_person_id UUID,
    p_gap_key TEXT,
    p_priority public.atlas_gap_priority,
    p_reason TEXT,
    p_blocker_rule TEXT,
    p_consumer_dependency TEXT,
    p_coverage_state_hash TEXT,
    p_coverage_policy_version TEXT,
    p_lifecycle_policy_version TEXT
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN encode(extensions.digest(
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'person_id', p_person_id,
            'gap_key', p_gap_key,
            'priority', p_priority,
            'reason', p_reason,
            'blocker_rule', p_blocker_rule,
            'consumer_dependency', p_consumer_dependency,
            'coverage_state_hash', p_coverage_state_hash,
            'coverage_policy_version', p_coverage_policy_version,
            'lifecycle_policy_version', p_lifecycle_policy_version
        )::text,
        'sha256'
    ), 'hex');
END;
$$;

-- 12. HELPER: COMPUTE CAPABILITY SNAPSHOT HASH
CREATE OR REPLACE FUNCTION public.compute_capability_snapshot_hash_v1(
    p_capability_id UUID,
    p_source_id UUID,
    p_authority_id UUID,
    p_supported_gap_key TEXT,
    p_acquisition_key TEXT,
    p_cost_per_query NUMERIC,
    p_maximum_use_authority public.atlas_use_authority,
    p_is_enabled BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN encode(extensions.digest(
        jsonb_build_object(
            'capability_id', p_capability_id,
            'source_id', p_source_id,
            'authority_id', p_authority_id,
            'supported_gap_key', p_supported_gap_key,
            'acquisition_key', p_acquisition_key,
            'cost_per_query', p_cost_per_query,
            'maximum_use_authority', p_maximum_use_authority,
            'is_enabled', p_is_enabled
        )::text,
        'sha256'
    ), 'hex');
END;
$$;

-- 13. CORE RPC 1: PLAN PERSON ENRICHMENT V1
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
        -- Check if source existed but was rejected due to DISCOVERY_ONLY or lower authority
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

-- 14. CORE RPC 2: AUTHORIZE AND DISPATCH MISSION (ATOMIC JIT + BUDGET + QUEUE)
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
    SELECT c.*, a.maximum_use_authority, s.status AS source_status, a.is_active AS authority_active
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

-- 15. CORE RPC 3: RECORD ENRICHMENT RESULT (WORKER RESULT INGESTION + DATA MINIMIZATION)
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
            v_is_stable := ((v_ident->>'verification_status') IN ('VERIFIED', 'OBSERVED_DIRECT') AND v_queue.use_authority != 'DISCOVERY_ONLY');
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
                v_is_stable,
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

-- 16. CORE RPC 4: RECORD ENRICHMENT RESOLUTION (TARGET MISMATCH SAFETY & EVIDENCE ATTACHMENT)
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

-- 17. CORE RPC 5: FINALIZE MISSION (COVERAGE RECOMPUTE & BUDGET RECONCILIATION)
CREATE OR REPLACE FUNCTION public.finalize_enrichment_mission_v1(
    p_mission_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_mission RECORD;
    v_res RECORD;
    v_cov_dim RECORD;
    v_cov_result JSONB;
    v_gap_still_exists BOOLEAN;
    v_enrich_policy RECORD;
    v_cooldown_hours INT := 24;
    v_next_eligible TIMESTAMPTZ := NULL;
    v_final_status public.atlas_enrichment_mission_status;
BEGIN
    SELECT * INTO v_mission 
    FROM public.atlas_person_enrichment_missions 
    WHERE mission_id = p_mission_id 
    FOR UPDATE;
    
    IF v_mission.mission_id IS NULL THEN
        RAISE EXCEPTION 'MISSION_NOT_FOUND';
    END IF;
    
    SELECT * INTO v_enrich_policy FROM public.atlas_person_enrichment_policies WHERE enrichment_policy_version = v_mission.enrichment_policy_version;
    
    -- 1. Coverage Recompute CURRENT
    v_cov_result := public.compute_person_coverage_system_v1(v_mission.tenant_id, v_mission.person_id);
    
    SELECT coverage_state_hash INTO v_cov_dim 
    FROM public.atlas_person_coverage_dimensions 
    WHERE tenant_id = v_mission.tenant_id AND person_id = v_mission.person_id LIMIT 1;
    
    -- Check if target gap is now resolved
    SELECT EXISTS (
        SELECT 1 
        FROM public.atlas_person_gap_analysis
        WHERE tenant_id = v_mission.tenant_id AND person_id = v_mission.person_id AND gap_key = v_mission.gap_key
    ) INTO v_gap_still_exists;
    
    v_final_status := v_mission.status;
    
    -- Check anti-loop exhaustion if gap is not resolved
    IF v_gap_still_exists THEN
        IF v_mission.attempt_count >= v_enrich_policy.max_attempts_per_gap THEN
            v_final_status := 'EXHAUSTED';
            v_next_eligible := NULL;
        ELSE
            IF v_mission.attempt_count = 1 THEN
                v_cooldown_hours := v_enrich_policy.cooldown_attempt_1_hours;
            ELSE
                v_cooldown_hours := v_enrich_policy.cooldown_attempt_2_hours;
            END IF;
            v_next_eligible := NOW() + (v_cooldown_hours || ' hours')::INTERVAL;
        END IF;
    END IF;
    
    -- 2. Budget Reconciliation: Release unused reservation and commit actual cost
    IF v_mission.reservation_id IS NOT NULL THEN
        SELECT * INTO v_res 
        FROM public.atlas_person_enrichment_budget_reservations 
        WHERE reservation_id = v_mission.reservation_id 
        FOR UPDATE;
        
        IF v_res.reservation_id IS NOT NULL AND v_res.status = 'RESERVED' THEN
            -- Release from tenant config
            UPDATE public.atlas_person_enrichment_tenant_configs
            SET total_reserved = GREATEST(0, total_reserved - v_res.reserved_amount),
                total_spent = total_spent + v_mission.actual_cost,
                updated_at = NOW()
            WHERE tenant_id = v_mission.tenant_id;
            
            -- Release from original daily period
            UPDATE public.atlas_person_enrichment_daily_budgets
            SET daily_reserved = GREATEST(0, daily_reserved - v_res.reserved_amount),
                daily_spent = daily_spent + v_mission.actual_cost,
                updated_at = NOW()
            WHERE tenant_id = v_mission.tenant_id AND period_date = v_res.period_date;
            
            -- Update reservation record
            UPDATE public.atlas_person_enrichment_budget_reservations
            SET status = CASE WHEN v_mission.actual_cost > 0 THEN 'COMMITTED' ELSE 'RELEASED' END,
                committed_amount = v_mission.actual_cost,
                committed_at = CASE WHEN v_mission.actual_cost > 0 THEN NOW() ELSE NULL END,
                released_at = NOW()
            WHERE reservation_id = v_res.reservation_id;
        END IF;
    END IF;
    
    -- 3. Update Mission Record
    UPDATE public.atlas_person_enrichment_missions
    SET status = v_final_status,
        gap_resolution_status = CASE WHEN NOT v_gap_still_exists THEN 'GAP_RESOLVED' ELSE 'GAP_UNRESOLVED' END,
        coverage_state_hash_after = v_cov_dim.coverage_state_hash,
        next_eligible_at = v_next_eligible,
        completed_at = NOW()
    WHERE mission_id = p_mission_id;
    
    -- Append-Only Audit Event
    INSERT INTO public.atlas_person_enrichment_events (
        tenant_id,
        mission_id,
        event_type,
        to_status,
        execution_status,
        observation_status,
        identity_resolution_status,
        attachment_status,
        gap_resolution_status,
        details
    ) VALUES (
        v_mission.tenant_id,
        p_mission_id,
        'MISSION_FINALIZED',
        v_final_status::text,
        v_mission.execution_status,
        v_mission.observation_status,
        v_mission.identity_resolution_status,
        v_mission.attachment_status,
        CASE WHEN NOT v_gap_still_exists THEN 'GAP_RESOLVED' ELSE 'GAP_UNRESOLVED' END,
        jsonb_build_object(
            'gap_still_exists', v_gap_still_exists,
            'actual_cost', v_mission.actual_cost,
            'next_eligible_at', v_next_eligible
        )
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'mission_id', p_mission_id,
        'final_status', v_final_status,
        'gap_resolved', NOT v_gap_still_exists,
        'actual_cost', v_mission.actual_cost
    );
END;
$$;

-- 18. CORE RPC 6: RECONCILE STALE ENRICHMENT RESERVATIONS
CREATE OR REPLACE FUNCTION public.reconcile_stale_enrichment_reservations_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_res RECORD;
    v_mission RECORD;
    v_queue RECORD;
    v_reconciled_count INT := 0;
BEGIN
    FOR v_res IN 
        SELECT * 
        FROM public.atlas_person_enrichment_budget_reservations
        WHERE status = 'RESERVED' AND expires_at < NOW()
        FOR UPDATE
    LOOP
        SELECT * INTO v_mission FROM public.atlas_person_enrichment_missions WHERE mission_id = v_res.mission_id;
        
        -- Inspect Harvester queue job lease safety
        IF v_mission.harvester_job_id IS NOT NULL THEN
            SELECT * INTO v_queue FROM public.atlas_queues WHERE job_id = v_mission.harvester_job_id;
            -- If job is currently running under a valid worker lease, DO NOT release reservation
            IF v_queue.job_id IS NOT NULL AND v_queue.status = 'PROCESSING' AND v_queue.lock_expires_at > NOW() THEN
                CONTINUE;
            END IF;
        END IF;
        
        -- Release from tenant config
        UPDATE public.atlas_person_enrichment_tenant_configs
        SET total_reserved = GREATEST(0, total_reserved - v_res.reserved_amount),
            updated_at = NOW()
        WHERE tenant_id = v_res.tenant_id;
        
        -- Release from original daily period
        UPDATE public.atlas_person_enrichment_daily_budgets
        SET daily_reserved = GREATEST(0, daily_reserved - v_res.reserved_amount),
            updated_at = NOW()
        WHERE tenant_id = v_res.tenant_id AND period_date = v_res.period_date;
        
        -- Expire reservation
        UPDATE public.atlas_person_enrichment_budget_reservations
        SET status = 'EXPIRED',
            released_at = NOW()
        WHERE reservation_id = v_res.reservation_id;
        
        -- If mission is still non-terminal, transition to TIMEOUT
        IF v_mission.status IN ('PLANNED', 'AUTHORIZED', 'DISPATCHED') THEN
            UPDATE public.atlas_person_enrichment_missions
            SET status = 'TIMEOUT',
                terminal_reason = 'REASON_TIMEOUT',
                completed_at = NOW()
            WHERE mission_id = v_res.mission_id;
        END IF;
        
        v_reconciled_count := v_reconciled_count + 1;
    END LOOP;
    
    RETURN jsonb_build_object('success', true, 'reconciled_count', v_reconciled_count);
END;
$$;

-- 19. HELPER: ATOMIC POLICY ACTIVATION
CREATE OR REPLACE FUNCTION public.set_active_enrichment_policy_v1(
    p_version TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.atlas_person_enrichment_policies WHERE enrichment_policy_version = p_version) THEN
        RAISE EXCEPTION 'POLICY_NOT_FOUND: Policy version % does not exist', p_version;
    END IF;
    
    UPDATE public.atlas_person_enrichment_policies SET is_active = FALSE WHERE is_active = TRUE;
    UPDATE public.atlas_person_enrichment_policies SET is_active = TRUE WHERE enrichment_policy_version = p_version;
END;
$$;

-- 20. ROW LEVEL SECURITY & HARDENED GRANTS
ALTER TABLE public.atlas_person_enrichment_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_enrichment_source_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_enrichment_tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_enrichment_daily_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_enrichment_budget_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_enrichment_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_enrichment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_person_enrichment_events ENABLE ROW LEVEL SECURITY;

-- Global Tables: Public readable, service_role editable
CREATE POLICY enrichment_policies_read_all ON public.atlas_person_enrichment_policies
FOR SELECT TO authenticated, service_role USING (true);

CREATE POLICY source_capabilities_read_all ON public.atlas_person_enrichment_source_capabilities
FOR SELECT TO authenticated, service_role USING (true);

-- Tenant Tables: Strictly isolated by tenant_id
CREATE POLICY enrichment_tenant_configs_tenant_isolation ON public.atlas_person_enrichment_tenant_configs
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

CREATE POLICY enrichment_daily_budgets_tenant_isolation ON public.atlas_person_enrichment_daily_budgets
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

CREATE POLICY enrichment_reservations_tenant_isolation ON public.atlas_person_enrichment_budget_reservations
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

CREATE POLICY enrichment_missions_tenant_isolation ON public.atlas_person_enrichment_missions
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

CREATE POLICY enrichment_attempts_tenant_isolation ON public.atlas_person_enrichment_attempts
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

CREATE POLICY enrichment_events_tenant_isolation ON public.atlas_person_enrichment_events
FOR ALL TO authenticated, service_role
USING (tenant_id = (SELECT get_auth_tenant_id()))
WITH CHECK (tenant_id = (SELECT get_auth_tenant_id()));

-- Role Grants: Authenticated users get SELECT ONLY on missions & events
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
GRANT SELECT ON public.atlas_person_enrichment_missions TO authenticated;
GRANT SELECT ON public.atlas_person_enrichment_events TO authenticated;

-- Service Role gets execute on all mutation RPCs
REVOKE EXECUTE ON FUNCTION public.plan_person_enrichment_v1 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authorize_and_dispatch_enrichment_mission_v1 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_enrichment_result_v1 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_enrichment_resolution_v1 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_enrichment_mission_v1 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reconcile_stale_enrichment_reservations_v1 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_active_enrichment_policy_v1 FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.plan_person_enrichment_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_and_dispatch_enrichment_mission_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.record_enrichment_result_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.record_enrichment_resolution_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_enrichment_mission_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_enrichment_reservations_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.set_active_enrichment_policy_v1 TO service_role;
