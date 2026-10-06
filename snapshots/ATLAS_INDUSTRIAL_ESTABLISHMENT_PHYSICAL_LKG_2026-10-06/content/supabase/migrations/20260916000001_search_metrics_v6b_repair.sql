-- 20260916000001_search_metrics_v6b_repair.sql
-- V6B: Functional Batch Processor (Optimized TOAST handling & Correlated Subqueries for guaranteed Index Scan)

CREATE OR REPLACE FUNCTION public.repair_discovery_candidates_batch_v2(p_last_key TEXT, p_limit INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_rows_processed INT := 0;
    v_already_valid INT := 0;
    v_repaired_sp INT := 0;
    v_repaired_map INT := 0;
    v_new_last_key TEXT := p_last_key;
BEGIN
    -- 1. Grab a fast chunk of rows using the PK index
    CREATE TEMP TABLE tmp_batch ON COMMIT DROP AS
    SELECT 
        discovery_id, 
        source_id, 
        source_record_id, 
        atlas_person_id,
        social_profiles->0->>'atlas_person_id' as sp_person_id
    FROM public.atlas_people_discovery_candidates
    WHERE discovery_id > p_last_key
    ORDER BY discovery_id ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED;

    GET DIAGNOSTICS v_rows_processed = ROW_COUNT;
    
    IF v_rows_processed = 0 THEN
        RETURN jsonb_build_object('done', true);
    END IF;

    SELECT MAX(discovery_id) INTO v_new_last_key FROM tmp_batch;
    SELECT COUNT(*) INTO v_already_valid FROM tmp_batch WHERE atlas_person_id IS NOT NULL;

    -- 2. Evaluate Social Profiles (Rule 2)
    WITH sp_updates AS (
        UPDATE public.atlas_people_discovery_candidates c
        SET atlas_person_id = t.sp_person_id
        FROM tmp_batch t
        WHERE c.discovery_id = t.discovery_id
          AND t.atlas_person_id IS NULL -- Only touch NULLs
          AND t.sp_person_id IS NOT NULL
          AND t.sp_person_id != ''
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_repaired_sp FROM sp_updates;

    -- 3. Evaluate Deterministic Join using Correlated Subquery (Guaranteed Index Lookup)
    WITH map_updates AS (
        UPDATE public.atlas_people_discovery_candidates c
        SET atlas_person_id = (
            SELECT map.atlas_person_id
            FROM public.atlas_person_identity_map map
            WHERE map.source_id = c.source_id 
              AND map.source_person_id = c.source_record_id
            LIMIT 1
        )
        FROM tmp_batch t
        WHERE c.discovery_id = t.discovery_id
          AND t.atlas_person_id IS NULL
          AND (t.sp_person_id IS NULL OR t.sp_person_id = '')
          AND (
            SELECT map.atlas_person_id
            FROM public.atlas_person_identity_map map
            WHERE map.source_id = c.source_id 
              AND map.source_person_id = c.source_record_id
            LIMIT 1
          ) IS NOT NULL
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_repaired_map FROM map_updates;

    -- Return stats
    RETURN jsonb_build_object(
        'done', false,
        'scanned', v_rows_processed,
        'already_valid', v_already_valid,
        'repaired_sp', v_repaired_sp,
        'repaired_map', v_repaired_map,
        'conflicts', 0,
        'unrecoverable', (v_rows_processed - v_already_valid - v_repaired_sp - v_repaired_map),
        'last_key', v_new_last_key
    );
END;
$$;
