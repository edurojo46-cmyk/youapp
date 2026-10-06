-- Migration: 20260918000002_atlas_discovery_source_motors.sql
-- Description: Registry for Atlas Induction Discovery Engine Source Motors (Tesla Source Wheel)

CREATE TABLE IF NOT EXISTS public.atlas_discovery_source_motors (
    motor_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    source_family TEXT NOT NULL,
    partition_id TEXT NOT NULL,
    protocol TEXT NOT NULL,
    endpoint_reference TEXT NOT NULL,
    provider_rate_limit_scope TEXT NOT NULL,
    
    -- Policy & Legal Access Audit
    public_access BOOLEAN NOT NULL DEFAULT TRUE,
    terms_status TEXT NOT NULL DEFAULT 'PENDING_AUDIT',
    robots_status TEXT NOT NULL DEFAULT 'UNCHECKED',
    policy_status TEXT NOT NULL DEFAULT 'PENDING_AUDIT' CHECK (
        policy_status IN ('PENDING_AUDIT', 'APPROVED', 'REJECTED', 'RESTRICTED')
    ),
    policy_evidence_url TEXT,
    policy_checked_at TIMESTAMPTZ,
    rate_limit_policy JSONB DEFAULT '{}'::jsonb,

    -- Resilient Durable Checkpoint
    checkpoint JSONB DEFAULT '{}'::jsonb,

    -- Finite State Machine
    state TEXT NOT NULL DEFAULT 'DISCOVERED' CHECK (
        state IN ('DISCOVERED', 'PROFILED', 'CANARY', 'CERTIFIED', 'ACTIVE', 'THROTTLED', 'SLEEPING', 'EXHAUSTED', 'FAILED', 'RETIRED')
    ),

    -- Observed Physical Rates & Errors
    raw_supply_rate NUMERIC(10,2) DEFAULT 0,
    fresh_supply_rate NUMERIC(10,2) DEFAULT 0,
    net_new_rate NUMERIC(10,2) DEFAULT 0,
    error_rate NUMERIC(6,4) DEFAULT 0,
    overlap_observed NUMERIC(6,4),
    overlap_assumed NUMERIC(6,4),

    -- Distinct Depth Accounting (Records vs Estimated Persons vs Physically Verified)
    raw_source_record_depth BIGINT DEFAULT 0,
    estimated_person_depth BIGINT DEFAULT 0,
    verified_unique_person_depth BIGINT DEFAULT 0,
    depth_evidence_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (
        depth_evidence_status IN ('VERIFIED_ENDPOINT_COUNT', 'VERIFIED_MANIFEST', 'SAMPLED_ESTIMATE', 'EXTERNAL_DECLARED_ESTIMATE', 'UNKNOWN')
    ),
    depth_evidence_reference TEXT,

    already_processed BIGINT DEFAULT 0,
    remaining_estimated_depth BIGINT DEFAULT 0,
    remaining_verified_depth BIGINT DEFAULT 0,

    -- Architecture & Template Readiness
    motor_template_available BOOLEAN NOT NULL DEFAULT FALSE,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Invariants: Uniqueness on family + source + partition
    CONSTRAINT uq_atlas_discovery_source_motors_family_source_partition 
        UNIQUE(source_family, source_id, partition_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_discovery_source_motors_state 
    ON public.atlas_discovery_source_motors(state);

CREATE INDEX IF NOT EXISTS idx_atlas_discovery_source_motors_family 
    ON public.atlas_discovery_source_motors(source_family);

CREATE INDEX IF NOT EXISTS idx_atlas_discovery_source_motors_scope 
    ON public.atlas_discovery_source_motors(provider_rate_limit_scope);

-- Trigger to validate state transitions and policy invariant:
CREATE OR REPLACE FUNCTION public.fn_validate_atlas_source_motor_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Rule 1: A new motor cannot be directly inserted as ACTIVE
    IF TG_OP = 'INSERT' AND NEW.state = 'ACTIVE' THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: A new source motor cannot directly enter ACTIVE state. Must pass DISCOVERED -> PROFILED -> CANARY -> CERTIFIED.';
    END IF;

    -- Rule 2: Cannot enter CANARY or ACTIVE without APPROVED policy
    IF NEW.state IN ('CANARY', 'ACTIVE') AND NEW.policy_status != 'APPROVED' THEN
        RAISE EXCEPTION 'INVARIANT_VIOLATION: Motor % cannot enter state % because policy_status is % (must be APPROVED).',
            NEW.motor_id, NEW.state, NEW.policy_status;
    END IF;

    -- Rule 3: Valid state transitions on UPDATE
    IF TG_OP = 'UPDATE' AND OLD.state IS DISTINCT FROM NEW.state THEN
        IF OLD.state = 'DISCOVERED' AND NEW.state NOT IN ('PROFILED', 'FAILED', 'RETIRED') THEN
            RAISE EXCEPTION 'INVALID_TRANSITION: DISCOVERED cannot transition to % directly.', NEW.state;
        ELSIF OLD.state = 'PROFILED' AND NEW.state NOT IN ('CANARY', 'FAILED', 'RETIRED', 'DISCOVERED') THEN
            RAISE EXCEPTION 'INVALID_TRANSITION: PROFILED cannot transition to % directly.', NEW.state;
        ELSIF OLD.state = 'CANARY' AND NEW.state NOT IN ('CERTIFIED', 'FAILED', 'RETIRED', 'PROFILED') THEN
            RAISE EXCEPTION 'INVALID_TRANSITION: CANARY cannot transition to % directly.', NEW.state;
        ELSIF OLD.state = 'CERTIFIED' AND NEW.state NOT IN ('ACTIVE', 'RETIRED', 'CANARY') THEN
            RAISE EXCEPTION 'INVALID_TRANSITION: CERTIFIED cannot transition to % directly.', NEW.state;
        END IF;
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_atlas_source_motor_transition ON public.atlas_discovery_source_motors;
CREATE TRIGGER trg_validate_atlas_source_motor_transition
    BEFORE INSERT OR UPDATE ON public.atlas_discovery_source_motors
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_validate_atlas_source_motor_transition();
