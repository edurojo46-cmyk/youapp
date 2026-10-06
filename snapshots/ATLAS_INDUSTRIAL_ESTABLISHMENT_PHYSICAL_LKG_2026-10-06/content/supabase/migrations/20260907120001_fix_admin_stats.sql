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
    SELECT count(*) INTO v_persons_total FROM public.atlas_people WHERE tenant_id = v_tenant_id;
    SELECT count(*) INTO v_companies_total FROM public.atlas_discovered_companies;
    
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
