-- ====================================================================
-- Migration: 20260908050000_atlas_person_observation_lifecycle_v1.sql
-- Subsystem: Person Observation Lifecycle V1
-- Contracts:
--   1. DISCOVERED staged outside atlas_people
--   2. OBSERVED is persistent person identity, excluded from canonical search, 10P-C, 10C, 10D
--   3. CANONICAL is qualified person directory, eligible for search & evaluations
--   4. atlas_people.lifecycle_stage has NO DEFAULT and NOT NULL
--   5. Search compatibility preserved forward-only
--   6. Subject-aware downstream guards on 10P-C, 10C, 10D
--   7. Append-only lifecycle event ledger with ON DELETE RESTRICT
-- ====================================================================

-- 1. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE public.atlas_person_lifecycle_stage AS ENUM (
        'OBSERVED',
        'CANONICAL'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_candidate_status AS ENUM (
        'PENDING_RESOLUTION',
        'PROMOTED_NEW',
        'ATTACHED_EXISTING',
        'AMBIGUOUS',
        'CONFLICT',
        'REJECTED',
        'EXPIRED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_candidate_source_type AS ENUM (
        'WEB_HARVEST',
        'API_CONNECTOR',
        'MANUAL_INGEST',
        'SOCIAL_MENTION',
        'SYSTEM_BRIDGE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_use_authority AS ENUM (
        'DISCOVERY_ONLY',
        'OBSERVATION_ALLOWED',
        'CANONICAL_ALLOWED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. ALTER ATLAS_PEOPLE (NO DEFAULT, NOT NULL, FORWARD-ONLY BACKFILL)
ALTER TABLE public.atlas_people 
ADD COLUMN IF NOT EXISTS lifecycle_stage public.atlas_person_lifecycle_stage;

UPDATE public.atlas_people 
SET lifecycle_stage = 'CANONICAL' 
WHERE lifecycle_stage IS NULL;

ALTER TABLE public.atlas_people 
ALTER COLUMN lifecycle_stage SET NOT NULL;

-- Ensure NO default exists so unreviewed inserts fail closed
ALTER TABLE public.atlas_people 
ALTER COLUMN lifecycle_stage DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_atlas_people_tenant_lifecycle 
ON public.atlas_people(tenant_id, lifecycle_stage);

-- 3. VERSIONED IMMUTABLE LIFECYCLE POLICIES
CREATE TABLE IF NOT EXISTS public.atlas_lifecycle_policies (
    policy_version TEXT PRIMARY KEY,
    
    min_identity_anchors INT NOT NULL DEFAULT 1,
    require_verified_anchor BOOLEAN NOT NULL DEFAULT TRUE,
    
    min_attribute_evidence_count INT NOT NULL DEFAULT 2,
    min_attribute_confidence NUMERIC NOT NULL DEFAULT 0.70,
    signal_freshness_days INT NOT NULL DEFAULT 30,
    min_intent_score NUMERIC NOT NULL DEFAULT 50.0,
    
    candidate_retention_days INT NOT NULL DEFAULT 30,
    
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutability trigger: prevents parameter modification on existing policy versions
CREATE OR REPLACE FUNCTION public.trg_enforce_lifecycle_policy_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.min_identity_anchors IS DISTINCT FROM NEW.min_identity_anchors) OR
       (OLD.require_verified_anchor IS DISTINCT FROM NEW.require_verified_anchor) OR
       (OLD.min_attribute_evidence_count IS DISTINCT FROM NEW.min_attribute_evidence_count) OR
       (OLD.min_attribute_confidence IS DISTINCT FROM NEW.min_attribute_confidence) OR
       (OLD.signal_freshness_days IS DISTINCT FROM NEW.signal_freshness_days) OR
       (OLD.min_intent_score IS DISTINCT FROM NEW.min_intent_score) OR
       (OLD.candidate_retention_days IS DISTINCT FROM NEW.candidate_retention_days) THEN
        RAISE EXCEPTION 'POLICY_IMMUTABLE: Policy parameters cannot be modified. Create a new policy version.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lifecycle_policy_immutability ON public.atlas_lifecycle_policies;
CREATE TRIGGER trg_lifecycle_policy_immutability
BEFORE UPDATE ON public.atlas_lifecycle_policies
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_lifecycle_policy_immutability();

CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_lifecycle_policy 
ON public.atlas_lifecycle_policies(is_active) 
WHERE is_active = TRUE;

INSERT INTO public.atlas_lifecycle_policies (
    policy_version,
    min_identity_anchors,
    require_verified_anchor,
    min_attribute_evidence_count,
    min_attribute_confidence,
    signal_freshness_days,
    min_intent_score,
    candidate_retention_days,
    is_active
) VALUES (
    'v1.0.0-deterministic',
    1,
    TRUE,
    2,
    0.70,
    30,
    50.0,
    30,
    TRUE
) ON CONFLICT (policy_version) DO NOTHING;

-- 4. SOURCE AUTHORITY REGISTRY
CREATE TABLE IF NOT EXISTS public.atlas_source_authority_registry (
    authority_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type public.atlas_candidate_source_type NOT NULL,
    source_authority TEXT NOT NULL,
    access_authority TEXT NOT NULL,
    maximum_use_authority public.atlas_use_authority NOT NULL,
    policy_version TEXT NOT NULL REFERENCES public.atlas_lifecycle_policies(policy_version),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_source_authority_lookup UNIQUE(source_type, source_authority, policy_version)
);

INSERT INTO public.atlas_source_authority_registry (
    source_type, source_authority, access_authority, maximum_use_authority, policy_version, is_active
) VALUES
    ('WEB_HARVEST', 'PUBLIC_WEB_CRAWL', 'PUBLIC_DATA', 'DISCOVERY_ONLY', 'v1.0.0-deterministic', TRUE),
    ('API_CONNECTOR', 'VERIFIED_PARTNER_FEED', 'LICENSED_PARTNER_API', 'CANONICAL_ALLOWED', 'v1.0.0-deterministic', TRUE),
    ('MANUAL_INGEST', 'ADMIN_MANUAL_ENTRY', 'FIRST_PARTY_ADMIN', 'CANONICAL_ALLOWED', 'v1.0.0-deterministic', TRUE),
    ('SOCIAL_MENTION', 'PUBLIC_TWITTER_MENTION', 'PUBLIC_DATA', 'OBSERVATION_ALLOWED', 'v1.0.0-deterministic', TRUE),
    ('SYSTEM_BRIDGE', 'INTERNAL_SYSTEM_DISCOVERY', 'FIRST_PARTY_AUTHORITATIVE', 'CANONICAL_ALLOWED', 'v1.0.0-deterministic', TRUE)
ON CONFLICT (source_type, source_authority, policy_version) DO NOTHING;

-- 5. HARVESTER QUEUE COLUMN CLOSURE
ALTER TABLE public.atlas_queues
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.atlas_tenants(tenant_id),
ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES public.atlas_sources(source_id),
ADD COLUMN IF NOT EXISTS source_authority TEXT,
ADD COLUMN IF NOT EXISTS use_authority public.atlas_use_authority NOT NULL DEFAULT 'DISCOVERY_ONLY';

-- 6. CANDIDATE STAGING DOMAIN
CREATE TABLE IF NOT EXISTS public.atlas_person_discovery_candidates (
    candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    
    candidate_identity_key TEXT NOT NULL,
    source_type public.atlas_candidate_source_type NOT NULL,
    source_ref TEXT NOT NULL,
    source_authority TEXT NOT NULL,
    access_authority TEXT NOT NULL,
    use_authority public.atlas_use_authority NOT NULL,
    
    source_payload_canonical_sha256 TEXT NOT NULL,
    extracted_name TEXT,
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    observation_count INT NOT NULL DEFAULT 1,
    
    candidate_status public.atlas_candidate_status NOT NULL DEFAULT 'PENDING_RESOLUTION',
    resolution_outcome TEXT,
    resolution_notes TEXT,
    resolved_person_id UUID REFERENCES public.atlas_people(person_id) ON DELETE SET NULL,
    
    policy_version TEXT NOT NULL REFERENCES public.atlas_lifecycle_policies(policy_version),
    expires_at TIMESTAMPTZ NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_candidate_tenant_identity_key UNIQUE(tenant_id, candidate_identity_key)
);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_status 
ON public.atlas_person_discovery_candidates(tenant_id, candidate_status);

CREATE INDEX IF NOT EXISTS idx_discovery_candidates_expiry 
ON public.atlas_person_discovery_candidates(expires_at) 
WHERE candidate_status = 'PENDING_RESOLUTION';

CREATE TABLE IF NOT EXISTS public.atlas_person_candidate_identifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES public.atlas_person_discovery_candidates(candidate_id) ON DELETE CASCADE,
    
    identifier_type public.atlas_identifier_type NOT NULL,
    normalized_value_hash TEXT NOT NULL,
    display_value TEXT,
    safe_value TEXT,
    
    is_stable_anchor BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
    confidence NUMERIC NOT NULL DEFAULT 0.50,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_candidate_identifier UNIQUE(tenant_id, candidate_id, identifier_type, normalized_value_hash)
);

CREATE INDEX IF NOT EXISTS idx_candidate_identifiers_lookup 
ON public.atlas_person_candidate_identifiers(tenant_id, identifier_type, normalized_value_hash);

-- 7. IMMUTABLE LIFECYCLE EVENT LEDGER
CREATE TABLE IF NOT EXISTS public.atlas_person_lifecycle_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE RESTRICT,
    
    from_stage public.atlas_person_lifecycle_stage,
    to_stage public.atlas_person_lifecycle_stage NOT NULL,
    
    reason_codes TEXT[] NOT NULL DEFAULT '{}',
    policy_version TEXT NOT NULL REFERENCES public.atlas_lifecycle_policies(policy_version),
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_candidate_id UUID REFERENCES public.atlas_person_discovery_candidates(candidate_id) ON DELETE SET NULL,
    
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_fingerprint TEXT NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_lifecycle_event_causal_identity UNIQUE(tenant_id, person_id, to_stage, event_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_person 
ON public.atlas_person_lifecycle_events(tenant_id, person_id, occurred_at DESC);

-- 8. DOWNSTREAM GUARDS (SUBJECT-AWARE VIA ATLAS_SUBJECT_REGISTRY)

-- 8A. Product Fit Guard (10P-C)
CREATE OR REPLACE FUNCTION public.trg_guard_product_fit_canonical()
RETURNS TRIGGER AS $$
DECLARE v_stage public.atlas_person_lifecycle_stage;
BEGIN
    SELECT lifecycle_stage INTO v_stage 
    FROM public.atlas_people 
    WHERE person_id = NEW.person_id;
    
    IF v_stage IS DISTINCT FROM 'CANONICAL' THEN
        RAISE EXCEPTION 'CANONICAL_REQUIRED: Product Fit cannot be evaluated for non-canonical person (lifecycle_stage=%)', v_stage;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_product_fit_canonical_ins ON public.atlas_person_product_fit_state;
CREATE TRIGGER trg_guard_product_fit_canonical_ins
BEFORE INSERT OR UPDATE ON public.atlas_person_product_fit_state
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_product_fit_canonical();

-- 8B. Channel Eligibility Guard (10C) - Subject-Aware
CREATE OR REPLACE FUNCTION public.trg_guard_channel_eligibility_canonical()
RETURNS TRIGGER AS $$
DECLARE 
    v_sub_type public.atlas_subject_type;
    v_stage public.atlas_person_lifecycle_stage;
BEGIN
    SELECT reg.subject_type, p.lifecycle_stage
    INTO v_sub_type, v_stage
    FROM public.atlas_subject_registry reg
    LEFT JOIN public.atlas_people p ON p.person_id = reg.person_id
    WHERE reg.subject_id = NEW.subject_id;
    
    IF v_sub_type = 'PERSON' AND v_stage IS DISTINCT FROM 'CANONICAL' THEN
        RAISE EXCEPTION 'CANONICAL_REQUIRED: Channel eligibility cannot be granted to non-canonical person (lifecycle_stage=%)', v_stage;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_channel_eligibility_canonical_ins ON public.atlas_channel_eligibility;
CREATE TRIGGER trg_guard_channel_eligibility_canonical_ins
BEFORE INSERT OR UPDATE ON public.atlas_channel_eligibility
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_channel_eligibility_canonical();

-- 8C. Next Best Action Guard (10D) - Subject-Aware & Tenant-Consistent
CREATE OR REPLACE FUNCTION public.trg_guard_nba_canonical()
RETURNS TRIGGER AS $$
DECLARE 
    v_sub_type public.atlas_subject_type;
    v_stage public.atlas_person_lifecycle_stage;
    v_person_tenant UUID;
BEGIN
    SELECT reg.subject_type, p.lifecycle_stage, p.tenant_id
    INTO v_sub_type, v_stage, v_person_tenant
    FROM public.atlas_subject_registry reg
    LEFT JOIN public.atlas_people p ON p.person_id = reg.person_id
    WHERE reg.subject_id = NEW.subject_id;
    
    IF v_sub_type = 'PERSON' THEN
        IF v_person_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'TENANT_MISMATCH: Person tenant does not match NBA tenant';
        END IF;
        IF v_stage IS DISTINCT FROM 'CANONICAL' THEN
            RAISE EXCEPTION 'CANONICAL_REQUIRED: Next Best Action cannot be generated for non-canonical person (lifecycle_stage=%)', v_stage;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_nba_canonical_ins ON public.atlas_next_best_action_state;
CREATE TRIGGER trg_guard_nba_canonical_ins
BEFORE INSERT OR UPDATE ON public.atlas_next_best_action_state
FOR EACH ROW EXECUTE FUNCTION public.trg_guard_nba_canonical();

-- 9. SEARCH COMPATIBILITY CLOSURE (FORWARD-ONLY REPLACEMENT)
-- Exact replacement of certified 042000 function incorporating strictly: AND p.lifecycle_stage = 'CANONICAL'
CREATE OR REPLACE FUNCTION public.search_canonical_persons_v1(
    p_search_query TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'ACTIVE',
    p_coverage_email BOOLEAN DEFAULT NULL,
    p_coverage_phone BOOLEAN DEFAULT NULL,
    p_eligibility_channel TEXT DEFAULT NULL,
    p_eligibility_action_type TEXT DEFAULT NULL,
    p_eligibility_status TEXT DEFAULT 'ELIGIBLE',
    p_residence_country TEXT DEFAULT NULL,
    p_residence_city TEXT DEFAULT NULL,
    p_residence_neighborhood TEXT DEFAULT NULL,
    p_profession TEXT DEFAULT NULL,
    p_company TEXT DEFAULT NULL,
    p_work_city TEXT DEFAULT NULL,
    p_has_photo BOOLEAN DEFAULT NULL,
    p_has_recent_signal BOOLEAN DEFAULT NULL,
    p_signal_topic TEXT DEFAULT NULL,
    p_signal_freshness_days INT DEFAULT NULL,
    p_interest_topic TEXT DEFAULT NULL,
    p_interest_level TEXT DEFAULT NULL,
    p_intent_topic TEXT DEFAULT NULL,
    p_intent_level TEXT DEFAULT NULL,
    p_min_intent_score NUMERIC DEFAULT NULL,
    p_product_id UUID DEFAULT NULL,
    p_offer_id UUID DEFAULT NULL,
    p_product_fit_level TEXT DEFAULT NULL,
    p_min_fit_score NUMERIC DEFAULT NULL,
    p_nba_status TEXT DEFAULT NULL,
    p_nba_action TEXT DEFAULT NULL,
    p_min_evidence_confidence NUMERIC DEFAULT NULL,
    p_age_from INT DEFAULT NULL,
    p_age_to INT DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'created_at',
    p_sort_asc BOOLEAN DEFAULT FALSE,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_sort_by TEXT;
    v_sort_asc BOOLEAN;
    v_page INT;
    v_page_size INT;
    v_offset INT;
    v_total_count BIGINT := 0;
    v_items JSONB := '[]'::jsonb;
BEGIN
    -- Derive tenant strictly from authentication context
    v_tenant_id := public.get_auth_tenant_id();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: missing auth tenant context';
    END IF;

    -- Strict sort whitelist
    IF p_sort_by IN ('created_at', 'full_name', 'nba_priority', 'fit_score', 'intent_score', 'last_signal_at') THEN
        v_sort_by := p_sort_by;
    ELSE
        v_sort_by := 'created_at';
    END IF;
    v_sort_asc := COALESCE(p_sort_asc, FALSE);

    -- Pagination clamping
    IF p_page_size IN (25, 50, 100) THEN
        v_page_size := p_page_size;
    ELSE
        v_page_size := 25;
    END IF;

    IF p_page IS NULL OR p_page < 1 THEN
        v_page := 1;
    ELSE
        v_page := p_page;
    END IF;
    v_offset := (v_page - 1) * v_page_size;

    WITH filtered_people AS (
        SELECT p.person_id, p.full_name, p.status, p.created_at
        FROM public.atlas_people p
        WHERE p.tenant_id = v_tenant_id
          AND p.lifecycle_stage = 'CANONICAL'
          AND (
              p_status IS NULL OR p_status = 'ALL' 
              OR p.status::TEXT = p_status
          )
          AND (
              p_search_query IS NULL OR TRIM(p_search_query) = ''
              OR p.full_name ILIKE ('%' || TRIM(p_search_query) || '%')
              OR (
                  TRIM(p_search_query) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  AND p.person_id = TRIM(p_search_query)::UUID
              )
          )
          -- Coverage filters (10P-A Factual Presence)
          AND (
              p_coverage_email IS NULL 
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_coverage cov 
                  WHERE cov.person_id = p.person_id 
                    AND cov.tenant_id = v_tenant_id 
                    AND cov.email_known = p_coverage_email
              )
          )
          AND (
              p_coverage_phone IS NULL 
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_coverage cov 
                  WHERE cov.person_id = p.person_id 
                    AND cov.tenant_id = v_tenant_id 
                    AND cov.phone_known = p_coverage_phone
              )
          )
          -- 10C Action-Level Channel Eligibility filter
          AND (
              p_eligibility_channel IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_channel_eligibility ce
                  WHERE ce.subject_id = p.person_id
                    AND ce.channel = p_eligibility_channel
                    AND (p_eligibility_action_type IS NULL OR ce.action_type::TEXT = p_eligibility_action_type)
                    AND (p_eligibility_status IS NULL OR ce.eligibility_status::TEXT = p_eligibility_status)
                    AND (ce.expires_at IS NULL OR ce.expires_at > NOW())
              )
          )
          -- Location filters with CONFLICT exclusion:
          -- Must have matching evidence AND must NOT have conflicting distinct values
          AND (
              p_residence_country IS NULL
              OR (
                  EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key = 'residence_country'
                        AND ev.normalized_value ILIKE p_residence_country
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
                  AND (
                      SELECT COUNT(DISTINCT ev2.normalized_value)
                      FROM public.atlas_person_attribute_evidence ev2
                      WHERE ev2.person_id = p.person_id
                        AND ev2.tenant_id = v_tenant_id
                        AND ev2.attribute_key = 'residence_country'
                        AND (ev2.valid_until IS NULL OR ev2.valid_until > NOW())
                  ) = 1
              )
          )
          AND (
              p_residence_city IS NULL
              OR (
                  EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key = 'residence_city'
                        AND ev.normalized_value ILIKE p_residence_city
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
                  AND (
                      SELECT COUNT(DISTINCT ev2.normalized_value)
                      FROM public.atlas_person_attribute_evidence ev2
                      WHERE ev2.person_id = p.person_id
                        AND ev2.tenant_id = v_tenant_id
                        AND ev2.attribute_key = 'residence_city'
                        AND (ev2.valid_until IS NULL OR ev2.valid_until > NOW())
                  ) = 1
              )
          )
          AND (
              p_residence_neighborhood IS NULL
              OR (
                  EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key = 'residence_neighborhood'
                        AND ev.normalized_value ILIKE p_residence_neighborhood
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
                  AND (
                      SELECT COUNT(DISTINCT ev2.normalized_value)
                      FROM public.atlas_person_attribute_evidence ev2
                      WHERE ev2.person_id = p.person_id
                        AND ev2.tenant_id = v_tenant_id
                        AND ev2.attribute_key = 'residence_neighborhood'
                        AND (ev2.valid_until IS NULL OR ev2.valid_until > NOW())
                  ) = 1
              )
          )
          -- Work filters with CONFLICT exclusion
          AND (
              p_profession IS NULL
              OR (
                  EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key = 'profession'
                        AND ev.normalized_value ILIKE ('%' || p_profession || '%')
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
                  AND (
                      SELECT COUNT(DISTINCT ev2.normalized_value)
                      FROM public.atlas_person_attribute_evidence ev2
                      WHERE ev2.person_id = p.person_id
                        AND ev2.tenant_id = v_tenant_id
                        AND ev2.attribute_key = 'profession'
                        AND (ev2.valid_until IS NULL OR ev2.valid_until > NOW())
                  ) = 1
              )
          )
          AND (
              p_company IS NULL
              OR (
                  EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key = 'company'
                        AND ev.normalized_value ILIKE ('%' || p_company || '%')
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
                  AND (
                      SELECT COUNT(DISTINCT ev2.normalized_value)
                      FROM public.atlas_person_attribute_evidence ev2
                      WHERE ev2.person_id = p.person_id
                        AND ev2.tenant_id = v_tenant_id
                        AND ev2.attribute_key = 'company'
                        AND (ev2.valid_until IS NULL OR ev2.valid_until > NOW())
                  ) = 1
              )
          )
          AND (
              p_work_city IS NULL
              OR (
                  EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key = 'work_city'
                        AND ev.normalized_value ILIKE p_work_city
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
                  AND (
                      SELECT COUNT(DISTINCT ev2.normalized_value)
                      FROM public.atlas_person_attribute_evidence ev2
                      WHERE ev2.person_id = p.person_id
                        AND ev2.tenant_id = v_tenant_id
                        AND ev2.attribute_key = 'work_city'
                        AND (ev2.valid_until IS NULL OR ev2.valid_until > NOW())
                  ) = 1
              )
          )
          -- Photo evidence filter
          AND (
              p_has_photo IS NULL
              OR (
                  p_has_photo = TRUE AND EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key IN ('photo_url', 'avatar_url', 'profile_photo')
                        AND ev.normalized_value IS NOT NULL
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
              )
              OR (
                  p_has_photo = FALSE AND NOT EXISTS (
                      SELECT 1 FROM public.atlas_person_attribute_evidence ev
                      WHERE ev.person_id = p.person_id
                        AND ev.tenant_id = v_tenant_id
                        AND ev.attribute_key IN ('photo_url', 'avatar_url', 'profile_photo')
                        AND ev.normalized_value IS NOT NULL
                        AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                  )
              )
          )
          -- Age filter via safe fail-closed ISO parser
          AND (
              p_age_from IS NULL AND p_age_to IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_attribute_evidence ev
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
                    AND ev.attribute_key = 'DOB'
                    AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
                    AND public.safe_parse_iso_date(ev.normalized_value) IS NOT NULL
                    AND (
                        p_age_from IS NULL 
                        OR date_part('year', age(CURRENT_DATE, public.safe_parse_iso_date(ev.normalized_value))) >= p_age_from
                    )
                    AND (
                        p_age_to IS NULL 
                        OR date_part('year', age(CURRENT_DATE, public.safe_parse_iso_date(ev.normalized_value))) <= p_age_to
                    )
              )
          )
          -- Behavioral signal freshness filter
          AND (
              p_has_recent_signal IS NULL
              OR (
                  p_has_recent_signal = TRUE AND (
                      EXISTS (
                          SELECT 1 FROM public.atlas_person_behavior_events bev
                          WHERE bev.person_id = p.person_id
                            AND bev.tenant_id = v_tenant_id
                            AND (p_signal_topic IS NULL OR bev.topic = p_signal_topic)
                            AND (
                                p_signal_freshness_days IS NULL 
                                OR bev.observed_at >= (NOW() - (p_signal_freshness_days || ' days')::INTERVAL)
                            )
                      )
                      OR EXISTS (
                          SELECT 1 FROM public.atlas_social_signals ss
                          WHERE ss.canonical_entity_type = 'PERSON'
                            AND ss.canonical_entity_id = p.person_id
                            AND (
                                p_signal_freshness_days IS NULL 
                                OR ss.detected_at >= (NOW() - (p_signal_freshness_days || ' days')::INTERVAL)
                            )
                      )
                  )
              )
          )
          -- Commercial Intent filter (10P-B)
          AND (
              p_intent_topic IS NULL AND p_intent_level IS NULL AND p_min_intent_score IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_intent_state it
                  WHERE it.person_id = p.person_id
                    AND it.tenant_id = v_tenant_id
                    AND (p_intent_topic IS NULL OR it.topic = p_intent_topic)
                    AND (p_intent_level IS NULL OR it.intent_level::TEXT = p_intent_level)
                    AND (p_min_intent_score IS NULL OR it.intent_score >= p_min_intent_score)
                    AND (it.expires_at IS NULL OR it.expires_at > NOW())
              )
          )
          -- Topic Interest filter (10P-B)
          AND (
              p_interest_topic IS NULL AND p_interest_level IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_interest_state intst
                  WHERE intst.person_id = p.person_id
                    AND intst.tenant_id = v_tenant_id
                    AND (p_interest_topic IS NULL OR intst.topic = p_interest_topic)
                    AND (p_interest_level IS NULL OR intst.interest_level::TEXT = p_interest_level)
                    AND (intst.expires_at IS NULL OR intst.expires_at > NOW())
              )
          )
          -- Product Fit filter (10P-C)
          AND (
              p_product_fit_level IS NULL AND p_min_fit_score IS NULL AND p_product_id IS NULL AND p_offer_id IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_product_fit_state pf
                  WHERE pf.person_id = p.person_id
                    AND pf.tenant_id = v_tenant_id
                    AND (p_product_id IS NULL OR pf.product_id = p_product_id)
                    AND (p_offer_id IS NULL OR pf.offer_id = p_offer_id)
                    AND (p_product_fit_level IS NULL OR pf.fit_level = p_product_fit_level)
                    AND (p_min_fit_score IS NULL OR pf.fit_score >= p_min_fit_score)
                    AND (pf.expires_at IS NULL OR pf.expires_at > NOW())
              )
          )
          -- Next Best Action filter (10D)
          AND (
              p_nba_status IS NULL AND p_nba_action IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_next_best_action_state nba
                  WHERE nba.subject_id = p.person_id
                    AND nba.tenant_id = v_tenant_id
                    AND (p_nba_status IS NULL OR nba.decision_status::TEXT = p_nba_status)
                    AND (p_nba_action IS NULL OR nba.recommended_action::TEXT = p_nba_action)
                    AND (nba.expires_at IS NULL OR nba.expires_at > NOW())
              )
          )
          -- Evidence confidence threshold
          AND (
              p_min_evidence_confidence IS NULL
              OR EXISTS (
                  SELECT 1 FROM public.atlas_person_attribute_evidence ev
                  WHERE ev.person_id = p.person_id
                    AND ev.tenant_id = v_tenant_id
                    AND ev.confidence >= p_min_evidence_confidence
                    AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
              )
          )
    ),
    paged_people AS (
        SELECT 
            fp.person_id,
            fp.full_name,
            fp.status,
            fp.created_at,
            COUNT(*) OVER() AS total_count
        FROM filtered_people fp
        ORDER BY
            CASE WHEN v_sort_by = 'created_at' AND NOT v_sort_asc THEN fp.created_at END DESC NULLS LAST,
            CASE WHEN v_sort_by = 'created_at' AND v_sort_asc THEN fp.created_at END ASC NULLS LAST,
            CASE WHEN v_sort_by = 'full_name' AND NOT v_sort_asc THEN fp.full_name END DESC NULLS LAST,
            CASE WHEN v_sort_by = 'full_name' AND v_sort_asc THEN fp.full_name END ASC NULLS LAST,
            fp.person_id DESC
        LIMIT v_page_size
        OFFSET v_offset
    )
    SELECT 
        COALESCE(MAX(pp.total_count), 0),
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'person_id', pp.person_id,
                    'full_name', pp.full_name,
                    'status', pp.status,
                    'created_at', pp.created_at,
                    'coverage', jsonb_build_object(
                        'email_known', COALESCE(cov.email_known, FALSE),
                        'phone_known', COALESCE(cov.phone_known, FALSE),
                        'telegram_known', COALESCE(cov.telegram_known, FALSE),
                        'instagram_known', COALESCE(cov.instagram_known, FALSE),
                        'linkedin_known', COALESCE(cov.linkedin_known, FALSE),
                        'identity_known', COALESCE(cov.identity_known, FALSE),
                        'last_updated_at', cov.last_updated_at
                    ),
                    'identifiers', COALESCE(idents.data, '[]'::jsonb),
                    'attributes', COALESCE(attr_lateral.attr_obj, '{}'::jsonb),
                    'age', CASE 
                        WHEN attr_lateral.attr_obj -> 'DOB' ->> 'status' = 'KNOWN'
                             AND public.safe_parse_iso_date(attr_lateral.attr_obj -> 'DOB' ->> 'value') IS NOT NULL
                        THEN date_part('year', age(CURRENT_DATE, public.safe_parse_iso_date(attr_lateral.attr_obj -> 'DOB' ->> 'value')))::INT
                        ELSE NULL
                    END,
                    'product_fit', CASE 
                        WHEN fit_lateral.fit_level IS NOT NULL THEN
                            jsonb_build_object(
                                'fit_level', fit_lateral.fit_level,
                                'fit_score', fit_lateral.fit_score,
                                'evidence_count', fit_lateral.evidence_count,
                                'reason_codes', fit_lateral.reason_codes
                            )
                        ELSE
                            jsonb_build_object(
                                'fit_level', 'UNKNOWN',
                                'fit_score', NULL,
                                'evidence_count', 0,
                                'reason_codes', '[]'::jsonb
                            )
                    END,
                    'nba', CASE 
                        WHEN nba_lateral.decision_status IS NOT NULL THEN
                            jsonb_build_object(
                                'recommended_action', nba_lateral.recommended_action,
                                'recommended_channel', nba_lateral.recommended_channel,
                                'decision_status', nba_lateral.decision_status,
                                'priority_score', nba_lateral.priority_score,
                                'estimated_action_cost', nba_lateral.estimated_action_cost,
                                'reason_codes', nba_lateral.reason_codes
                            )
                        ELSE NULL
                    END,
                    'channel_eligibility', COALESCE(elig_lateral.data, '[]'::jsonb),
                    'intent', CASE 
                        WHEN intent_lateral.intent_level IS NOT NULL THEN
                            jsonb_build_object(
                                'topic', intent_lateral.topic,
                                'intent_level', intent_lateral.intent_level,
                                'intent_score', intent_lateral.intent_score,
                                'last_signal_at', intent_lateral.last_signal_at
                            )
                        ELSE NULL
                    END,
                    'interest', CASE 
                        WHEN interest_lateral.interest_level IS NOT NULL THEN
                            jsonb_build_object(
                                'topic', interest_lateral.topic,
                                'interest_level', interest_lateral.interest_level,
                                'interest_score', interest_lateral.interest_score
                            )
                        ELSE NULL
                    END,
                    'has_photo_evidence', COALESCE(attr_lateral.attr_obj -> 'photo_url' ->> 'status' = 'KNOWN', FALSE),
                    'photo_displayable', FALSE
                )
                ORDER BY
                    CASE WHEN v_sort_by = 'created_at' AND NOT v_sort_asc THEN pp.created_at END DESC NULLS LAST,
                    CASE WHEN v_sort_by = 'created_at' AND v_sort_asc THEN pp.created_at END ASC NULLS LAST,
                    CASE WHEN v_sort_by = 'full_name' AND NOT v_sort_asc THEN pp.full_name END DESC NULLS LAST,
                    CASE WHEN v_sort_by = 'full_name' AND v_sort_asc THEN pp.full_name END ASC NULLS LAST,
                    pp.person_id DESC
            ),
            '[]'::jsonb
        )
    INTO v_total_count, v_items
    FROM paged_people pp
    LEFT JOIN public.atlas_person_coverage cov ON cov.person_id = pp.person_id AND cov.tenant_id = v_tenant_id
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'identifier_type', id.identifier_type::TEXT,
                'display_value', COALESCE(id.display_value, id.safe_value),
                'verification_status', id.verification_status
            )
        ) AS data
        FROM public.atlas_person_identifiers id
        WHERE id.person_id = pp.person_id AND id.tenant_id = v_tenant_id
    ) idents ON TRUE
    LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(
            attr_agg.attribute_key,
            jsonb_build_object(
                'value', CASE WHEN attr_agg.val_count > 1 THEN 'CONFLICT' ELSE attr_agg.sample_val END,
                'status', CASE WHEN attr_agg.val_count > 1 THEN 'CONFLICT' ELSE 'KNOWN' END,
                'confidence', attr_agg.max_conf
            )
        ) AS attr_obj
        FROM (
            SELECT 
                ev.attribute_key,
                COUNT(DISTINCT ev.normalized_value) AS val_count,
                MAX(ev.normalized_value) AS sample_val,
                MAX(ev.confidence) AS max_conf
            FROM public.atlas_person_attribute_evidence ev
            WHERE ev.person_id = pp.person_id
              AND ev.tenant_id = v_tenant_id
              AND (ev.valid_until IS NULL OR ev.valid_until > NOW())
            GROUP BY ev.attribute_key
        ) attr_agg
    ) attr_lateral ON TRUE
    LEFT JOIN LATERAL (
        SELECT 
            pf.fit_level,
            pf.fit_score,
            pf.evidence_count,
            pf.reason_codes
        FROM public.atlas_person_product_fit_state pf
        WHERE pf.person_id = pp.person_id
          AND pf.tenant_id = v_tenant_id
          AND (pf.expires_at IS NULL OR pf.expires_at > NOW())
        ORDER BY pf.fit_score DESC
        LIMIT 1
    ) fit_lateral ON TRUE
    LEFT JOIN LATERAL (
        SELECT 
            nba.recommended_action::TEXT AS recommended_action,
            nba.recommended_channel,
            nba.decision_status::TEXT AS decision_status,
            nba.priority_score,
            nba.estimated_action_cost::TEXT AS estimated_action_cost,
            nba.reason_codes
        FROM public.atlas_next_best_action_state nba
        WHERE nba.subject_id = pp.person_id
          AND nba.tenant_id = v_tenant_id
          AND (nba.expires_at IS NULL OR nba.expires_at > NOW())
        ORDER BY nba.priority_score DESC NULLS LAST
        LIMIT 1
    ) nba_lateral ON TRUE
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'channel', ce.channel,
                'action_type', ce.action_type::TEXT,
                'eligibility_status', ce.eligibility_status::TEXT,
                'reason_codes', ce.reason_codes
            )
        ) AS data
        FROM public.atlas_channel_eligibility ce
        WHERE ce.subject_id = pp.person_id
          AND (ce.expires_at IS NULL OR ce.expires_at > NOW())
    ) elig_lateral ON TRUE
    LEFT JOIN LATERAL (
        SELECT 
            it.topic,
            it.intent_level::TEXT AS intent_level,
            it.intent_score,
            it.last_signal_at
        FROM public.atlas_person_intent_state it
        WHERE it.person_id = pp.person_id
          AND it.tenant_id = v_tenant_id
          AND (it.expires_at IS NULL OR it.expires_at > NOW())
        ORDER BY it.intent_score DESC
        LIMIT 1
    ) intent_lateral ON TRUE
    LEFT JOIN LATERAL (
        SELECT 
            intst.topic,
            intst.interest_level::TEXT AS interest_level,
            intst.interest_score
        FROM public.atlas_person_interest_state intst
        WHERE intst.person_id = pp.person_id
          AND intst.tenant_id = v_tenant_id
          AND (intst.expires_at IS NULL OR intst.expires_at > NOW())
        ORDER BY intst.interest_score DESC
        LIMIT 1
    ) interest_lateral ON TRUE;

    RETURN jsonb_build_object(
        'page', v_page,
        'page_size', v_page_size,
        'total_count', v_total_count,
        'total_pages', CASE WHEN v_total_count = 0 THEN 0 ELSE CEIL(v_total_count::NUMERIC / v_page_size::NUMERIC)::INT END,
        'items', v_items
    );
