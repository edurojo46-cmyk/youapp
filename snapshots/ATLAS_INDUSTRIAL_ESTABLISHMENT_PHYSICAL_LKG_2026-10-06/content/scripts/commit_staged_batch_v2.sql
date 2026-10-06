
DECLARE
    v_start_ts TIMESTAMPTZ := clock_timestamp();
    v_total INT;
    v_new INT := 0;
    v_existing INT := 0;
    v_caba_new INT := 0;
    v_pba_new INT := 0;
BEGIN
    SELECT count(*) INTO v_total
    FROM atlas_ingest_v2_shadow.staging_incoming_records
    WHERE batch_id = p_batch_id;

    IF v_total = 0 THEN
        RETURN QUERY SELECT 0, 0, 0, 0.0::numeric;
        RETURN;
    END IF;

    -- High performance set-based classification using RAM/indexed hot table atlas_identity_keys_v2
    WITH classified AS (
        SELECT 
            s.batch_seq,
            s.identity_hash,
            s.source_id,
            s.source_record_key,
            s.display_name,
            s.organization,
            s.role,
            s.profession,
            s.geography_id,
            s.location_evidence,
            s.qualification_state,
            s.activity_state,
            k.atlas_person_id AS existing_person_id,
            ROW_NUMBER() OVER (PARTITION BY s.source_id, s.source_record_key ORDER BY s.batch_seq) as dedup_rank
        FROM atlas_ingest_v2_shadow.staging_incoming_records s
        LEFT JOIN atlas_ingest_v2_shadow.atlas_identity_keys_v2 k
          ON k.identity_hash = s.identity_hash
        WHERE s.batch_id = p_batch_id
    ),
    deduped_staged AS (
        SELECT * FROM classified WHERE dedup_rank = 1
    ),
    -- Assign new canonicals
    new_identities AS (
        INSERT INTO atlas_ingest_v2_shadow.atlas_identity_keys_v2 (
            identity_hash,
            atlas_person_id,
            target_state
        )
        SELECT DISTINCT ON (d.identity_hash)
            d.identity_hash,
            'atlas_per_' || encode(d.identity_hash, 'hex'),
            1
        FROM deduped_staged d
        WHERE d.existing_person_id IS NULL
        ON CONFLICT (identity_hash) DO NOTHING
        RETURNING identity_hash, atlas_person_id
    ),
    all_resolved AS (
        SELECT 
            d.identity_hash,
            COALESCE(d.existing_person_id, n.atlas_person_id, 'atlas_per_' || encode(d.identity_hash, 'hex')) as atlas_person_id,
            (d.existing_person_id IS NULL) AS is_new_target,
            d.source_id,
            d.source_record_key,
            (d.source_id || ':' || d.source_record_key || ':v1') AS logical_event_id,
            d.display_name,
            d.organization,
            d.role,
            d.profession,
            d.geography_id,
            d.location_evidence,
            d.qualification_state,
            d.activity_state
        FROM deduped_staged d
        LEFT JOIN new_identities n ON n.identity_hash = d.identity_hash
    ),
    -- 1. REAL PRODUCTION SSOT: Upsert into public.atlas_person_identity_map
    inserted_identity_map AS (
        INSERT INTO public.atlas_person_identity_map (
            atlas_person_id,
            source_id,
            source_person_id,
            identifier_type,
            identifier_value,
            evidence_id,
            confidence,
            resolution_method,
            observed_at
        )
        SELECT 
            r.atlas_person_id,
            r.source_id,
            r.source_record_key,
            'NATIONAL_IDENTITY_HMAC',
            encode(r.identity_hash, 'hex'),
            'EV_V2_' || p_batch_id,
            1.0,
            'V2_SET_BASED_CANONICAL',
            clock_timestamp()
        FROM all_resolved r
        ON CONFLICT (source_id, source_person_id) DO UPDATE SET
            observed_at = clock_timestamp()
    ),
    -- 2. REAL PRODUCTION SSOT: Upsert delivery keys into public.atlas_search_delivery_keys
    upsert_delivery_keys AS (
        INSERT INTO public.atlas_search_delivery_keys (
            logical_event_id,
            atlas_person_id,
            source_id,
            source_record_id,
            payload_version,
            delivery_status,
            first_committed_at,
            last_seen_at
        )
        SELECT 
            r.logical_event_id,
            r.atlas_person_id,
            r.source_id,
            r.source_record_key,
            1,
            'COMMITTED',
            clock_timestamp(),
            clock_timestamp()
        FROM all_resolved r
        ON CONFLICT (logical_event_id) DO UPDATE SET
            last_seen_at = clock_timestamp()
    ),
    -- 3. REAL PRODUCTION SSOT: Insert pending into public.atlas_search_outbox_v2
    inserted_production_outbox AS (
        INSERT INTO public.atlas_search_outbox_v2 (
            logical_event_id,
            atlas_person_id,
            source_id,
            source_record_id,
            payload,
            payload_version,
            status,
            attempt_count,
            created_at,
            next_retry_at
        )
        SELECT 
            r.logical_event_id,
            r.atlas_person_id,
            r.source_id,
            r.source_record_key,
            jsonb_build_object(
                'display_name', r.display_name,
                'organization', r.organization,
                'role', r.role,
                'profession', r.profession,
                'geography_id', r.geography_id,
                'location_evidence', r.location_evidence,
                'qualification_state', r.qualification_state,
                'activity_state', r.activity_state
            ),
            1,
            'PENDING',
            0,
            clock_timestamp(),
            clock_timestamp()
        FROM all_resolved r
        WHERE r.is_new_target = TRUE
    ),
    -- Also sync V2 canonical persons shadow table
    inserted_canonical AS (
        INSERT INTO atlas_ingest_v2_shadow.atlas_canonical_persons_v2 (
            atlas_person_id,
            primary_identity_hash,
            display_name,
            primary_organization,
            primary_role,
            primary_profession,
            geography_id,
            qualification_state,
            activity_state,
            evidence_summary
        )
        SELECT DISTINCT ON (r.atlas_person_id)
            r.atlas_person_id,
            r.identity_hash,
            r.display_name,
            r.organization,
            r.role,
            r.profession,
            r.geography_id,
            r.qualification_state,
            r.activity_state,
            r.location_evidence
        FROM all_resolved r
        WHERE r.is_new_target = TRUE
        ON CONFLICT (atlas_person_id) DO UPDATE SET
            last_seen_at = clock_timestamp()
    ),
    inserted_outbox AS (
        INSERT INTO atlas_ingest_v2_shadow.atlas_contractual_outbox_v2 (
            batch_id,
            atlas_person_id,
            identity_hash,
            event_type,
            payload
        )
        SELECT 
            p_batch_id,
            r.atlas_person_id,
            r.identity_hash,
            CASE WHEN r.is_new_target THEN 'NEW_CONTRACTUAL_TARGET' ELSE 'TARGET_CORROBORATION' END,
            jsonb_build_object(
                'display_name', r.display_name,
                'organization', r.organization,
                'role', r.role,
                'profession', r.profession,
                'geography_id', r.geography_id
            )
        FROM all_resolved r
    )
    SELECT 
        count(*) FILTER (WHERE is_new_target),
        count(*) FILTER (WHERE NOT is_new_target),
        count(*) FILTER (WHERE is_new_target AND (geography_id ILIKE '%caba%' OR geography_id ILIKE '%capital%')),
        count(*) FILTER (WHERE is_new_target AND (geography_id ILIKE '%pba%' OR geography_id ILIKE '%buenos aires%' OR geography_id ILIKE '%plata%' OR geography_id ILIKE '%matanza%' OR geography_id ILIKE '%quilmes%'))
    INTO v_new, v_existing, v_caba_new, v_pba_new
    FROM all_resolved;

    -- Step 4: REAL PRODUCTION SSOT: Update public.atlas_people_live_metrics
    IF v_new > 0 THEN
        UPDATE public.atlas_people_live_metrics
        SET qualified_unique_real_people = qualified_unique_real_people + v_new,
            caba_pba_qualified_unique_real_people = caba_pba_qualified_unique_real_people + (v_caba_new + v_pba_new),
            caba_qualified_unique_real_people = caba_qualified_unique_real_people + v_caba_new,
            pba_qualified_unique_real_people = pba_qualified_unique_real_people + v_pba_new,
            unique_people = unique_people + v_new,
            verified_entities = verified_entities + v_new,
            people_added_today = people_added_today + v_new,
            last_verified_change_at = clock_timestamp(),
            updated_at = clock_timestamp()
        WHERE id = 'current';
    END IF;

    -- Clean processed batch from staging
    DELETE FROM atlas_ingest_v2_shadow.staging_incoming_records
    WHERE batch_id = p_batch_id;

    RETURN QUERY SELECT 
        v_total, 
        v_new, 
        v_existing, 
        ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_ts)) * 1000)::numeric, 2);
END;
