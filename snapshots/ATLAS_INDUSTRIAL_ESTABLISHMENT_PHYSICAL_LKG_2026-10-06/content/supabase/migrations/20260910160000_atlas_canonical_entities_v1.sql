-- Migration: 20260910160000_atlas_canonical_entities_v1.sql
-- Description: Atlas Semantic Intelligence — Canonical Entities, Source Observations & Non-Destructive Resolution Ledger V1
-- Subsystem: Semantic Intelligence / Canonical Entity Layer
-- Safety: Strict forward-only migration. Preserves all previous migrations (00001..081000) without modification.

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE public.atlas_canonical_entity_type AS ENUM (
        'PERSON',
        'COMPANY',
        'ORGANIZATION',
        'PRODUCT',
        'SERVICE',
        'LOCATION'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_canonical_entity_status AS ENUM (
        'ACTIVE',
        'MERGED',
        'ARCHIVED',
        'SPLIT'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.atlas_entity_resolution_decision AS ENUM (
        'AUTO_MATCH',
        'REVIEW_REQUIRED',
        'NO_MATCH',
        'MANUAL_OVERRIDE'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 2. CANONICAL ENTITIES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_canonical_entities (
    canonical_entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    
    entity_type public.atlas_canonical_entity_type NOT NULL,
    canonical_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    primary_domain TEXT,
    
    status public.atlas_canonical_entity_status NOT NULL DEFAULT 'ACTIVE',
    merged_into_id UUID REFERENCES public.atlas_canonical_entities(canonical_entity_id),
    
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_canonical_no_self_merge CHECK (merged_into_id != canonical_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_canonical_entities_lookup 
ON public.atlas_canonical_entities(tenant_id, entity_type, normalized_name);

CREATE INDEX IF NOT EXISTS idx_atlas_canonical_entities_domain 
ON public.atlas_canonical_entities(tenant_id, primary_domain) 
WHERE primary_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_canonical_entities_status 
ON public.atlas_canonical_entities(tenant_id, status);

ALTER TABLE public.atlas_canonical_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_canonical_entities_tenant_isolation 
ON public.atlas_canonical_entities 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 3. SOURCE OBSERVATIONS TABLE (IMMUTABLE RAW AUDIT & MULTI-ENTITY SCOPE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_entity_source_observations (
    observation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    
    canonical_entity_id UUID REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE SET NULL,
    original_canonical_entity_id UUID REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE SET NULL,
    
    source_name TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    source_entity_key TEXT NOT NULL DEFAULT 'default',
    
    entity_type public.atlas_canonical_entity_type NOT NULL,
    raw_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    
    raw_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    normalized_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    resolution_confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000,
    resolution_decision public.atlas_entity_resolution_decision NOT NULL DEFAULT 'AUTO_MATCH',
    resolution_explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_source_observation_entity 
    UNIQUE (tenant_id, source_name, source_record_id, source_entity_key)
);

CREATE INDEX IF NOT EXISTS idx_atlas_source_obs_canonical 
ON public.atlas_entity_source_observations(tenant_id, canonical_entity_id);

CREATE INDEX IF NOT EXISTS idx_atlas_source_obs_original 
ON public.atlas_entity_source_observations(tenant_id, original_canonical_entity_id);

ALTER TABLE public.atlas_entity_source_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_entity_source_obs_tenant_isolation 
ON public.atlas_entity_source_observations 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 4. ENTITY ALIASES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_entity_aliases (
    alias_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    canonical_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id) ON DELETE CASCADE,
    
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    source TEXT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL DEFAULT 1.000,
    
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_atlas_entity_alias UNIQUE (tenant_id, canonical_entity_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_atlas_entity_aliases_lookup 
ON public.atlas_entity_aliases(tenant_id, normalized_alias);

ALTER TABLE public.atlas_entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_entity_aliases_tenant_isolation 
ON public.atlas_entity_aliases 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 5. REVERSIBLE ENTITY MERGES LEDGER
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_entity_merges (
    merge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    
    source_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id),
    target_entity_id UUID NOT NULL REFERENCES public.atlas_canonical_entities(canonical_entity_id),
    
    merge_reason TEXT NOT NULL,
    confidence NUMERIC(4,3) NOT NULL,
    explanation JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_at TIMESTAMPTZ,
    reversed_by TEXT,
    reversal_reason TEXT,
    
    CONSTRAINT chk_merge_distinct_entities CHECK (source_entity_id != target_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_atlas_entity_merges_source 
ON public.atlas_entity_merges(tenant_id, source_entity_id) 
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_atlas_entity_merges_target 
ON public.atlas_entity_merges(tenant_id, target_entity_id) 
WHERE is_active = TRUE;

ALTER TABLE public.atlas_entity_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY atlas_entity_merges_tenant_isolation 
ON public.atlas_entity_merges 
FOR ALL 
USING (tenant_id = public.get_auth_tenant_id());

-- ============================================================================
-- 6. DB-LEVEL FAIL-CLOSED PII GUARDS & INTEGRITY TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_enforce_no_plaintext_contact_identifiers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_forbidden_keys TEXT[] := ARRAY[
        'email', 'phone', 'telephone', 'mobile',
        'password', 'token', 'secret', 'authorization',
        'cookie', 'session', 'auth_token', 'access_token',
        'refresh_token', 'api_key', 'bearer'
    ];
    v_raw_text TEXT;
    v_key TEXT;
BEGIN
    IF TG_TABLE_NAME = 'atlas_entity_source_observations' THEN
        FOREACH v_key IN ARRAY v_forbidden_keys LOOP
            IF (NEW.raw_attributes ? v_key) OR (NEW.normalized_attributes ? v_key) THEN
                RAISE EXCEPTION 'CANONICAL_ENTITIES_PII_VIOLATION: Plaintext contact identifier or credential key "%" is prohibited in canonical observation storage. Use canonical hashes (email_hash/phone_hash).', v_key;
            END IF;
        END LOOP;

        v_raw_text := NEW.raw_attributes::text;
        IF v_raw_text ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN
            RAISE EXCEPTION 'CANONICAL_ENTITIES_PII_VIOLATION: Plaintext email pattern detected in raw_attributes. Prohibited by PII minimization policy.';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'atlas_canonical_entities' THEN
        FOREACH v_key IN ARRAY v_forbidden_keys LOOP
            IF (NEW.metadata ? v_key) THEN
                RAISE EXCEPTION 'CANONICAL_ENTITIES_PII_VIOLATION: Forbidden key "%" in canonical entity metadata.', v_key;
            END IF;
        END LOOP;

        v_raw_text := NEW.metadata::text;
        IF v_raw_text ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' THEN
            RAISE EXCEPTION 'CANONICAL_ENTITIES_PII_VIOLATION: Plaintext email pattern detected in entity metadata.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_obs_pii_check ON public.atlas_entity_source_observations;
CREATE TRIGGER trg_canonical_obs_pii_check
BEFORE INSERT OR UPDATE ON public.atlas_entity_source_observations
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_no_plaintext_contact_identifiers();

DROP TRIGGER IF EXISTS trg_canonical_entity_pii_check ON public.atlas_canonical_entities;
CREATE TRIGGER trg_canonical_entity_pii_check
BEFORE INSERT OR UPDATE ON public.atlas_canonical_entities
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_no_plaintext_contact_identifiers();

-- ============================================================================
-- 7. DB-LEVEL MERGE CYCLE & TENANT BOUNDARY TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_prevent_entity_merge_cycles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current UUID := NEW.target_entity_id;
    v_depth INT := 0;
    v_max_depth INT := 10;
BEGIN
    IF NEW.source_entity_id = NEW.target_entity_id THEN
        RAISE EXCEPTION 'CANONICAL_MERGE_VIOLATION: Cannot merge entity into itself (%)', NEW.source_entity_id;
    END IF;

    WHILE v_current IS NOT NULL AND v_depth < v_max_depth LOOP
        IF v_current = NEW.source_entity_id THEN
            RAISE EXCEPTION 'CANONICAL_MERGE_CYCLE_DETECTED: Merge from % to % forms a cycle via %', 
                NEW.source_entity_id, NEW.target_entity_id, v_current;
        END IF;

        SELECT target_entity_id INTO v_current
        FROM public.atlas_entity_merges
        WHERE source_entity_id = v_current
          AND is_active = TRUE
          AND tenant_id = NEW.tenant_id
        LIMIT 1;

        v_depth := v_depth + 1;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_merge_cycle_check ON public.atlas_entity_merges;
CREATE TRIGGER trg_canonical_merge_cycle_check
BEFORE INSERT OR UPDATE ON public.atlas_entity_merges
FOR EACH ROW EXECUTE FUNCTION public.trg_prevent_entity_merge_cycles();

CREATE OR REPLACE FUNCTION public.trg_enforce_same_tenant_merge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_src_tenant UUID;
    v_tgt_tenant UUID;
BEGIN
    SELECT tenant_id INTO v_src_tenant FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.source_entity_id;
    SELECT tenant_id INTO v_tgt_tenant FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.target_entity_id;

    IF v_src_tenant IS DISTINCT FROM NEW.tenant_id OR v_tgt_tenant IS DISTINCT FROM NEW.tenant_id OR v_src_tenant IS DISTINCT FROM v_tgt_tenant THEN
        RAISE EXCEPTION 'CANONICAL_MERGE_CROSS_TENANT_VIOLATION: Merging across different tenants is strictly prohibited.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_merge_tenant_check ON public.atlas_entity_merges;
CREATE TRIGGER trg_canonical_merge_tenant_check
BEFORE INSERT OR UPDATE ON public.atlas_entity_merges
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_same_tenant_merge();

CREATE OR REPLACE FUNCTION public.trg_enforce_same_tenant_observation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entity_tenant UUID;
BEGIN
    IF NEW.canonical_entity_id IS NOT NULL THEN
        SELECT tenant_id INTO v_entity_tenant FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.canonical_entity_id;
        IF v_entity_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'CANONICAL_OBSERVATION_CROSS_TENANT_VIOLATION: Cannot reference canonical entity belonging to a different tenant.';
        END IF;
    END IF;
    IF NEW.original_canonical_entity_id IS NOT NULL THEN
        SELECT tenant_id INTO v_entity_tenant FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.original_canonical_entity_id;
        IF v_entity_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'CANONICAL_OBSERVATION_CROSS_TENANT_VIOLATION: Cannot reference original canonical entity belonging to a different tenant.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_obs_tenant_check ON public.atlas_entity_source_observations;
CREATE TRIGGER trg_canonical_obs_tenant_check
BEFORE INSERT OR UPDATE ON public.atlas_entity_source_observations
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_same_tenant_observation();

CREATE OR REPLACE FUNCTION public.trg_enforce_same_tenant_alias()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_entity_tenant UUID;
BEGIN
    SELECT tenant_id INTO v_entity_tenant FROM public.atlas_canonical_entities WHERE canonical_entity_id = NEW.canonical_entity_id;
    IF v_entity_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'CANONICAL_ALIAS_CROSS_TENANT_VIOLATION: Cannot create alias referencing canonical entity belonging to a different tenant.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_alias_tenant_check ON public.atlas_entity_aliases;
CREATE TRIGGER trg_canonical_alias_tenant_check
BEFORE INSERT OR UPDATE ON public.atlas_entity_aliases
FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_same_tenant_alias();
