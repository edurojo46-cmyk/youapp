-- ==========================================
-- ATLAS PHASE: ADMIN TOTAL V1 (READ-ONLY)
-- ==========================================

-- 1. Helper to securely get tenant_id from context
CREATE OR REPLACE FUNCTION public.get_auth_tenant_id()
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'tenant_id')::UUID,
        auth.uid()
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. Unified Read-Only View for Opportunities & Search (SUBJECTS)
-- Joins PERSON and COMPANY to the central atlas_subject_registry
CREATE OR REPLACE VIEW public.atlas_v_unified_subjects AS
SELECT 
    r.subject_id,
    r.subject_type,
    
    -- Extracted fields for PERSON
    p.person_id AS entity_id,
    p.full_name AS display_name,
    p.tenant_id,
    c_cov.location_known,
    c_cov.last_updated_at AS last_seen_at,
    (SELECT count(*) FROM public.atlas_person_attribute_evidence e WHERE e.person_id = p.person_id) AS evidence_count
    
FROM public.atlas_subject_registry r
JOIN public.atlas_people p ON r.person_id = p.person_id AND r.subject_type = 'PERSON'
LEFT JOIN public.atlas_person_coverage c_cov ON p.person_id = c_cov.person_id

UNION ALL

SELECT 
    r.subject_id,
    r.subject_type,
    
    -- Extracted fields for COMPANY
    c.company_candidate_id AS entity_id,
    c.company_name AS display_name,
    NULL::UUID AS tenant_id, -- Companies in 8A didn't have tenant_id strictly enforced, adapt if needed
    (c.city IS NOT NULL OR c.region IS NOT NULL) AS location_known,
    c.created_at AS last_seen_at,
    0 AS evidence_count -- Company evidence tracking to be unified later
    
FROM public.atlas_subject_registry r
JOIN public.atlas_discovered_companies c ON r.company_id = c.company_candidate_id AND r.subject_type = 'COMPANY';

-- 3. Secure Dashboard Stats RPC
CREATE OR REPLACE FUNCTION public.get_atlas_admin_stats()
RETURNS JSONB AS $$
DECLARE
    v_tenant_id UUID := public.get_auth_tenant_id();
    v_persons_total INT;
    v_companies_total INT;
    v_signals_total INT;
    v_signals_confirmed INT;
    v_eligible_total INT;
    v_ineligible_total INT;
    v_consent_required_total INT;
    v_review_required_total INT;
    v_unknown_total INT;
    v_evidence_total INT;
BEGIN
    -- Only count rows matching the tenant (or global if tenant is null for legacy tables)
    SELECT count(*) INTO v_persons_total FROM public.atlas_people WHERE tenant_id = v_tenant_id;
    SELECT count(*) INTO v_companies_total FROM public.atlas_discovered_companies; -- No tenant_id in discovered_companies
    
    SELECT count(*) INTO v_signals_total FROM public.atlas_social_signals;
    SELECT count(*) INTO v_signals_confirmed FROM public.atlas_social_signals WHERE status = 'CONFIRMED';
    
    SELECT count(*) INTO v_eligible_total FROM public.atlas_channel_eligibility WHERE eligibility_status = 'ELIGIBLE';
    SELECT count(*) INTO v_ineligible_total FROM public.atlas_channel_eligibility WHERE eligibility_status = 'INELIGIBLE';
    SELECT count(*) INTO v_consent_required_total FROM public.atlas_channel_eligibility WHERE eligibility_status = 'CONSENT_REQUIRED';
    SELECT count(*) INTO v_review_required_total FROM public.atlas_channel_eligibility WHERE eligibility_status = 'REVIEW_REQUIRED';
    SELECT count(*) INTO v_unknown_total FROM public.atlas_channel_eligibility WHERE eligibility_status = 'UNKNOWN';
    
    SELECT count(*) INTO v_evidence_total FROM public.atlas_person_attribute_evidence WHERE tenant_id = v_tenant_id;

    RETURN jsonb_build_object(
        'persons_total', v_persons_total,
        'companies_total', v_companies_total,
        'signals_total', v_signals_total,
        'signals_confirmed', v_signals_confirmed,
        'eligible_total', v_eligible_total,
        'ineligible_total', v_ineligible_total,
        'consent_required_total', v_consent_required_total,
        'review_required_total', v_review_required_total,
        'unknown_total', v_unknown_total,
        'evidence_total', v_evidence_total
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable RLS and Policies for Admin Views
-- Since Admin V1 is Read-Only, we ensure SELECTs are allowed securely.
-- Wait, creating RLS on a view is not directly possible in Postgres, we use security barrier or secure functions.
-- We will add RLS to the underlying tables that we just created in 10P-A.

ALTER TABLE public.atlas_people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_people_tenant_isolation ON public.atlas_people;
CREATE POLICY atlas_people_tenant_isolation ON public.atlas_people 
FOR SELECT USING (tenant_id = public.get_auth_tenant_id());

ALTER TABLE public.atlas_person_identifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_person_identifiers_tenant_isolation ON public.atlas_person_identifiers;
CREATE POLICY atlas_person_identifiers_tenant_isolation ON public.atlas_person_identifiers 
FOR SELECT USING (tenant_id = public.get_auth_tenant_id());

ALTER TABLE public.atlas_person_attribute_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_person_evidence_tenant_isolation ON public.atlas_person_attribute_evidence;
CREATE POLICY atlas_person_evidence_tenant_isolation ON public.atlas_person_attribute_evidence 
FOR SELECT USING (tenant_id = public.get_auth_tenant_id());

ALTER TABLE public.atlas_person_coverage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS atlas_person_coverage_tenant_isolation ON public.atlas_person_coverage;
CREATE POLICY atlas_person_coverage_tenant_isolation ON public.atlas_person_coverage 
FOR SELECT USING (tenant_id = public.get_auth_tenant_id());
