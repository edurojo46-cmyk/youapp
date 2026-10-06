-- ========================================================================================
-- ATLAS PHASE 10P-C: PERSON x PRODUCT x CURRENT CONTEXT FIT ENGINE V1
-- Canonical Product Authority, Offers, Policies and Fit State
-- ========================================================================================

-- 1. PRODUCT AUTHORITY
CREATE TABLE IF NOT EXISTS public.atlas_products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant Isolation
ALTER TABLE public.atlas_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_products_tenant_isolation ON public.atlas_products
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 2. OFFERS AUTHORITY
CREATE TABLE IF NOT EXISTS public.atlas_product_offers (
    offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.atlas_products(product_id) ON DELETE CASCADE,
    price NUMERIC,
    currency TEXT,
    availability_status TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, SOLD_OUT, UNAVAILABLE
    effective_from TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    geography_mode TEXT NOT NULL DEFAULT 'GLOBAL', -- GLOBAL, REMOTE, LOCATION_PREFERRED, LOCATION_REQUIRED
    location_ref TEXT,
    attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    offer_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant Isolation
ALTER TABLE public.atlas_product_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_offers_tenant_isolation ON public.atlas_product_offers
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 3. FIT POLICIES
CREATE TABLE IF NOT EXISTS public.atlas_product_fit_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    policy_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT', -- ACTIVE, DRAFT, ARCHIVED
    effective_from TIMESTAMPTZ,
    effective_until TIMESTAMPTZ,
    weights_json JSONB NOT NULL,
    thresholds_json JSONB NOT NULL,
    hard_gates_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    context_rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    schema_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one ACTIVE policy per tenant
CREATE UNIQUE INDEX idx_atlas_fit_policies_active ON public.atlas_product_fit_policies(tenant_id) WHERE status = 'ACTIVE';

-- Tenant Isolation
ALTER TABLE public.atlas_product_fit_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_fit_policies_tenant_isolation ON public.atlas_product_fit_policies
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());

-- 4. PRODUCT FIT STATE
CREATE TABLE IF NOT EXISTS public.atlas_person_product_fit_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    person_id UUID NOT NULL REFERENCES public.atlas_people(person_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.atlas_products(product_id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES public.atlas_product_offers(offer_id) ON DELETE CASCADE,
    context_hash TEXT NOT NULL,
    
    fit_score NUMERIC NOT NULL,
    fit_level TEXT NOT NULL, -- VERY_HIGH, HIGH, MEDIUM, LOW, NO_FIT, UNKNOWN
    
    component_scores JSONB NOT NULL,
    reason_codes JSONB,
    coverage JSONB,
    
    evidence_count INT NOT NULL DEFAULT 0,
    policy_version TEXT NOT NULL,
    input_snapshot_hash TEXT NOT NULL,
    evidence_snapshot_hash TEXT NOT NULL,
    
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    UNIQUE(tenant_id, person_id, product_id, offer_id)
);

-- Tenant Isolation
ALTER TABLE public.atlas_person_product_fit_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_fit_state_tenant_isolation ON public.atlas_person_product_fit_state
    FOR ALL USING (tenant_id = public.get_auth_tenant_id());


-- ==========================================
-- STRICT CONCURRENCY TRIGGERS
-- ==========================================
-- Ensures we never save a state that was calculated using fewer events than what exists in the DB right now.
CREATE OR REPLACE FUNCTION public.trg_strict_product_fit_state_concurrency()
RETURNS TRIGGER AS $$
DECLARE
    v_actual_count INT;
BEGIN
    SELECT count(*) INTO v_actual_count 
    FROM public.atlas_person_behavior_events 
    WHERE tenant_id = NEW.tenant_id 
      AND person_id = NEW.person_id 
      -- We don't filter by topic strictly here because the fit engine might pull multiple topics, 
      -- but for strict atomicity we just check total behavior events for this person.
      -- If the person got a new event of ANY kind, we reject the state and force recalculation.
      -- This guarantees absolute freshness.
      ;

    IF NEW.evidence_count < v_actual_count THEN
        RAISE EXCEPTION 'Concurrency conflict: state evidence_count (%) is less than actual person events (%)', NEW.evidence_count, v_actual_count;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fit_state_concurrency ON public.atlas_person_product_fit_state;
CREATE TRIGGER trg_fit_state_concurrency
BEFORE INSERT OR UPDATE ON public.atlas_person_product_fit_state
FOR EACH ROW
EXECUTE FUNCTION public.trg_strict_product_fit_state_concurrency();
