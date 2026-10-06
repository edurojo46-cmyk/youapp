-- ==========================================
-- ATLAS PHASE 10P-B: CONCURRENCY PROTECTION
-- ==========================================

-- Trigger to prevent older states (fewer events) from overwriting newer states (more events).
-- This protects against read-modify-write race conditions when evaluating deterministic state in TS.

CREATE OR REPLACE FUNCTION public.trg_protect_interest_state_concurrency()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.evidence_count < OLD.evidence_count THEN
        -- The incoming state was calculated with fewer events than what we already have.
        -- We ignore this update to prevent losing the newer state.
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_protect_intent_state_concurrency()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.evidence_count < OLD.evidence_count THEN
        -- The incoming state was calculated with fewer events than what we already have.
        -- We ignore this update to prevent losing the newer state.
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interest_concurrency ON public.atlas_person_interest_state;
CREATE TRIGGER trg_interest_concurrency
BEFORE UPDATE ON public.atlas_person_interest_state
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_interest_state_concurrency();

DROP TRIGGER IF EXISTS trg_intent_concurrency ON public.atlas_person_intent_state;
CREATE TRIGGER trg_intent_concurrency
BEFORE UPDATE ON public.atlas_person_intent_state
FOR EACH ROW
EXECUTE FUNCTION public.trg_protect_intent_state_concurrency();
