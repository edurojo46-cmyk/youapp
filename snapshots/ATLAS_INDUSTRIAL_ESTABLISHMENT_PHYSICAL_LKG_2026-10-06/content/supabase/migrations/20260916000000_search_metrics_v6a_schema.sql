-- 20260916000000_search_metrics_v6a_schema.sql
-- V6A: Explicit Canonical ID, Registry, and O(1) Metrics Schema

-- 1. Explicit Canonical ID on Search Projection
ALTER TABLE public.atlas_people_discovery_candidates 
ADD COLUMN IF NOT EXISTS atlas_person_id TEXT;

-- Index will be created concurrently in a separate step to avoid locking issues, 
-- but we declare it here if it's a fresh DB (for migrations parity).
CREATE INDEX IF NOT EXISTS idx_discovery_candidates_person_id 
ON public.atlas_people_discovery_candidates (atlas_person_id);

-- 2. Searchable Person Registry (SSOT for Membership)
CREATE TABLE IF NOT EXISTS public.atlas_searchable_person_registry (
    atlas_person_id TEXT PRIMARY KEY,
    first_searchable_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_searchable_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Global Metrics (O(1) Cache)
CREATE TABLE IF NOT EXISTS public.atlas_global_metrics (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    physical_people_count BIGINT NOT NULL DEFAULT 1796437,
    searchable_unique_people_count BIGINT NOT NULL DEFAULT 0,
    last_reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    registry_count_at_reconciliation BIGINT NOT NULL DEFAULT 0,
    physical_count_at_reconciliation BIGINT NOT NULL DEFAULT 1796437
);

-- Ensure the single row exists
INSERT INTO public.atlas_global_metrics (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 4. V6 Publisher RPC (With Strict Quarantine & Registry Update)
CREATE OR REPLACE FUNCTION public.process_search_outbox_batch(
  p_limit INTEGER,
  p_worker_id TEXT DEFAULT 'system'
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_claim_start timestamptz;
  v_val_start timestamptz;
  v_upsert_start timestamptz;
  v_ack_start timestamptz;
  v_end timestamptz;
  
  v_claimed_count integer := 0;
  v_quarantined_count integer := 0;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_unchanged_count integer := 0;
  v_total_valid integer := 0;
  v_new_unique_people integer := 0;
  
  v_errors jsonb := '[]'::jsonb;
BEGIN
  -- TEMPORARY OVERRIDE TO BYPASS TRIGGERS
  PERFORM set_config('search.bypass_triggers', 'true', true);

  v_claim_start := clock_timestamp();

  -- 1. CLAIM BATCH
  CREATE TEMP TABLE claimed ON COMMIT DROP AS
  WITH next_batch AS (
    SELECT outbox_id 
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
      AND (next_retry_at IS NULL OR next_retry_at <= now())
    ORDER BY attempt_count ASC, next_retry_at ASC NULLS FIRST, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'PROCESSING',
      processing_started_at = now(),
      processing_worker_id = p_worker_id
    FROM next_batch nb
    WHERE o.outbox_id = nb.outbox_id
    RETURNING o.outbox_id, o.payload, o.payload_version
  )
  SELECT * FROM updated;

  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;

  IF v_claimed_count = 0 THEN
    RETURN jsonb_build_object(
      'ok', true,
      'published', 0,
      'claimed', 0,
      'inserted', 0,
      'updated', 0,
      'unchanged', 0,
      'quarantined', 0,
      'failed', 0,
      'errors', '[]'::jsonb
    );
  END IF;

  v_val_start := clock_timestamp();

  -- 2. VALIDATE & QUARANTINE MISSING CANONICAL ID
  -- We quarantine rows that are missing atlas_person_id (either at top level or in social_profiles[0])
  CREATE TEMP TABLE tmp_valid_batch ON COMMIT DROP AS
  SELECT 
    outbox_id, 
    payload, 
    payload_version,
    COALESCE(
      payload->>'atlas_person_id',
      payload->'social_profiles'->0->>'atlas_person_id'
    ) as canonical_id
  FROM claimed
  WHERE COALESCE(payload->>'atlas_person_id', payload->'social_profiles'->0->>'atlas_person_id') IS NOT NULL;

  GET DIAGNOSTICS v_total_valid = ROW_COUNT;
  v_quarantined_count := v_claimed_count - v_total_valid;

  -- Quarantine the missing canonical id rows
  IF v_quarantined_count > 0 THEN
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'QUARANTINED',
      last_error = 'Quarantined: Missing atlas_person_id in payload (NEW_SEARCH_ROWS_WITHOUT_CANONICAL_ID)'
    FROM claimed c
    WHERE o.outbox_id = c.outbox_id
      AND COALESCE(c.payload->>'atlas_person_id', c.payload->'social_profiles'->0->>'atlas_person_id') IS NULL;
  END IF;

  v_upsert_start := clock_timestamp();

  -- 3. UPSERT VALID ROWS
  IF v_total_valid > 0 THEN
    WITH upsert_results AS (
      INSERT INTO public.atlas_people_discovery_candidates (
        discovery_id,
        display_name,
        profession,
        role,
        organization,
        search_text_normalized,
        location_relation_type,
        neighborhood,
        geography_id,
        current_activity_state,
        last_seen_at,
        source_last_checked_at,
        source_id,
        source_record_id,
        person_source_url,
        location_source_url,
        location_evidence,
        evidence_strength,
        first_seen_at,
        social_profiles,
        atlas_person_id
      )
      SELECT
        payload->>'discovery_id',
        payload->>'display_name',
        payload->>'profession',
        payload->>'role',
        payload->>'organization',
        public.normalize_search_document(
          payload->>'display_name',
          payload->>'role',
          payload->>'organization',
          payload->>'profession'
        ),
        payload->>'location_relation_type',
        payload->>'neighborhood',
        payload->>'geography_id',
        payload->>'current_activity_state',
        (payload->>'last_seen_at')::timestamptz,
        (payload->>'source_last_checked_at')::timestamptz,
        payload->>'source_id',
        payload->>'source_record_id',
        payload->>'person_source_url',
        payload->>'location_source_url',
        payload->>'location_evidence',
        payload->>'evidence_strength',
        (payload->>'first_seen_at')::timestamptz,
        payload->'social_profiles',
        canonical_id
      FROM tmp_valid_batch
      ON CONFLICT (source_id, source_record_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        profession = EXCLUDED.profession,
        role = EXCLUDED.role,
        organization = EXCLUDED.organization,
        search_text_normalized = EXCLUDED.search_text_normalized,
        location_relation_type = EXCLUDED.location_relation_type,
        neighborhood = EXCLUDED.neighborhood,
        geography_id = EXCLUDED.geography_id,
        current_activity_state = EXCLUDED.current_activity_state,
        last_seen_at = EXCLUDED.last_seen_at,
        source_last_checked_at = EXCLUDED.source_last_checked_at,
        person_source_url = EXCLUDED.person_source_url,
        location_source_url = EXCLUDED.location_source_url,
        location_evidence = EXCLUDED.location_evidence,
        evidence_strength = EXCLUDED.evidence_strength,
        social_profiles = EXCLUDED.social_profiles,
        atlas_person_id = EXCLUDED.atlas_person_id
      WHERE public.atlas_people_discovery_candidates.source_last_checked_at < EXCLUDED.source_last_checked_at
      RETURNING (xmax = 0) AS is_insert
    )
    SELECT 
      COUNT(*) FILTER (WHERE is_insert) AS inserted,
      COUNT(*) FILTER (WHERE NOT is_insert) AS updated
    INTO v_inserted_count, v_updated_count
    FROM upsert_results;

    v_unchanged_count := v_total_valid - (v_inserted_count + v_updated_count);
    
    -- 4. REGISTRY UPDATE & O(1) METRICS INCREMENT
    -- We extract DISTINCT canonical_ids from the valid batch that was successfully UPSERTed.
    -- (If the UPSERT fails, the transaction rolls back, registry is unaffected).
    WITH new_registry AS (
      INSERT INTO public.atlas_searchable_person_registry (atlas_person_id)
      SELECT DISTINCT canonical_id
      FROM tmp_valid_batch
      ON CONFLICT (atlas_person_id) DO UPDATE 
      SET last_searchable_at = NOW() -- We can track last update optionally, but importantly we need to count INSERTS
      RETURNING (xmax = 0) AS is_insert
    )
    SELECT COUNT(*) INTO v_new_unique_people FROM new_registry WHERE is_insert = TRUE;

    IF v_new_unique_people > 0 THEN
      UPDATE public.atlas_global_metrics
      SET searchable_unique_people_count = searchable_unique_people_count + v_new_unique_people
      WHERE id = 1;
    END IF;
  END IF;

  v_ack_start := clock_timestamp();

  -- 5. ACKNOWLEDGE PUBLISHED
  IF v_total_valid > 0 THEN
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'PUBLISHED',
      published_at = now(),
      processing_worker_id = NULL
    FROM tmp_valid_batch t
    WHERE o.outbox_id = t.outbox_id;
  END IF;

  v_end := clock_timestamp();

  -- RESET CONFIG
  PERFORM set_config('search.bypass_triggers', 'false', true);

  RETURN jsonb_build_object(
    'ok', true,
    'published', v_total_valid,
    'claimed', v_claimed_count,
    'inserted', v_inserted_count,
    'updated', v_updated_count,
    'unchanged', v_unchanged_count,
    'quarantined', v_quarantined_count,
    'failed', 0,
    'new_unique_people', v_new_unique_people,
    'timings', jsonb_build_object(
      'claim_ms', extract(epoch from (v_val_start - v_claim_start)) * 1000,
      'validate_quarantine_ms', extract(epoch from (v_upsert_start - v_val_start)) * 1000,
      'search_upsert_ms', extract(epoch from (v_ack_start - v_upsert_start)) * 1000,
      'ack_ms', extract(epoch from (v_end - v_ack_start)) * 1000
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- RESET CONFIG ON ERROR
  PERFORM set_config('search.bypass_triggers', 'false', true);
  
  -- ROLLBACK HANDLED BY POSTGRES AUTOMATICALLY FOR RPCs
  RAISE;
END;
$$;
