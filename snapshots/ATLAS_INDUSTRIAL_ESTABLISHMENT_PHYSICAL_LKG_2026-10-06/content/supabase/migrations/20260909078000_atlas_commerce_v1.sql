-- Migration: 20260909078000_atlas_commerce_v1.sql
-- Description: Atlas Commerce V1 — Mercado Libre Affiliates & Commercial Policy Engine
-- Scope: Multi-tenant affiliate programs, versioned channel/site policies (EMAIL=BLOCK fail-closed),
--        hard eligibility & reference stock semantics, low-cardinality ML labels (<=30 [a-z0-9]),
--        60-day validation lifecycle (no time auto-validation), policy range non-overlap enforcement,
--        comprehensive RLS tenant isolation, and idempotent 10H-A1 bridge.
-- Safety: Strict forward-only migration. Preserves 040000..077000 without modification.

-- ============================================================================
-- 1. PARTNER SCOPES & AFFILIATE PROGRAMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_partner_scopes (
    partner_scope_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL, -- e.g. 'MLA', 'MLB', 'MLM'
    scope_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(partner_id, site_id)
);

CREATE TABLE IF NOT EXISTS public.atlas_commerce_tenant_affiliates (
    affiliate_program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL,
    affiliate_tag TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, partner_id, site_id)
);

