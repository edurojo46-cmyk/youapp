-- 20260916000003_search_metrics_v6b_repair_v3.sql
-- V6B: Streaming Atomic Repair Iterator (v3 - Zero Temp-Table, Pure Streaming Index Scans, Conflict-Aware)
-- Preserves V2 side-by-side. Does NOT drop or modify repair_discovery_candidates_batch_v2.

CREATE OR REPLACE FUNCTION public.repair_discovery_candidates_batch_v3(
    p_last_key TEXT,
    p_limit INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    r RECORD;
    v_m_count INT;
    v_m_id TEXT;
    v_resolved_id TEXT;
    v_resolution_source TEXT;
    v_conflict_state BOOLEAN;
    
    v_rows_processed INT := 0;
    v_already_valid INT := 0;
    v_repaired_sp INT := 0;
    v_repaired_map INT := 0;
    v_conflicts INT := 0;
    v_unrecoverable INT := 0;
    v_skipped_concurrent INT := 0;
    v_concurrent_canonical_conflict INT := 0;
    v_unexpected_not_applied INT := 0;
    v_new_last_key TEXT := p_last_key;
BEGIN
    -- Streaming Keyset Cursor via Primary Key Index Scan (No Temp Table, Zero DDL, Zero Catalog Contention)
    FOR r IN (
        SELECT 
            discovery_id, 
            source_id, 
            source_record_id, 
            atlas_person_id,
            social_profiles->0->>'atlas_person_id' AS sp_person_id
        FROM public.atlas_people_discovery_candidates
        WHERE discovery_id > p_last_key
        ORDER BY discovery_id ASC
        LIMIT p_limit
    ) LOOP
        v_rows_processed := v_rows_processed + 1;
        v_new_last_key := r.discovery_id;
        
        -- Rule 1: Already Valid
        IF r.atlas_person_id IS NOT NULL THEN
            v_already_valid := v_already_valid + 1;
            CONTINUE;
        END IF;
        
        v_resolved_id := NULL;
        v_resolution_source := NULL;
        v_conflict_state := FALSE;
        
        -- Rule 2: Social Profiles
        IF r.sp_person_id IS NOT NULL AND r.sp_person_id != '' THEN
            v_resolved_id := r.sp_person_id;
            v_resolution_source := 'SP';
        ELSE
            -- Rule 3: Deterministic Identity Map Lookup via idx_identity_map_source_lookup
            SELECT COUNT(DISTINCT map.atlas_person_id), MIN(map.atlas_person_id)
            INTO v_m_count, v_m_id
            FROM public.atlas_person_identity_map map
            WHERE map.source_id = r.source_id 
              AND map.source_person_id = r.source_record_id;
              
            IF v_m_count = 1 THEN
                v_resolved_id := v_m_id;
                v_resolution_source := 'MAP';
            ELSIF v_m_count > 1 THEN
                v_conflict_state := TRUE;
            END IF;
        END IF;
        
        -- Explicit Classification & Execution
        IF v_conflict_state THEN
            v_conflicts := v_conflicts + 1;
        ELSIF v_resolved_id IS NULL THEN
            v_unrecoverable := v_unrecoverable + 1;
        ELSE
            -- Point CAS Update on Primary Key
            UPDATE public.atlas_people_discovery_candidates
            SET atlas_person_id = v_resolved_id
            WHERE discovery_id = r.discovery_id
              AND atlas_person_id IS NULL; -- Strict CAS
              
            IF FOUND THEN
                IF v_resolution_source = 'SP' THEN
                    v_repaired_sp := v_repaired_sp + 1;
                ELSE
                    v_repaired_map := v_repaired_map + 1;
                END IF;
            ELSE
                -- CAS did not apply: evaluate concurrency
                DECLARE
                    v_curr_id TEXT;
                BEGIN
                    SELECT atlas_person_id INTO v_curr_id 
                    FROM public.atlas_people_discovery_candidates 
                    WHERE discovery_id = r.discovery_id;
                    
                    IF v_curr_id = v_resolved_id THEN
                        v_skipped_concurrent := v_skipped_concurrent + 1;
                    ELSIF v_curr_id IS NOT NULL AND v_curr_id <> v_resolved_id THEN
                        v_concurrent_canonical_conflict := v_concurrent_canonical_conflict + 1;
                    ELSE
                        v_unexpected_not_applied := v_unexpected_not_applied + 1;
                    END IF;
                END;
            END IF;
        END IF;
    END LOOP;
    
    IF v_rows_processed = 0 THEN
        RETURN jsonb_build_object(
            'done', true,
            'scanned', 0,
            'already_valid', 0,
            'repaired_sp', 0,
            'repaired_map', 0,
            'conflicts', 0,
            'unrecoverable', 0,
            'skipped_concurrent_update', 0,
            'concurrent_canonical_conflict', 0,
            'unexpected_not_applied', 0,
            'last_key', p_last_key
        );
    END IF;

    -- Invariant Assertion: Must be 100% mutually exclusive and exhaustive
    IF v_rows_processed <> (
        v_already_valid 
        + v_repaired_sp 
        + v_repaired_map 
        + v_conflicts 
        + v_unrecoverable 
        + v_skipped_concurrent 
        + v_concurrent_canonical_conflict 
        + v_unexpected_not_applied
    ) THEN
        RAISE EXCEPTION 'INVARIANT_FAILURE: Accounting mismatch in repair_discovery_candidates_batch_v3. Scanned: %, Sum: %',
            v_rows_processed,
            (v_already_valid + v_repaired_sp + v_repaired_map + v_conflicts + v_unrecoverable + v_skipped_concurrent + v_concurrent_canonical_conflict + v_unexpected_not_applied);
    END IF;

    RETURN jsonb_build_object(
        'done', false,
        'scanned', v_rows_processed,
        'already_valid', v_already_valid,
        'repaired_sp', v_repaired_sp,
        'repaired_map', v_repaired_map,
        'conflicts', v_conflicts,
        'unrecoverable', v_unrecoverable,
        'skipped_concurrent_update', v_skipped_concurrent,
        'concurrent_canonical_conflict', v_concurrent_canonical_conflict,
        'unexpected_not_applied', v_unexpected_not_applied,
        'last_key', v_new_last_key
    );
END;
$$;
