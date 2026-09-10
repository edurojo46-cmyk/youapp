-- Migration: 20260910170000_atlas_semantic_facts_and_relationships_v1.sql
-- Description: Atlas Semantic Intelligence — Semantic Facts, Relationships, Provenance Ledger & Rule-Based Inferences V1
-- Subsystem: Semantic Intelligence / Facts & Relationships Layer
-- Safety: Forward-only migration. Preserves all previous migrations (00001..20260910161000) without modification.

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE public.atlas_semantic_knowledge_type AS ENUM (
        'RAW_OBSERVATION',
        'CLAIM',
        'FACT',
        'INFERENCE',
        'PREDICTION',
        'USER_CONFIRMED_FACT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_semantic_fact_status AS ENUM (
        'ACTIVE',
        'SUPERSEDED',
        'DISPUTED',
        'RETRACTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_semantic_inference_status AS ENUM (
        'ACTIVE',
        'STALE',
        'RETRACTED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_semantic_validation_method AS ENUM (
        'MULTI_SOURCE_CORROBORATION',
        'AUTHORITATIVE_SOURCE',
        'USER_CONFIRMATION',
        'SYSTEM_RULE',
        'UNVALIDATED_CLAIM'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 2. PREDICATE REGISTRY TABLE (DYNAMIC GOVERNED REGISTRY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_semantic_predicates (
    predicate_code TEXT PRIMARY KEY,
    subject_entity_types public.atlas_canonical_entity_type[] NOT NULL,
    object_kind TEXT NOT NULL CHECK (object_kind IN ('LITERAL_VALUE', 'CANONICAL_ENTITY')),
    object_entity_types public.atlas_canonical_entity_type[],
    object_value_type TEXT CHECK (object_value_type IN ('TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'MONEY', 'PERCENTAGE', 'JSON_STRUCTURED')),
    cardinality TEXT NOT NULL CHECK (cardinality IN ('SINGLE', 'MULTIPLE')),
    temporal_mode TEXT NOT NULL CHECK (temporal_mode IN ('TIME_VARYING', 'STATIC', 'POINT_IN_TIME')),
    contradiction_mode TEXT NOT NULL CHECK (contradiction_mode IN ('VALUE_EXCLUSIVE', 'NON_EXCLUSIVE', 'TEMPORAL_SINGLE_VALUE')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_pred_object_kind_consistency CHECK (
        (object_kind = 'LITERAL_VALUE' AND object_value_type IS NOT NULL AND object_entity_types IS NULL) OR
        (object_kind = 'CANONICAL_ENTITY' AND object_entity_types IS NOT NULL AND object_value_type IS NULL)
    )
);

-- Seed core governed predicates V1
INSERT INTO public.atlas_semantic_predicates (
    predicate_code, subject_entity_types, object_kind, object_entity_types, object_value_type, cardinality, temporal_mode, contradiction_mode, description
) VALUES
    -- Relationships (Canonical Entity -> Canonical Entity)
    ('WORKS_AT', ARRAY['PERSON']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Person works at an organization'),
    ('FOUNDED_BY', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['PERSON']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'STATIC', 'NON_EXCLUSIVE', 'Organization founded by a person'),
    ('LOCATED_IN', ARRAY['PERSON', 'COMPANY', 'ORGANIZATION', 'SERVICE']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['LOCATION']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Entity located in a geographic location'),
    ('HEADQUARTERED_IN', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['LOCATION']::public.atlas_canonical_entity_type[], NULL, 'SINGLE', 'TIME_VARYING', 'TEMPORAL_SINGLE_VALUE', 'Primary corporate headquarters location'),
    ('OFFERS', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['PRODUCT', 'SERVICE']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Organization provides product or service'),
    ('EMPLOYS', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['PERSON']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Organization employs a person'),
    ('INTERESTED_IN', ARRAY['PERSON', 'COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['PRODUCT', 'SERVICE']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Expressed interest in product or service'),
    ('HAS_NEED', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['SERVICE', 'PRODUCT']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Operational need for product or service'),
    ('OPENED_LOCATION', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['LOCATION']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'POINT_IN_TIME', 'NON_EXCLUSIVE', 'Expanded/opened a new location'),
    ('EXPANDED_TO', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['LOCATION']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'POINT_IN_TIME', 'NON_EXCLUSIVE', 'Market or geographic expansion to location'),
    ('ASSOCIATED_WITH', ARRAY['PERSON', 'COMPANY', 'ORGANIZATION', 'PRODUCT', 'SERVICE', 'LOCATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['PERSON', 'COMPANY', 'ORGANIZATION', 'PRODUCT', 'SERVICE', 'LOCATION']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'General semantic association between entities'),
    ('OWNS', ARRAY['PERSON', 'COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['COMPANY', 'ORGANIZATION', 'PRODUCT']::public.atlas_canonical_entity_type[], NULL, 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Ownership relationship'),
    ('BELONGS_TO', ARRAY['PRODUCT', 'SERVICE']::public.atlas_canonical_entity_type[], 'CANONICAL_ENTITY', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], NULL, 'SINGLE', 'STATIC', 'TEMPORAL_SINGLE_VALUE', 'Product/Service belongs to organization'),
    
    -- Facts (Canonical Entity -> Literal / Typed Value)
    ('EMPLOYEE_COUNT', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'LITERAL_VALUE', NULL, 'INTEGER', 'SINGLE', 'TIME_VARYING', 'TEMPORAL_SINGLE_VALUE', 'Reported number of employees'),
    ('INDUSTRY', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'LITERAL_VALUE', NULL, 'TEXT', 'MULTIPLE', 'STATIC', 'NON_EXCLUSIVE', 'Primary or secondary industry sector'),
    ('ANNUAL_REVENUE', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'LITERAL_VALUE', NULL, 'MONEY', 'SINGLE', 'TIME_VARYING', 'TEMPORAL_SINGLE_VALUE', 'Annual revenue figure'),
    ('TECH_STACK', ARRAY['COMPANY', 'PRODUCT', 'SERVICE']::public.atlas_canonical_entity_type[], 'LITERAL_VALUE', NULL, 'TEXT', 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Technology or tool used'),
    ('HAS_ROLE', ARRAY['PERSON']::public.atlas_canonical_entity_type[], 'LITERAL_VALUE', NULL, 'TEXT', 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Job title or role held by person'),
    ('HIRING_FOR_ROLE', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'LITERAL_VALUE', NULL, 'TEXT', 'MULTIPLE', 'TIME_VARYING', 'NON_EXCLUSIVE', 'Specific role or title being hired'),
    ('OPEN_POSITIONS_COUNT', ARRAY['COMPANY', 'ORGANIZATION']::public.atlas_canonical_entity_type[], 'LITERAL_VALUE', NULL, 'INTEGER', 'SINGLE', 'TIME_VARYING', 'TEMPORAL_SINGLE_VALUE', 'Total open job positions count')
ON CONFLICT (predicate_code) DO NOTHING;

-- ============================================================================
-- 3. SEMANTIC FACTS TABLE (LITERAL / TYPED VALUE ASSERTIONS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_semantic_facts (
    fact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    subject_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE CASCADE,
    
    predicate_code TEXT NOT NULL REFERENCES public.atlas_semantic_predicates(predicate_code),
    value_type TEXT NOT NULL CHECK (value_type IN ('TEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'MONEY', 'PERCENTAGE', 'JSON_STRUCTURED')),
    object_value JSONB NOT NULL,
    
    knowledge_type public.atlas_semantic_knowledge_type NOT NULL DEFAULT 'CLAIM',
    confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence >= 0.000 AND confidence <= 1.000),
    
    validation_method public.atlas_semantic_validation_method NOT NULL DEFAULT 'UNVALIDATED_CLAIM',
    validated_at TIMESTAMPTZ,
    validated_by_type TEXT,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    
    status public.atlas_semantic_fact_status NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_fact_temporal_validity CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_atlas_facts_subject_pred 
ON public.atlas_semantic_facts(tenant_id, subject_entity_id, predicate_code, status);

CREATE INDEX IF NOT EXISTS idx_atlas_facts_temporal 
ON public.atlas_semantic_facts(tenant_id, valid_from, valid_to);

ALTER TABLE public.atlas_semantic_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_facts_tenant_isolation 
ON public.atlas_semantic_facts 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 4. SEMANTIC FACT EVIDENCE (MANY-TO-MANY PROVENANCE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_semantic_fact_evidence (
    evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    fact_id UUID NOT NULL REFERENCES public.atlas_semantic_facts(fact_id) ON DELETE CASCADE,
    source_observation_id UUID NOT NULL REFERENCES public.atlas_entity_source_observations(observation_id) ON DELETE CASCADE,
    
    evidence_role TEXT NOT NULL DEFAULT 'PRIMARY_OBSERVATION',
    confidence_contribution NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence_contribution >= 0.000 AND confidence_contribution <= 1.000),
    evidence_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_fact_evidence UNIQUE (tenant_id, fact_id, source_observation_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_fact_ev_obs 
ON public.atlas_semantic_fact_evidence(tenant_id, source_observation_id);

ALTER TABLE public.atlas_semantic_fact_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_fact_ev_tenant_isolation 
ON public.atlas_semantic_fact_evidence 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 5. SEMANTIC RELATIONSHIPS TABLE (ENTITY -> ENTITY GRAPH EDGES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_semantic_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    subject_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE CASCADE,
    predicate_code TEXT NOT NULL REFERENCES public.atlas_semantic_predicates(predicate_code),
    object_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE CASCADE,
    
    knowledge_type public.atlas_semantic_knowledge_type NOT NULL DEFAULT 'CLAIM',
    confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence >= 0.000 AND confidence <= 1.000),
    
    validation_method public.atlas_semantic_validation_method NOT NULL DEFAULT 'UNVALIDATED_CLAIM',
    validated_at TIMESTAMPTZ,
    validated_by_type TEXT,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_rel_distinct_entities CHECK (subject_entity_id != object_entity_id),
    CONSTRAINT chk_rel_temporal_validity CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_atlas_rel_subject_pred 
ON public.atlas_semantic_relationships(tenant_id, subject_entity_id, predicate_code) 
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_atlas_rel_object_pred 
ON public.atlas_semantic_relationships(tenant_id, object_entity_id, predicate_code) 
WHERE is_active = TRUE;

ALTER TABLE public.atlas_semantic_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_relationships_tenant_isolation 
ON public.atlas_semantic_relationships 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 6. SEMANTIC RELATIONSHIP EVIDENCE (MANY-TO-MANY PROVENANCE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_semantic_relationship_evidence (
    evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    relationship_id UUID NOT NULL REFERENCES public.atlas_semantic_relationships(relationship_id) ON DELETE CASCADE,
    source_observation_id UUID NOT NULL REFERENCES public.atlas_entity_source_observations(observation_id) ON DELETE CASCADE,
    
    evidence_role TEXT NOT NULL DEFAULT 'PRIMARY_OBSERVATION',
    confidence_contribution NUMERIC(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence_contribution >= 0.000 AND confidence_contribution <= 1.000),
    evidence_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_rel_evidence UNIQUE (tenant_id, relationship_id, source_observation_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_rel_ev_obs 
ON public.atlas_semantic_relationship_evidence(tenant_id, source_observation_id);

ALTER TABLE public.atlas_semantic_relationship_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_rel_ev_tenant_isolation 
ON public.atlas_semantic_relationship_evidence 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 7. SEMANTIC INFERENCES & INFERENCE EVIDENCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_semantic_inferences (
    inference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    subject_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE CASCADE,
    
    inference_type TEXT NOT NULL,
    inference_rule TEXT NOT NULL,
    inference_rule_version INT NOT NULL DEFAULT 1,
    
    confidence NUMERIC(4,3) NOT NULL CHECK (confidence >= 0.000 AND confidence <= 1.000),
    explanation TEXT NOT NULL,
    status public.atlas_semantic_inference_status NOT NULL DEFAULT 'ACTIVE',
    
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_inferences_subject 
ON public.atlas_semantic_inferences(tenant_id, subject_entity_id, status);

ALTER TABLE public.atlas_semantic_inferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_inferences_tenant_isolation 
ON public.atlas_semantic_inferences 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

CREATE TABLE IF NOT EXISTS public.atlas_semantic_inference_evidence (
    evidence_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    inference_id UUID NOT NULL REFERENCES public.atlas_semantic_inferences(inference_id) ON DELETE CASCADE,
    
    fact_id UUID REFERENCES public.atlas_semantic_facts(fact_id) ON DELETE CASCADE,
    relationship_id UUID REFERENCES public.atlas_semantic_relationships(relationship_id) ON DELETE CASCADE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_inference_evidence_xor CHECK (
        (fact_id IS NOT NULL AND relationship_id IS NULL) OR
        (fact_id IS NULL AND relationship_id IS NOT NULL)
    ),
    CONSTRAINT uq_inference_evidence UNIQUE (tenant_id, inference_id, fact_id, relationship_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_inf_ev_fact 
ON public.atlas_semantic_inference_evidence(tenant_id, fact_id) 
WHERE fact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_inf_ev_rel 
ON public.atlas_semantic_inference_evidence(tenant_id, relationship_id) 
WHERE relationship_id IS NOT NULL;

ALTER TABLE public.atlas_semantic_inference_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_inf_ev_tenant_isolation 
ON public.atlas_semantic_inference_evidence 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 8. CONTRADICTION LEDGER (PERSISTENT CONFLICT TRACKING)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_semantic_contradictions (
    contradiction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    subject_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE CASCADE,
    predicate_code TEXT NOT NULL REFERENCES public.atlas_semantic_predicates(predicate_code),
    
    contradiction_type TEXT NOT NULL DEFAULT 'TEMPORAL_OVERLAP_EXCLUSIVE_VALUE',
    status TEXT NOT NULL DEFAULT 'UNRESOLVED' CHECK (status IN ('UNRESOLVED', 'RESOLVED', 'DISMISSED')),
    resolution_notes TEXT,
    
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_contradictions_subject 
ON public.atlas_semantic_contradictions(tenant_id, subject_entity_id, status);

ALTER TABLE public.atlas_semantic_contradictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_contradictions_tenant_isolation 
ON public.atlas_semantic_contradictions 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

CREATE TABLE IF NOT EXISTS public.atlas_semantic_contradiction_claims (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    contradiction_id UUID NOT NULL REFERENCES public.atlas_semantic_contradictions(contradiction_id) ON DELETE CASCADE,
    fact_id UUID NOT NULL REFERENCES public.atlas_semantic_facts(fact_id) ON DELETE CASCADE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_contradiction_fact UNIQUE (tenant_id, contradiction_id, fact_id)
);

ALTER TABLE public.atlas_semantic_contradiction_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_semantic_contradiction_claims_tenant_isolation 
ON public.atlas_semantic_contradiction_claims 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id())
WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 9. DB-LEVEL FAIL-CLOSED PII & RECURSIVE VALUE GUARDS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_enforce_no_plaintext_pii_recursive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raw_text TEXT;
    v_forbidden_keys TEXT[] := ARRAY[
        'email', 'phone', 'telephone', 'mobile',
        'password', 'token', 'secret', 'authorization',
        'cookie', 'session', 'auth_token', 'access_token',
        'refresh_token', 'api_key', 'bearer'
    ];
    v_key TEXT;
BEGIN
    -- 1. Check raw text conversion for plaintext email patterns
    IF TG_TABLE_NAME = 'atlas_semantic_facts' THEN
        v_raw_text := (NEW.object_value::text || ' ' || NEW.metadata::text);
    ELSIF TG_TABLE_NAME = 'atlas_semantic_fact_evidence' OR TG_TABLE_NAME = 'atlas_semantic_relationship_evidence' THEN
        v_raw_text := NEW.evidence_metadata::text;
    ELSIF TG_TABLE_NAME = 'atlas_semantic_relationships' THEN
        v_raw_text := NEW.metadata::text;
    ELSIF TG_TABLE_NAME = 'atlas_semantic_inferences' THEN
        v_raw_text := (NEW.explanation || ' ' || NEW.metadata::text);
    END IF;

    IF v_raw_text IS NOT NULL THEN
        -- Check regex email pattern
        IF v_raw_text ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN
            RAISE EXCEPTION 'SEMANTIC_PII_VIOLATION: Plaintext email address detected in % payload. Use SHA-256 canonical hash.', TG_TABLE_NAME;
        END IF;

        -- Check forbidden credential/contact keys inside payload
        FOREACH v_key IN ARRAY v_forbidden_keys LOOP
            IF v_raw_text ~* ('"' || v_key || '"\s*:') THEN
                RAISE EXCEPTION 'SEMANTIC_PII_VIOLATION: Forbidden credential/contact key "%" detected in % payload.', v_key, TG_TABLE_NAME;
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_facts_pii_check ON public.atlas_semantic_facts;
CREATE TRIGGER trg_facts_pii_check
BEFORE INSERT OR UPDATE ON public.atlas_semantic_facts
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_no_plaintext_pii_recursive();

DROP TRIGGER IF EXISTS trg_fact_ev_pii_check ON public.atlas_semantic_fact_evidence;
CREATE TRIGGER trg_fact_ev_pii_check
BEFORE INSERT OR UPDATE ON public.atlas_semantic_fact_evidence
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_no_plaintext_pii_recursive();

DROP TRIGGER IF EXISTS trg_rel_pii_check ON public.atlas_semantic_relationships;
CREATE TRIGGER trg_rel_pii_check
BEFORE INSERT OR UPDATE ON public.atlas_semantic_relationships
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_no_plaintext_pii_recursive();

DROP TRIGGER IF EXISTS trg_rel_ev_pii_check ON public.atlas_semantic_relationship_evidence;
CREATE TRIGGER trg_rel_ev_pii_check
BEFORE INSERT OR UPDATE ON public.atlas_semantic_relationship_evidence
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_no_plaintext_pii_recursive();

DROP TRIGGER IF EXISTS trg_inf_pii_check ON public.atlas_semantic_inferences;
CREATE TRIGGER trg_inf_pii_check
BEFORE INSERT OR UPDATE ON public.atlas_semantic_inferences
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_no_plaintext_pii_recursive();

-- ============================================================================
-- 10. DB-LEVEL DOMAIN / RANGE & VALUE TYPE ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_validate_semantic_fact_domain_and_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pred RECORD;
    v_subj_type public.atlas_canonical_entity_type;
    v_subj_tenant UUID;
BEGIN
    -- 1. Fetch Predicate Definition
    SELECT * INTO v_pred FROM public.atlas_semantic_predicates WHERE predicate_code = NEW.predicate_code;
    IF NOT FOUND OR NOT v_pred.is_active THEN
        RAISE EXCEPTION 'SEMANTIC_PREDICATE_UNKNOWN: Predicate "%" is not registered or inactive in atlas_semantic_predicates.', NEW.predicate_code;
    END IF;

    IF v_pred.object_kind != 'LITERAL_VALUE' THEN
        RAISE EXCEPTION 'SEMANTIC_FACT_KIND_MISMATCH: Predicate "%" requires a CANONICAL_ENTITY relationship, not a literal fact.', NEW.predicate_code;
    END IF;

    IF NEW.value_type != v_pred.object_value_type THEN
        RAISE EXCEPTION 'SEMANTIC_FACT_TYPE_MISMATCH: Predicate "%" expects value_type "%", received "%".', 
            NEW.predicate_code, v_pred.object_value_type, NEW.value_type;
    END IF;

    -- 2. Validate Subject Entity Domain & Tenant
    SELECT entity_type, tenant_id INTO v_subj_type, v_subj_tenant 
    FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.subject_entity_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'SEMANTIC_SUBJECT_NOT_FOUND: Subject entity "%" does not exist.', NEW.subject_entity_id;
    END IF;

    IF v_subj_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'SEMANTIC_CROSS_TENANT_VIOLATION: Subject entity tenant (%) does not match fact tenant (%).', v_subj_tenant, NEW.tenant_id;
    END IF;

    IF NOT (v_subj_type = ANY(v_pred.subject_entity_types)) THEN
        RAISE EXCEPTION 'SEMANTIC_DOMAIN_VIOLATION: Predicate "%" does not allow subject entity type "%". Allowed: %', 
            NEW.predicate_code, v_subj_type, v_pred.subject_entity_types;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fact_domain_type_check ON public.atlas_semantic_facts;
CREATE TRIGGER trg_fact_domain_type_check
BEFORE INSERT OR UPDATE ON public.atlas_semantic_facts
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_semantic_fact_domain_and_type();

CREATE OR REPLACE FUNCTION public.trg_validate_semantic_relationship_domain_range()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pred RECORD;
    v_subj_type public.atlas_canonical_entity_type;
    v_subj_tenant UUID;
    v_obj_type public.atlas_canonical_entity_type;
    v_obj_tenant UUID;
BEGIN
    SELECT * INTO v_pred FROM public.atlas_semantic_predicates WHERE predicate_code = NEW.predicate_code;
    IF NOT FOUND OR NOT v_pred.is_active THEN
        RAISE EXCEPTION 'SEMANTIC_PREDICATE_UNKNOWN: Predicate "%" is not registered or inactive.', NEW.predicate_code;
    END IF;

    IF v_pred.object_kind != 'CANONICAL_ENTITY' THEN
        RAISE EXCEPTION 'SEMANTIC_RELATIONSHIP_KIND_MISMATCH: Predicate "%" requires a LITERAL_VALUE fact, not an entity relationship.', NEW.predicate_code;
    END IF;

    SELECT entity_type, tenant_id INTO v_subj_type, v_subj_tenant 
    FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.subject_entity_id;

    SELECT entity_type, tenant_id INTO v_obj_type, v_obj_tenant 
    FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.object_entity_id;

    IF v_subj_tenant IS DISTINCT FROM NEW.tenant_id OR v_obj_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'SEMANTIC_CROSS_TENANT_VIOLATION: Subject and Object entities must belong to fact tenant (%).', NEW.tenant_id;
    END IF;

    IF NOT (v_subj_type = ANY(v_pred.subject_entity_types)) THEN
        RAISE EXCEPTION 'SEMANTIC_DOMAIN_VIOLATION: Predicate "%" does not allow subject entity type "%".', NEW.predicate_code, v_subj_type;
    END IF;

    IF NOT (v_obj_type = ANY(v_pred.object_entity_types)) THEN
        RAISE EXCEPTION 'SEMANTIC_RANGE_VIOLATION: Predicate "%" does not allow object entity type "%". Allowed: %', 
            NEW.predicate_code, v_obj_type, v_pred.object_entity_types;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rel_domain_range_check ON public.atlas_semantic_relationships;
CREATE TRIGGER trg_rel_domain_range_check
BEFORE INSERT OR UPDATE ON public.atlas_semantic_relationships
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_semantic_relationship_domain_range();