END;
$$;

REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM anon;
REVOKE ALL ON FUNCTION public.search_canonical_persons_v1 FROM service_role;
GRANT EXECUTE ON FUNCTION public.search_canonical_persons_v1 TO authenticated;

-- 10. TRANSACTIONAL RPCS FOR CANDIDATE INGESTION & PROMOTION

-- 10A. Ingest from Browser UI (authenticated context)
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
SET search_path = public
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

    v_canonical_hash := encode(digest(p_payload::TEXT, 'sha256'), 'hex');
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

-- 10B. Ingest from Harvester Worker (service_role context with job lock)
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
SET search_path = public
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

    v_canonical_hash := encode(digest(p_payload::TEXT, 'sha256'), 'hex');
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

-- 10C. Promote Candidate to OBSERVED (Deterministic Gate 1)
CREATE OR REPLACE FUNCTION public.promote_candidate_to_observed_v1(
    p_candidate_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        v_cause_hash := encode(digest(p_candidate_id::TEXT || ':' || v_cand.source_payload_canonical_sha256, 'sha256'), 'hex');
        v_event_fp := encode(digest(
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
            reason_codes,
            policy_version,
            evidence_refs,
            source_candidate_id,
            event_fingerprint
        ) VALUES (
            v_cand.tenant_id,
            v_person_id,
            NULL,
            'OBSERVED',
            ARRAY['REASON_ANCHOR_IDENTIFIER_RESOLVED'],
            v_policy.policy_version,
            jsonb_build_array(p_candidate_id::TEXT),
            p_candidate_id,
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

-- 10D. Promote OBSERVED to CANONICAL (Deterministic Gate 2)
CREATE OR REPLACE FUNCTION public.promote_observed_to_canonical_v1(
    p_person_id UUID,
    p_reason_override TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    v_cause_hash := encode(digest(v_evidence_refs::TEXT || ':' || ARRAY_TO_STRING(v_reasons, ','), 'sha256'), 'hex');
    v_event_fp := encode(digest(
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

-- 10E. Cleanup Expired Candidates Sweep
CREATE OR REPLACE FUNCTION public.cleanup_expired_candidates_v1(
    p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tid UUID;
    v_count INT;
BEGIN
    v_tid := COALESCE(p_tenant_id, public.get_auth_tenant_id());
    
    UPDATE public.atlas_person_discovery_candidates
    SET candidate_status = 'EXPIRED',
        resolution_outcome = 'EXPIRED',
        resolution_notes = 'Candidate retention expired during sweep',
        updated_at = NOW()
    WHERE (v_tid IS NULL OR tenant_id = v_tid)
      AND candidate_status = 'PENDING_RESOLUTION'
      AND expires_at < NOW();
      
    GET DIAGNOSTICS v_count = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'expired_count', v_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_candidates_v1 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_candidates_v1 TO authenticated, service_role;

-- 10F. Policy Switch (service_role only)
CREATE OR REPLACE FUNCTION public.set_active_lifecycle_policy(
    p_policy_version TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_target RECORD;
BEGIN
    SELECT * INTO v_target 
    FROM public.atlas_lifecycle_policies 
    WHERE policy_version = p_policy_version;
    
    IF v_target.policy_version IS NULL THEN
        RAISE EXCEPTION 'POLICY_NOT_FOUND: Version % does not exist', p_policy_version;
    END IF;

    -- Deactivate current active policies
    UPDATE public.atlas_lifecycle_policies 
    SET is_active = FALSE 
    WHERE is_active = TRUE;

    -- Activate target version
    UPDATE public.atlas_lifecycle_policies 
    SET is_active = TRUE 
    WHERE policy_version = p_policy_version;

    RETURN jsonb_build_object(
        'status', 'ACTIVE_POLICY_SWITCHED',
        'policy_version', p_policy_version
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_lifecycle_policy FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_active_lifecycle_policy TO service_role;

-- 11. ROW LEVEL SECURITY
ALTER TABLE public.atlas_lifecycle_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_lifecycle_policies_read ON public.atlas_lifecycle_policies;
CREATE POLICY atlas_lifecycle_policies_read ON public.atlas_lifecycle_policies FOR SELECT USING (true);

ALTER TABLE public.atlas_source_authority_registry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_source_authority_read ON public.atlas_source_authority_registry;
CREATE POLICY atlas_source_authority_read ON public.atlas_source_authority_registry FOR SELECT USING (true);

ALTER TABLE public.atlas_person_discovery_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_candidates_tenant_isolation ON public.atlas_person_discovery_candidates;
CREATE POLICY atlas_candidates_tenant_isolation ON public.atlas_person_discovery_candidates
FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

ALTER TABLE public.atlas_person_candidate_identifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_candidate_identifiers_tenant_isolation ON public.atlas_person_candidate_identifiers;
CREATE POLICY atlas_candidate_identifiers_tenant_isolation ON public.atlas_person_candidate_identifiers
FOR ALL USING (tenant_id = public.get_auth_tenant_id()) WITH CHECK (tenant_id = public.get_auth_tenant_id());

ALTER TABLE public.atlas_person_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_lifecycle_events_tenant_read ON public.atlas_person_lifecycle_events;
CREATE POLICY atlas_lifecycle_events_tenant_read ON public.atlas_person_lifecycle_events
FOR SELECT USING (tenant_id = public.get_auth_tenant_id());