-- ============================================================================
-- 2. VERSIONED SITE & CHANNEL POLICIES (FAIL-CLOSED & RANGE NON-OVERLAP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_site_policies (
    policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL,
    policy_version TEXT NOT NULL,
    policy_status TEXT NOT NULL CHECK (policy_status IN ('VERIFIED', 'UNKNOWN', 'BLOCKED')),
    attribution_window_hours INTEGER NOT NULL DEFAULT 24,
    attribution_model TEXT NOT NULL DEFAULT 'LAST_VALID_CLICK',
    source_url TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(partner_id, site_id, policy_version)
);

CREATE TABLE IF NOT EXISTS public.atlas_commerce_channel_policies (
    channel_policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL,
    channel TEXT NOT NULL, -- 'OWN_PUBLIC_WEBSITE', 'OWN_PUBLIC_SOCIAL', 'EMAIL', 'SMS', etc.
    policy_status TEXT NOT NULL CHECK (policy_status IN ('ALLOW', 'BLOCK', 'UNKNOWN')),
    policy_version TEXT NOT NULL,
    source_url TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(partner_id, site_id, channel, policy_version)
);

-- Range non-overlap triggers for site policies
CREATE OR REPLACE FUNCTION public.check_atlas_commerce_site_policy_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_conflict INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_conflict
    FROM public.atlas_commerce_site_policies
    WHERE partner_id = NEW.partner_id
      AND site_id = NEW.site_id
      AND policy_id != COALESCE(NEW.policy_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND effective_from < COALESCE(NEW.effective_to, 'infinity'::timestamptz)
      AND COALESCE(effective_to, 'infinity'::timestamptz) > NEW.effective_from;

    IF v_conflict > 0 THEN
        RAISE EXCEPTION 'SITE_POLICY_RANGE_OVERLAP: Policy effective range [%, %) overlaps with existing policy for site %',
            NEW.effective_from, COALESCE(NEW.effective_to::text, 'infinity'), NEW.site_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_site_policy_overlap ON public.atlas_commerce_site_policies;
CREATE TRIGGER trg_check_site_policy_overlap
BEFORE INSERT OR UPDATE ON public.atlas_commerce_site_policies
FOR EACH ROW EXECUTE FUNCTION public.check_atlas_commerce_site_policy_no_overlap();

-- Range non-overlap triggers for channel policies
CREATE OR REPLACE FUNCTION public.check_atlas_commerce_channel_policy_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_conflict INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_conflict
    FROM public.atlas_commerce_channel_policies
    WHERE partner_id = NEW.partner_id
      AND site_id = NEW.site_id
      AND channel = NEW.channel
      AND channel_policy_id != COALESCE(NEW.channel_policy_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND effective_from < COALESCE(NEW.effective_to, 'infinity'::timestamptz)
      AND COALESCE(effective_to, 'infinity'::timestamptz) > NEW.effective_from;

    IF v_conflict > 0 THEN
        RAISE EXCEPTION 'CHANNEL_POLICY_RANGE_OVERLAP: Channel policy range [%, %) overlaps with existing policy for channel % on site %',
            NEW.effective_from, COALESCE(NEW.effective_to::text, 'infinity'), NEW.channel, NEW.site_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_channel_policy_overlap ON public.atlas_commerce_channel_policies;
CREATE TRIGGER trg_check_channel_policy_overlap
BEFORE INSERT OR UPDATE ON public.atlas_commerce_channel_policies
FOR EACH ROW EXECUTE FUNCTION public.check_atlas_commerce_channel_policy_no_overlap();

-- Seed Baseline Verified MLA Policies
INSERT INTO public.atlas_commerce_site_policies (
    partner_id, site_id, policy_version, policy_status, attribution_window_hours, attribution_model, source_url, effective_from
) VALUES 
('MERCADO_LIBRE', 'MLA', '2026-09-MLA-V1', 'VERIFIED', 24, 'LAST_VALID_CLICK', 'https://www.mercadolibre.com.ar/l/afiliados-ventana-de-atribucion', '2026-01-01T00:00:00Z'),
('MERCADO_LIBRE', 'MLB', '2026-09-MLB-UNVERIFIED', 'UNKNOWN', 24, 'LAST_VALID_CLICK', 'NOT_VERIFIED', '2026-01-01T00:00:00Z'),
('MERCADO_LIBRE', 'MLM', '2026-09-MLM-UNVERIFIED', 'UNKNOWN', 24, 'LAST_VALID_CLICK', 'NOT_VERIFIED', '2026-01-01T00:00:00Z')
ON CONFLICT (partner_id, site_id, policy_version) DO NOTHING;

INSERT INTO public.atlas_commerce_channel_policies (
    partner_id, site_id, channel, policy_status, policy_version, source_url, effective_from
) VALUES
('MERCADO_LIBRE', 'MLA', 'OWN_PUBLIC_WEBSITE', 'ALLOW', '2026-09-MLA-V1', 'https://www.mercadolibre.com.ar/ayuda/30228', '2026-01-01T00:00:00Z'),
('MERCADO_LIBRE', 'MLA', 'OWN_PUBLIC_SOCIAL', 'ALLOW', '2026-09-MLA-V1', 'https://www.mercadolibre.com.ar/ayuda/30228', '2026-01-01T00:00:00Z'),
('MERCADO_LIBRE', 'MLA', 'EMAIL', 'BLOCK', '2026-09-MLA-V1', 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas', '2026-01-01T00:00:00Z'),
('MERCADO_LIBRE', 'MLA', 'SMS', 'BLOCK', '2026-09-MLA-V1', 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas', '2026-01-01T00:00:00Z'),
('MERCADO_LIBRE', 'MLA', 'PRIVATE_DM', 'BLOCK', '2026-09-MLA-V1', 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas', '2026-01-01T00:00:00Z'),
('MERCADO_LIBRE', 'MLA', 'CLOSED_GROUP', 'BLOCK', '2026-09-MLA-V1', 'https://www.mercadolibre.com.ar/l/afiliados-revisa-las-politicas', '2026-01-01T00:00:00Z')
ON CONFLICT (partner_id, site_id, channel, policy_version) DO NOTHING;

-- ============================================================================
-- 3. SOURCE CAPABILITIES (PORTAL_REPORT / FILE_IMPORT vs UNKNOWN API/WEBHOOK)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_conversion_sources (
    source_capability_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    source_type TEXT NOT NULL CHECK (source_type IN ('PORTAL_REPORT', 'FILE_IMPORT', 'PARTNER_API', 'PARTNER_WEBHOOK')),
    capability_status TEXT NOT NULL CHECK (capability_status IN ('PROVEN', 'UNKNOWN', 'DISABLED')),
    documentation_source TEXT NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(partner_id, source_type)
);

INSERT INTO public.atlas_commerce_conversion_sources (
    partner_id, source_type, capability_status, documentation_source, verified_at
) VALUES
('MERCADO_LIBRE', 'PORTAL_REPORT', 'PROVEN', 'https://www.mercadolibre.com.ar/l/afiliados-metricas', '2026-09-09T00:00:00Z'),
('MERCADO_LIBRE', 'FILE_IMPORT', 'PROVEN', 'https://www.mercadolibre.com.ar/l/afiliados-metricas', '2026-09-09T00:00:00Z'),
('MERCADO_LIBRE', 'PARTNER_API', 'UNKNOWN', 'NOT_DOCUMENTED', NULL),
('MERCADO_LIBRE', 'PARTNER_WEBHOOK', 'UNKNOWN', 'NOT_DOCUMENTED', NULL)
ON CONFLICT (partner_id, source_type) DO NOTHING;

-- ============================================================================
-- 4. OFFICIAL ML LABELS (<=30 chars, [a-z0-9], MAX 100 PER ACCOUNT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_official_labels (
    label_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL,
    ml_label TEXT NOT NULL CHECK (length(ml_label) <= 30 AND ml_label ~ '^[a-z0-9]+$'),
    campaign_id TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, partner_id, site_id, ml_label)
);

-- Trigger: Max 100 active labels per account
CREATE OR REPLACE FUNCTION public.check_atlas_commerce_label_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.atlas_commerce_official_labels
    WHERE tenant_id = NEW.tenant_id
      AND partner_id = NEW.partner_id
      AND site_id = NEW.site_id
      AND is_active = true;

    IF v_count >= 100 THEN
        RAISE EXCEPTION 'LABEL_QUOTA_EXCEEDED: Maximum 100 active labels allowed per Mercado Libre affiliate account';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_label_quota ON public.atlas_commerce_official_labels;
CREATE TRIGGER trg_check_label_quota
BEFORE INSERT ON public.atlas_commerce_official_labels
FOR EACH ROW
EXECUTE FUNCTION public.check_atlas_commerce_label_quota();

-- ============================================================================
-- 5. LINK MAPPINGS (INTERNAL HIGH-CARDINALITY UUIDs <-> LOW-CARDINALITY LABELS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_link_mappings (
    internal_tracking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    execution_id UUID NOT NULL REFERENCES public.atlas_executions(execution_id) ON DELETE CASCADE,
    cost_id UUID,
    campaign_id TEXT NOT NULL,
    official_ml_label TEXT NOT NULL,
    official_generated_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commerce_link_exec ON public.atlas_commerce_link_mappings(tenant_id, execution_id);
CREATE INDEX IF NOT EXISTS idx_commerce_link_label ON public.atlas_commerce_link_mappings(tenant_id, official_ml_label);

-- ============================================================================
-- 6. COMMISSION MATRICES & RULES (RANGE NON-OVERLAP)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_commission_matrices (
    matrix_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL,
    version TEXT NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(partner_id, site_id, version)
);

CREATE TABLE IF NOT EXISTS public.atlas_commerce_commission_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matrix_id UUID NOT NULL REFERENCES public.atlas_commerce_commission_matrices(matrix_id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    category_name TEXT NOT NULL,
    commission_rate_percent NUMERIC(6, 4) NOT NULL,
    fixed_commission_amount NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
    max_commission_cap NUMERIC(10, 4),
    min_price_threshold NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_eligible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(matrix_id, category_id)
);

-- Trigger: Prohibit overlapping commission matrix ranges for same partner + site
CREATE OR REPLACE FUNCTION public.check_atlas_commerce_matrix_no_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_conflict INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_conflict
    FROM public.atlas_commerce_commission_matrices
    WHERE partner_id = NEW.partner_id
      AND site_id = NEW.site_id
      AND matrix_id != COALESCE(NEW.matrix_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND effective_from < COALESCE(NEW.effective_to, 'infinity'::timestamptz)
      AND COALESCE(effective_to, 'infinity'::timestamptz) > NEW.effective_from;

    IF v_conflict > 0 THEN
        RAISE EXCEPTION 'COMMISSION_MATRIX_RANGE_OVERLAP: Matrix effective range [%, %) overlaps with existing matrix for site %',
            NEW.effective_from, COALESCE(NEW.effective_to::text, 'infinity'), NEW.site_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_matrix_overlap ON public.atlas_commerce_commission_matrices;
CREATE TRIGGER trg_check_matrix_overlap
BEFORE INSERT OR UPDATE ON public.atlas_commerce_commission_matrices
FOR EACH ROW EXECUTE FUNCTION public.check_atlas_commerce_matrix_no_overlap();

-- ============================================================================
-- 7. VERIFIED PRODUCTS (HARD GATE + REFERENCE STOCK SEMANTICS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL,
    external_item_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category_id TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    currency_id TEXT NOT NULL DEFAULT 'ARS',
    condition TEXT NOT NULL,
    listing_status TEXT NOT NULL, -- 'active', 'paused', 'closed'
    available_quantity_reference INTEGER NOT NULL DEFAULT 0,
    availability_semantics TEXT NOT NULL DEFAULT 'REFERENCE_BUCKET',
    availability_status TEXT NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'OUT_OF_STOCK', 'PAUSED'
    seller_id TEXT NOT NULL,
    seller_level_id TEXT NOT NULL, -- '5_green', '4_light_green'
    seller_power_status TEXT, -- 'platinum', 'gold', 'silver', NULL
    is_eligible BOOLEAN NOT NULL DEFAULT false, -- FAIL CLOSED
    ineligibility_reason TEXT,
    quality_score NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, partner_id, site_id, external_item_id)
);

-- ============================================================================
-- 8. CONVERSIONS & 10H BRIDGE (60-DAY LIFECYCLE, NO TIME AUTO-VALIDATION)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.atlas_commerce_conversions (
    conversion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.atlas_tenants(tenant_id) ON DELETE CASCADE,
    partner_id TEXT NOT NULL DEFAULT 'MERCADO_LIBRE',
    site_id TEXT NOT NULL,
    external_order_id TEXT NOT NULL,
    external_item_id TEXT NOT NULL,
    execution_id UUID REFERENCES public.atlas_executions(execution_id),
    event_type TEXT NOT NULL CHECK (event_type IN ('PURCHASE', 'REFUND')),
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('COMMISSION_PENDING', 'COMMISSION_VALIDATED', 'COMMISSION_REJECTED', 'REFUND')),
    sale_amount NUMERIC(12, 2) NOT NULL,
    commission_amount NUMERIC(12, 4) NOT NULL,
    currency_id TEXT NOT NULL DEFAULT 'ARS',
    campaign_label TEXT,
    source_type TEXT NOT NULL CHECK (source_type IN ('PORTAL_REPORT', 'FILE_IMPORT', 'PARTNER_API', 'PARTNER_WEBHOOK')),
    source_record_hash TEXT NOT NULL,
    raw_reference JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    validated_at TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    outcome_event_id UUID REFERENCES public.atlas_outcome_events(event_id),
    reverses_conversion_id UUID REFERENCES public.atlas_commerce_conversions(conversion_id),
    UNIQUE(tenant_id, partner_id, site_id, external_order_id, external_item_id, event_type)
);

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) & TENANT ISOLATION
-- ============================================================================

ALTER TABLE public.atlas_commerce_tenant_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_official_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_link_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_partner_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_site_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_channel_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_conversion_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_commission_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_commerce_commission_rules ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies for Authenticated Users
DROP POLICY IF EXISTS commerce_affiliates_tenant_isolation ON public.atlas_commerce_tenant_affiliates;
CREATE POLICY commerce_affiliates_tenant_isolation ON public.atlas_commerce_tenant_affiliates
    FOR ALL TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS commerce_labels_tenant_isolation ON public.atlas_commerce_official_labels;
CREATE POLICY commerce_labels_tenant_isolation ON public.atlas_commerce_official_labels
    FOR ALL TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS commerce_link_mappings_tenant_isolation ON public.atlas_commerce_link_mappings;
CREATE POLICY commerce_link_mappings_tenant_isolation ON public.atlas_commerce_link_mappings
    FOR ALL TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS commerce_products_tenant_isolation ON public.atlas_commerce_products;
CREATE POLICY commerce_products_tenant_isolation ON public.atlas_commerce_products
    FOR ALL TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

DROP POLICY IF EXISTS commerce_conversions_tenant_isolation ON public.atlas_commerce_conversions;
CREATE POLICY commerce_conversions_tenant_isolation ON public.atlas_commerce_conversions
    FOR ALL TO authenticated
    USING (tenant_id = public.get_auth_tenant_id())
    WITH CHECK (tenant_id = public.get_auth_tenant_id());

-- Global Catalog Read-Only Policies for Authenticated & Public Verification
DROP POLICY IF EXISTS commerce_partner_scopes_read ON public.atlas_commerce_partner_scopes;
CREATE POLICY commerce_partner_scopes_read ON public.atlas_commerce_partner_scopes
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS commerce_site_policies_read ON public.atlas_commerce_site_policies;
CREATE POLICY commerce_site_policies_read ON public.atlas_commerce_site_policies
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS commerce_channel_policies_read ON public.atlas_commerce_channel_policies;
CREATE POLICY commerce_channel_policies_read ON public.atlas_commerce_channel_policies
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS commerce_conversion_sources_read ON public.atlas_commerce_conversion_sources;
CREATE POLICY commerce_conversion_sources_read ON public.atlas_commerce_conversion_sources
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS commerce_commission_matrices_read ON public.atlas_commerce_commission_matrices;
CREATE POLICY commerce_commission_matrices_read ON public.atlas_commerce_commission_matrices
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS commerce_commission_rules_read ON public.atlas_commerce_commission_rules;
CREATE POLICY commerce_commission_rules_read ON public.atlas_commerce_commission_rules
    FOR SELECT TO authenticated, anon
    USING (true);

-- ============================================================================
-- 10. STORED PROCEDURES (RPCS)
-- ============================================================================

-- A. Evaluate Channel Policy
CREATE OR REPLACE FUNCTION public.evaluate_commerce_channel_policy_v1(
    p_site_id TEXT,
    p_channel TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_pol RECORD;
BEGIN
    SELECT * INTO v_pol
    FROM public.atlas_commerce_channel_policies
    WHERE partner_id = 'MERCADO_LIBRE'
      AND site_id = p_site_id
      AND channel = p_channel
      AND effective_from <= NOW()
      AND (effective_to IS NULL OR effective_to > NOW())
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'status', 'BLOCK', 'reason', 'MISSING_CHANNEL_POLICY');
    END IF;

    IF v_pol.policy_status = 'ALLOW' THEN
        RETURN jsonb_build_object('allowed', true, 'status', 'ALLOW', 'policy_version', v_pol.policy_version);
    ELSE
        RETURN jsonb_build_object('allowed', false, 'status', 'BLOCK', 'policy_version', v_pol.policy_version, 'reason', 'CHANNEL_BLOCKED_BY_POLICY');
    END IF;
END;
$$;

-- B. Ingest Commerce Conversion Event (Idempotent & Bridge to 10H-A1)
CREATE OR REPLACE FUNCTION public.ingest_commerce_conversion_event_v1(
    p_tenant_id UUID,
    p_site_id TEXT,
    p_source_type TEXT,
    p_order_id TEXT,
    p_item_id TEXT,
    p_event_status TEXT, -- 'REPORTED', 'VALIDATED', 'REFUNDED'
    p_sale_amount NUMERIC,
    p_commission_amount NUMERIC,
    p_campaign_label TEXT,
    p_source_record_hash TEXT,
    p_raw_reference JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_cap RECORD;
    v_event_type TEXT;
    v_existing RECORD;
    v_conv_id UUID;
    v_orig_purchase RECORD;
    v_exec_id UUID := NULL;
    v_outcome_res JSONB;
BEGIN
    -- 0. Tenant Authority Gate: If called by authenticated user, must match canonical get_auth_tenant_id()
    IF auth.role() = 'authenticated' AND p_tenant_id != public.get_auth_tenant_id() THEN
        RETURN jsonb_build_object('success', false, 'status', 'FORBIDDEN', 'reason', 'CROSS_TENANT_MUTATION_DENIED');
    END IF;

    -- 1. Capability Gate (Fail-Closed)
    SELECT * INTO v_cap
    FROM public.atlas_commerce_conversion_sources
    WHERE partner_id = 'MERCADO_LIBRE' AND source_type = p_source_type;

    IF NOT FOUND OR v_cap.capability_status != 'PROVEN' THEN
        RETURN jsonb_build_object('success', false, 'status', 'BLOCKED_UNPROVEN_SOURCE', 'reason', 'Source capability not PROVEN');
    END IF;

    v_event_type := CASE WHEN p_event_status IN ('REFUNDED', 'CANCELLED') THEN 'REFUND' ELSE 'PURCHASE' END;

    -- 2. Idempotency Check
    SELECT * INTO v_existing
    FROM public.atlas_commerce_conversions
    WHERE tenant_id = p_tenant_id
      AND partner_id = 'MERCADO_LIBRE'
      AND site_id = p_site_id
      AND external_order_id = p_order_id
      AND external_item_id = p_item_id
      AND event_type = v_event_type;

    IF FOUND THEN
        IF (p_event_status = 'REPORTED' AND v_existing.lifecycle_state = 'COMMISSION_PENDING') OR
           (p_event_status = 'VALIDATED' AND v_existing.lifecycle_state = 'COMMISSION_VALIDATED') OR
           (p_event_status IN ('REFUNDED', 'CANCELLED') AND v_existing.lifecycle_state = 'REFUND') THEN
            RETURN jsonb_build_object('success', true, 'status', 'IDEMPOTENT_IGNORED', 'conversion_id', v_existing.conversion_id);
        END IF;
    END IF;

    -- 3. Resolve execution_id from campaign_label if present
    IF p_campaign_label IS NOT NULL THEN
        SELECT execution_id INTO v_exec_id
        FROM public.atlas_commerce_link_mappings
        WHERE tenant_id = p_tenant_id AND official_ml_label = p_campaign_label
        ORDER BY created_at DESC LIMIT 1;
    END IF;

    -- 4. Process Status Transitions
    IF p_event_status = 'REPORTED' THEN
        INSERT INTO public.atlas_commerce_conversions (
            tenant_id, partner_id, site_id, external_order_id, external_item_id,
            execution_id, event_type, lifecycle_state, sale_amount, commission_amount,
            campaign_label, source_type, source_record_hash, raw_reference, occurred_at
        ) VALUES (
            p_tenant_id, 'MERCADO_LIBRE', p_site_id, p_order_id, p_item_id,
            v_exec_id, 'PURCHASE', 'COMMISSION_PENDING', p_sale_amount, p_commission_amount,
            p_campaign_label, p_source_type, p_source_record_hash, p_raw_reference, NOW()
        ) RETURNING conversion_id INTO v_conv_id;

        RETURN jsonb_build_object('success', true, 'status', 'INSERTED_PENDING', 'conversion_id', v_conv_id);

    ELSIF p_event_status = 'VALIDATED' THEN
        IF v_existing.conversion_id IS NOT NULL THEN
            UPDATE public.atlas_commerce_conversions
            SET lifecycle_state = 'COMMISSION_VALIDATED',
                validated_at = NOW()
            WHERE conversion_id = v_existing.conversion_id
            RETURNING conversion_id INTO v_conv_id;
        ELSE
            INSERT INTO public.atlas_commerce_conversions (
                tenant_id, partner_id, site_id, external_order_id, external_item_id,
                execution_id, event_type, lifecycle_state, sale_amount, commission_amount,
                campaign_label, source_type, source_record_hash, raw_reference, occurred_at, validated_at
            ) VALUES (
                p_tenant_id, 'MERCADO_LIBRE', p_site_id, p_order_id, p_item_id,
                v_exec_id, 'PURCHASE', 'COMMISSION_VALIDATED', p_sale_amount, p_commission_amount,
                p_campaign_label, p_source_type, p_source_record_hash, p_raw_reference, NOW(), NOW()
            ) RETURNING conversion_id INTO v_conv_id;
        END IF;

        -- Bridge to 10H-A1
        SELECT public.ingest_outcome_event(
            p_tenant_id := p_tenant_id,
            p_source_system := 'MERCADO_LIBRE',
            p_event_type := 'PURCHASE',
            p_occurred_at := NOW(),
            p_business_domain := 'COMMERCE',
            p_event_class := 'OBSERVED',
            p_source_event_id := 'ml-ord-' || p_order_id || '-' || p_item_id,
            p_payload_hash := encode(digest(p_order_id || ':' || p_item_id || ':' || p_commission_amount::TEXT, 'sha256'), 'hex')
        ) INTO v_outcome_res;

        IF v_outcome_res->>'event_id' IS NOT NULL THEN
            UPDATE public.atlas_commerce_conversions
            SET outcome_event_id = (v_outcome_res->>'event_id')::UUID
            WHERE conversion_id = v_conv_id;
        END IF;

        RETURN jsonb_build_object('success', true, 'status', 'VALIDATED_EARNED', 'conversion_id', v_conv_id, 'outcome_result', v_outcome_res);

    ELSIF p_event_status IN ('REFUNDED', 'CANCELLED') THEN
        SELECT * INTO v_orig_purchase
        FROM public.atlas_commerce_conversions
        WHERE tenant_id = p_tenant_id
          AND partner_id = 'MERCADO_LIBRE'
          AND site_id = p_site_id
          AND external_order_id = p_order_id
          AND external_item_id = p_item_id
          AND event_type = 'PURCHASE';

        INSERT INTO public.atlas_commerce_conversions (
            tenant_id, partner_id, site_id, external_order_id, external_item_id,
            execution_id, event_type, lifecycle_state, sale_amount, commission_amount,
            campaign_label, source_type, source_record_hash, raw_reference, occurred_at, validated_at, reverses_conversion_id
        ) VALUES (
            p_tenant_id, 'MERCADO_LIBRE', p_site_id, p_order_id, p_item_id,
            v_exec_id, 'REFUND', 'REFUND', -p_sale_amount, -p_commission_amount,
            p_campaign_label, p_source_type, p_source_record_hash, p_raw_reference, NOW(), NOW(), v_orig_purchase.conversion_id
        ) RETURNING conversion_id INTO v_conv_id;

        -- Bridge Refund to 10H-A1 with reverses_event_id
        SELECT public.ingest_outcome_event(
            p_tenant_id := p_tenant_id,
            p_source_system := 'MERCADO_LIBRE',
            p_event_type := 'REFUND',
            p_occurred_at := NOW(),
            p_business_domain := 'COMMERCE',
            p_event_class := 'OBSERVED',
            p_source_event_id := 'ml-ref-' || p_order_id || '-' || p_item_id,
            p_payload_hash := encode(digest('reversal:' || p_order_id || ':' || p_item_id, 'sha256'), 'hex'),
            p_reverses_event_id := v_orig_purchase.outcome_event_id
        ) INTO v_outcome_res;

        RETURN jsonb_build_object('success', true, 'status', 'REFUNDED', 'conversion_id', v_conv_id, 'outcome_result', v_outcome_res);
    END IF;

    RETURN jsonb_build_object('success', false, 'reason', 'UNKNOWN_STATUS');
END;
$$;

-- ============================================================================
-- 11. GRANTS & PERMISSIONS (LEAST PRIVILEGE)
-- ============================================================================

-- Functions: accessible to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.evaluate_commerce_channel_policy_v1 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ingest_commerce_conversion_event_v1 TO authenticated, service_role;

-- Public config tables: SELECT to authenticated, mutations reserved to service_role
GRANT SELECT ON TABLE public.atlas_commerce_partner_scopes TO authenticated, service_role;
GRANT SELECT ON TABLE public.atlas_commerce_site_policies TO authenticated, service_role;
GRANT SELECT ON TABLE public.atlas_commerce_channel_policies TO authenticated, service_role;
GRANT SELECT ON TABLE public.atlas_commerce_conversion_sources TO authenticated, service_role;
GRANT SELECT ON TABLE public.atlas_commerce_commission_matrices TO authenticated, service_role;
GRANT SELECT ON TABLE public.atlas_commerce_commission_rules TO authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_partner_scopes FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_site_policies FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_channel_policies FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_conversion_sources FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_commission_matrices FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_commission_rules FROM authenticated, anon;

-- Tenant data tables: RLS-protected for authenticated, direct writes revoked from anon
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_tenant_affiliates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_official_labels TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_link_mappings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_products TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.atlas_commerce_conversions TO authenticated, service_role;

REVOKE ALL ON TABLE public.atlas_commerce_tenant_affiliates FROM anon;
REVOKE ALL ON TABLE public.atlas_commerce_official_labels FROM anon;
REVOKE ALL ON TABLE public.atlas_commerce_link_mappings FROM anon;
REVOKE ALL ON TABLE public.atlas_commerce_products FROM anon;
REVOKE ALL ON TABLE public.atlas_commerce_conversions FROM anon;
