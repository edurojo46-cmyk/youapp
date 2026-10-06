-- ==========================================
-- ATLAS PHASE 10P-B: STRICT CONCURRENCY
-- ==========================================

-- We must guarantee that the state saved accurately reflects ALL events in the DB at the moment of save.
-- If an event was inserted by a concurrent transaction AFTER the TS engine read the events but BEFORE it saved the state,
-- the TS engine's state is stale. We reject stale states by comparing evidence_count against the true count.

CREATE OR REPLACE FUNCTION public.trg_strict_interest_state_concurrency()
RETURNS TRIGGER AS $$
DECLARE
    v_actual_count INT;
BEGIN
    SELECT count(*) INTO v_actual_count 
    FROM public.atlas_person_behavior_events 
    WHERE tenant_id = NEW.tenant_id 
      AND person_id = NEW.person_id 
      AND topic = NEW.topic;

    IF NEW.evidence_count < v_actual_count THEN
        RAISE EXCEPTION 'Concurrency conflict: state evidence_count (%) is less than actual events (%)', NEW.evidence_count, v_actual_count;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.trg_strict_intent_state_concurrency()
RETURNS TRIGGER AS $$
DECLARE
    v_actual_count INT;
BEGIN
    SELECT count(*) INTO v_actual_count 
    FROM public.atlas_person_behavior_events 
    WHERE tenant_id = NEW.tenant_id 
      AND person_id = NEW.person_id 
      AND topic = NEW.topic;

    IF NEW.evidence_count < v_actual_count THEN
        RAISE EXCEPTION 'Concurrency conflict: state evidence_count (%) is less than actual events (%)', NEW.evidence_count, v_actual_count;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_interest_concurrency ON public.atlas_person_interest_state;
CREATE TRIGGER trg_interest_concurrency
BEFORE INSERT OR UPDATE ON public.atlas_person_interest_state
FOR EACH ROW
EXECUTE FUNCTION public.trg_strict_interest_state_concurrency();

DROP TRIGGER IF EXISTS trg_intent_concurrency ON public.atlas_person_intent_state;
CREATE TRIGGER trg_intent_concurrency
BEFORE INSERT OR UPDATE ON public.atlas_person_intent_state
FOR EACH ROW
EXECUTE FUNCTION public.trg_strict_intent_state_concurrency();
