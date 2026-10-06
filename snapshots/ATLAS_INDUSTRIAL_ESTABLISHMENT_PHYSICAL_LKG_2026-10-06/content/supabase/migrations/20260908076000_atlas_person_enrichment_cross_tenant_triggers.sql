-- ============================================================================
-- MIGRATION: 20260908076000_atlas_person_enrichment_cross_tenant_triggers.sql
-- Subsystem: Person Enrichment V1
-- DB-Level Hard Invariant: Cross-Tenant Referential Integrity Triggers
-- ============================================================================

-- 1. Composite Unique Anchor on atlas_person_enrichment_missions
CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_enrichment_missions_tenant_mission
ON public.atlas_person_enrichment_missions(tenant_id, mission_id);

-- 2. Trigger on missions for Harvester job and reservation cross-tenant consistency
CREATE OR REPLACE FUNCTION public.trg_validate_mission_cross_tenant()
RETURNS TRIGGER AS $$
DECLARE
    v_queue_tenant UUID;
    v_res_tenant UUID;
BEGIN
    IF NEW.harvester_job_id IS NOT NULL THEN
        SELECT tenant_id INTO v_queue_tenant FROM public.atlas_queues WHERE job_id = NEW.harvester_job_id;
        IF v_queue_tenant IS NOT NULL AND v_queue_tenant != NEW.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Harvester queue job tenant (%) does not match mission tenant (%)', v_queue_tenant, NEW.tenant_id;
        END IF;
    END IF;

    IF NEW.reservation_id IS NOT NULL THEN
        SELECT tenant_id INTO v_res_tenant FROM public.atlas_person_enrichment_budget_reservations WHERE reservation_id = NEW.reservation_id;
        IF v_res_tenant IS NOT NULL AND v_res_tenant != NEW.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Budget reservation tenant (%) does not match mission tenant (%)', v_res_tenant, NEW.tenant_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mission_cross_tenant_check ON public.atlas_person_enrichment_missions;
CREATE TRIGGER trg_mission_cross_tenant_check
BEFORE INSERT OR UPDATE ON public.atlas_person_enrichment_missions
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_mission_cross_tenant();

-- 3. Trigger on attempts for mission and queue cross-tenant consistency
CREATE OR REPLACE FUNCTION public.trg_validate_attempt_cross_tenant()
RETURNS TRIGGER AS $$
DECLARE
    v_mission_tenant UUID;
    v_queue_tenant UUID;
BEGIN
    SELECT tenant_id INTO v_mission_tenant FROM public.atlas_person_enrichment_missions WHERE mission_id = NEW.mission_id;
    IF v_mission_tenant IS NOT NULL AND v_mission_tenant != NEW.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Attempt tenant (%) does not match mission tenant (%)', NEW.tenant_id, v_mission_tenant;
    END IF;

    IF NEW.harvester_job_id IS NOT NULL THEN
        SELECT tenant_id INTO v_queue_tenant FROM public.atlas_queues WHERE job_id = NEW.harvester_job_id;
        IF v_queue_tenant IS NOT NULL AND v_queue_tenant != NEW.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Harvester queue job tenant (%) does not match attempt tenant (%)', v_queue_tenant, NEW.tenant_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attempt_cross_tenant_check ON public.atlas_person_enrichment_attempts;
CREATE TRIGGER trg_attempt_cross_tenant_check
BEFORE INSERT OR UPDATE ON public.atlas_person_enrichment_attempts
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_attempt_cross_tenant();

-- 4. Trigger on events for mission cross-tenant consistency
CREATE OR REPLACE FUNCTION public.trg_validate_event_cross_tenant()
RETURNS TRIGGER AS $$
DECLARE
    v_mission_tenant UUID;
BEGIN
    SELECT tenant_id INTO v_mission_tenant FROM public.atlas_person_enrichment_missions WHERE mission_id = NEW.mission_id;
    IF v_mission_tenant IS NOT NULL AND v_mission_tenant != NEW.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Event tenant (%) does not match mission tenant (%)', NEW.tenant_id, v_mission_tenant;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_cross_tenant_check ON public.atlas_person_enrichment_events;
CREATE TRIGGER trg_event_cross_tenant_check
BEFORE INSERT OR UPDATE ON public.atlas_person_enrichment_events
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_event_cross_tenant();

-- 5. Trigger on budget reservations for mission cross-tenant consistency
CREATE OR REPLACE FUNCTION public.trg_validate_reservation_cross_tenant()
RETURNS TRIGGER AS $$
DECLARE
    v_mission_tenant UUID;
BEGIN
    SELECT tenant_id INTO v_mission_tenant FROM public.atlas_person_enrichment_missions WHERE mission_id = NEW.mission_id;
    IF v_mission_tenant IS NOT NULL AND v_mission_tenant != NEW.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_VIOLATION: Budget reservation tenant (%) does not match mission tenant (%)', NEW.tenant_id, v_mission_tenant;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reservation_cross_tenant_check ON public.atlas_person_enrichment_budget_reservations;
CREATE TRIGGER trg_reservation_cross_tenant_check
BEFORE INSERT OR UPDATE ON public.atlas_person_enrichment_budget_reservations
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_reservation_cross_tenant();
