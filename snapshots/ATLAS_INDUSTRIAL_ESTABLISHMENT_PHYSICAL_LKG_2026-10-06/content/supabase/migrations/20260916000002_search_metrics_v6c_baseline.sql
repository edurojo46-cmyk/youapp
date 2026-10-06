-- 20260916000002_search_metrics_v6c_baseline.sql
-- V6C: Baseline Registry and Global Metrics

-- 1. Initialize the Searchable Person Registry
-- We insert every DISTINCT atlas_person_id that is successfully published in Search.
INSERT INTO public.atlas_searchable_person_registry (atlas_person_id)
SELECT DISTINCT atlas_person_id
FROM public.atlas_people_discovery_candidates
WHERE atlas_person_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Initialize the Global O(1) Metrics Cache
-- We count the exact number of rows in the registry to establish the first baseline.
WITH baseline AS (
    SELECT COUNT(*) as registry_count FROM public.atlas_searchable_person_registry
)
UPDATE public.atlas_global_metrics
SET 
    searchable_unique_people_count = baseline.registry_count,
    registry_count_at_reconciliation = baseline.registry_count,
    last_reconciled_at = NOW()
FROM baseline
WHERE id = 1;
