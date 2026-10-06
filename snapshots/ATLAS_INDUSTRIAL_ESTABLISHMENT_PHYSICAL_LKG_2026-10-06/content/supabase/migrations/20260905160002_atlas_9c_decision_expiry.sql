-- ==========================================
-- PHASE 9C: ATLAS DETERMINISTIC MESSAGES V1 - DECISION EXPIRY FIX
-- ==========================================

-- Replace the RPC to use the authoritative expires_at column from atlas_contact_decisions

CREATE OR REPLACE FUNCTION public.persist_deterministic_generation(
    p_job_id UUID,
    p_campaign_id UUID,
    p_contact_id UUID,
    p_subject TEXT,
    p_body TEXT,
    p_model TEXT,
    p_variant_version TEXT,
    p_claims JSONB,
    p_bindings JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_decision RECORD;
    v_generation_id UUID;
    v_claim JSONB;
    v_binding JSONB;
BEGIN
    -- 1. Validate CURRENT, NON-EXPIRED CONTACT_NOW decision
    SELECT * INTO v_decision
    FROM public.atlas_contact_decisions
    WHERE candidate_id = p_contact_id
      AND decision = 'CONTACT_NOW'
    ORDER BY created_at DESC LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot persist generation: No CONTACT_NOW decision found for contact %', p_contact_id;
    END IF;
    
    -- Check expiration using authoritative decision.expires_at (or fallback to 24h if null)
    IF v_decision.expires_at IS NOT NULL THEN
        IF NOW() > v_decision.expires_at THEN
            RAISE EXCEPTION 'Cannot persist generation: CONTACT_NOW decision is expired (passed expires_at)';
        END IF;
    ELSE
        -- Fallback if expires_at is somehow null (though 9B should set it)
        IF v_decision.created_at < NOW() - INTERVAL '24 hours' THEN
            RAISE EXCEPTION 'Cannot persist generation: CONTACT_NOW decision is expired (older than 24h fallback)';
        END IF;
    END IF;
    
    -- 2. Insert Generation
    INSERT INTO public.atlas_message_generations (
        job_id,
        campaign_id,
        contact_id,
        status,
        subject,
        body,
        model,
        prompt_version,
        generation_mode,
        generated_at
    ) VALUES (
        p_job_id,
        p_campaign_id,
        p_contact_id,
        'GENERATED', -- Must start as GENERATED, NOT APPROVED
        p_subject,
        p_body,
        p_model,
        p_variant_version,
        'DETERMINISTIC',
        NOW()
    ) RETURNING generation_id INTO v_generation_id;
    
    -- 3. Insert Bindings
    IF p_bindings IS NOT NULL THEN
        FOR v_binding IN SELECT * FROM jsonb_array_elements(p_bindings)
        LOOP
            INSERT INTO public.atlas_message_variable_bindings (
                generation_id,
                variable_name,
                rendered_value,
                attribute_name,
                attribute_evidence_id
            ) VALUES (
                v_generation_id,
                v_binding->>'variable_name',
                v_binding->>'rendered_value',
                v_binding->>'attribute_name',
                (v_binding->>'attribute_evidence_id')::UUID
            );
        END LOOP;
    END IF;

    -- 4. Insert Claims
    IF p_claims IS NOT NULL THEN
        FOR v_claim IN SELECT * FROM jsonb_array_elements(p_claims)
        LOOP
            INSERT INTO public.atlas_message_claims (
                generation_id,
                claim_text,
                claim_type,
                evidence_id,
                validation_status
            ) VALUES (
                v_generation_id,
                v_claim->>'claim_text',
                v_claim->>'claim_type',
                (v_claim->>'raw_evidence_id')::UUID,
                v_claim->>'validation_status'
            );
        END LOOP;
    END IF;

    RETURN v_generation_id;
END;
$$;
