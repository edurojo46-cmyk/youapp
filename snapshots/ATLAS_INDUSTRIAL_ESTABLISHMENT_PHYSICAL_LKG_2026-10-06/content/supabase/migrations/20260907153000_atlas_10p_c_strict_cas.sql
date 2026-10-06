-- ========================================================================================
-- ATLAS PHASE 10P-C: STRICT CAS FOR PRODUCT FIT
-- ========================================================================================

-- Drop the old trigger
DROP TRIGGER IF EXISTS trg_fit_state_concurrency ON public.atlas_person_product_fit_state;

CREATE OR REPLACE FUNCTION public.trg_strict_product_fit_state_concurrency()
RETURNS TRIGGER AS $$
DECLARE
    v_offer_updated TIMESTAMPTZ;
    v_policy_created TIMESTAMPTZ;
    v_latest_event TIMESTAMPTZ;
    v_intent_calc TIMESTAMPTZ;
BEGIN
    -- 1. STALE WRITE PROTECTION (Never overwrite a newer state with an older calculation)
    IF TG_OP = 'UPDATE' THEN
        IF NEW.calculated_at <= OLD.calculated_at THEN
            RAISE EXCEPTION 'Concurrency conflict: State is stale (new calc % <= old calc %)', NEW.calculated_at, OLD.calculated_at;
        END IF;
    END IF;

    -- 2. INPUT FRESHNESS VETO (Prevent writing if authoritative inputs changed AFTER calculation started)
    -- Check Offer
    SELECT updated_at INTO v_offer_updated
    FROM public.atlas_product_offers
    WHERE offer_id = NEW.offer_id;

    IF v_offer_updated IS NOT NULL AND v_offer_updated > NEW.calculated_at THEN
        RAISE EXCEPTION 'Concurrency conflict: Offer has been updated since this state was calculated';
    END IF;

    -- Check Active Policy
    SELECT created_at INTO v_policy_created 
    FROM public.atlas_product_fit_policies 
    WHERE tenant_id = NEW.tenant_id AND status = 'ACTIVE'
    ORDER BY created_at DESC LIMIT 1;

    IF v_policy_created IS NOT NULL AND v_policy_created > NEW.calculated_at THEN
        RAISE EXCEPTION 'Concurrency conflict: A newer policy is active';
    END IF;

    -- Check Behavior Events
    SELECT max(created_at) INTO v_latest_event
    FROM public.atlas_person_behavior_events
    WHERE person_id = NEW.person_id;

    IF v_latest_event IS NOT NULL AND v_latest_event > NEW.calculated_at THEN
        RAISE EXCEPTION 'Concurrency conflict: Person has new behavior events';
    END IF;

    -- Check Intent
    SELECT max(calculated_at) INTO v_intent_calc
    FROM public.atlas_person_intent_state
    WHERE person_id = NEW.person_id;

    IF v_intent_calc IS NOT NULL AND v_intent_calc > NEW.calculated_at THEN
        RAISE EXCEPTION 'Concurrency conflict: Intent state was updated recently';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fit_state_concurrency
BEFORE INSERT OR UPDATE ON public.atlas_person_product_fit_state
FOR EACH ROW
EXECUTE FUNCTION public.trg_strict_product_fit_state_concurrency();
