-- ==========================================
-- ATLAS PHASE 10P-B: CONSUMER INTEREST & INTENT ENGINE V1
-- ==========================================

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE public.atlas_behavior_event_type AS ENUM (
        'CONTENT_ENGAGEMENT',
        'PUBLIC_COMMENT',
        'PUBLIC_POST',
        'INTERNAL_SEARCH',
        'PRODUCT_VIEW',
        'PRICE_CHECK',
        'REQUEST_FOR_INFO',
        'CART_ACTIVITY',
        'PURCHASE',
        'REPEAT_PURCHASE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_event_polarity AS ENUM (
        'POSITIVE',
        'NEGATIVE',
        'NEUTRAL'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_interest_intent_level AS ENUM (
        'UNKNOWN',
        'LOW',
        'MEDIUM',
        'HIGH'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Versioned Scoring Policies
CREATE TABLE IF NOT EXISTS public.atlas_scoring_policies (
    policy_version TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_until TIMESTAMPTZ,
    weights_json JSONB NOT NULL,
    decay_json JSONB NOT NULL,
    thresholds_json JSONB NOT NULL,
    schema_version TEXT NOT NULL DEFAULT '1.0',
    policy_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Person Behavior Events (Raw Observations)
CREATE TABLE IF NOT EXISTS public.atlas_person_behavior_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    
    event_type public.atlas_behavior_event_type NOT NULL,
    topic TEXT NOT NULL,
    product_ref TEXT,
    
    source_type TEXT NOT NULL,
    source_ref TEXT,
    evidence_ref TEXT,
    
    polarity public.atlas_event_polarity NOT NULL DEFAULT 'POSITIVE',
    confidence NUMERIC NOT NULL DEFAULT 1.0,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, event_hash)
);

CREATE INDEX idx_atlas_behavior_person_topic ON public.atlas_person_behavior_events(person_id, topic);
CREATE INDEX idx_atlas_behavior_tenant ON public.atlas_person_behavior_events(tenant_id);

-- 4. Person Interest State
CREATE TABLE IF NOT EXISTS public.atlas_person_interest_state (
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    
    interest_level public.atlas_interest_intent_level NOT NULL DEFAULT 'UNKNOWN',
    interest_score NUMERIC NOT NULL DEFAULT 0,
    
    evidence_count INT NOT NULL DEFAULT 0,
    last_signal_at TIMESTAMPTZ,
    
    policy_version TEXT NOT NULL REFERENCES public.atlas_scoring_policies(policy_version),
    evidence_snapshot_hash TEXT,
    
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    PRIMARY KEY(tenant_id, person_id, topic)
);

-- 5. Person Intent State
CREATE TABLE IF NOT EXISTS public.atlas_person_intent_state (
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    product_ref TEXT NOT NULL DEFAULT '*',
    
    intent_level public.atlas_interest_intent_level NOT NULL DEFAULT 'UNKNOWN',
    intent_score NUMERIC NOT NULL DEFAULT 0,
    
    evidence_count INT NOT NULL DEFAULT 0,
    last_signal_at TIMESTAMPTZ,
    
    policy_version TEXT NOT NULL REFERENCES public.atlas_scoring_policies(policy_version),
    evidence_snapshot_hash TEXT,
    reason_codes JSONB,
    
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    PRIMARY KEY(tenant_id, person_id, topic, product_ref)
);

-- 6. Row Level Security (RLS)
ALTER TABLE public.atlas_scoring_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_scoring_policies_read ON public.atlas_scoring_policies;
CREATE POLICY atlas_scoring_policies_read ON public.atlas_scoring_policies FOR SELECT USING (true); -- Policies are global definition

ALTER TABLE public.atlas_person_behavior_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_behavior_tenant_isolation ON public.atlas_person_behavior_events;
CREATE POLICY atlas_behavior_tenant_isolation ON public.atlas_person_behavior_events FOR ALL USING (tenant_id = public.get_auth_tenant_id());

ALTER TABLE public.atlas_person_interest_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_interest_state_tenant_isolation ON public.atlas_person_interest_state;
CREATE POLICY atlas_interest_state_tenant_isolation ON public.atlas_person_interest_state FOR ALL USING (tenant_id = public.get_auth_tenant_id());

ALTER TABLE public.atlas_person_intent_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_intent_state_tenant_isolation ON public.atlas_person_intent_state;
CREATE POLICY atlas_intent_state_tenant_isolation ON public.atlas_person_intent_state FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 7. Seed initial policy for testing/development
INSERT INTO public.atlas_scoring_policies (
    policy_version,
    weights_json,
    decay_json,
    thresholds_json,
    policy_hash
) VALUES (
    'v1.0.0-deterministic',
    '{
        "INTEREST": {
            "CONTENT_ENGAGEMENT": 5,
            "PUBLIC_COMMENT": 10,
            "PUBLIC_POST": 15,
            "INTERNAL_SEARCH": 20,
            "PRODUCT_VIEW": 20,
            "PRICE_CHECK": 25,
            "REQUEST_FOR_INFO": 30,
            "CART_ACTIVITY": 35,
            "PURCHASE": 40,
            "REPEAT_PURCHASE": 50
        },
        "INTENT": {
            "CONTENT_ENGAGEMENT": 1,
            "PUBLIC_COMMENT": 2,
            "PUBLIC_POST": 5,
            "INTERNAL_SEARCH": 15,
            "PRODUCT_VIEW": 20,
            "PRICE_CHECK": 30,
            "REQUEST_FOR_INFO": 40,
            "CART_ACTIVITY": 50,
            "PURCHASE": 20,
            "REPEAT_PURCHASE": 25
        }
    }',
    '{
        "half_life_days": {
            "INTEREST": 90,
            "INTENT": 14
        }
    }',
    '{
        "INTEREST": {
            "LOW": 10,
            "MEDIUM": 30,
            "HIGH": 60
        },
        "INTENT": {
            "LOW": 15,
            "MEDIUM": 35,
            "HIGH": 65
        }
    }',
    'seed-hash-v1'
) ON CONFLICT (policy_version) DO NOTHING;
