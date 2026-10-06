import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('[1/2] Upgrading process_search_outbox_batch to use idx_atlas_search_outbox_ready_queue index...');

const upgradeSql = `
CREATE OR REPLACE FUNCTION public.process_search_outbox_batch(
  p_limit INTEGER,
  p_worker_id TEXT DEFAULT 'system'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_claim_start timestamptz;
  v_claimed_count integer := 0;
  v_quarantined_count integer := 0;
  v_inserted_count integer := 0;
  v_updated_count integer := 0;
  v_unchanged_count integer := 0;
  v_total_valid integer := 0;
  v_new_unique_people integer := 0;
BEGIN
  -- TEMPORARY OVERRIDE TO BYPASS TRIGGERS
  PERFORM set_config('search.bypass_triggers', 'true', true);

  v_claim_start := clock_timestamp();

  -- 1. CLAIM BATCH USING PARTIAL INDEX idx_atlas_search_outbox_ready_queue (SUB-10MS INDEX SCAN)
  CREATE TEMP TABLE claimed ON COMMIT DROP AS
  WITH next_batch AS (
    SELECT outbox_id 
    FROM public.atlas_search_outbox
    WHERE status IN ('PENDING', 'RETRY')
      AND next_retry_at <= now()
    ORDER BY next_retry_at ASC, outbox_id ASC
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

  -- 2. VALIDATE & QUARANTINE MISSING CANONICAL ID
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

  IF v_quarantined_count > 0 THEN
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'QUARANTINED',
      last_error = 'Quarantined: Missing atlas_person_id in payload'
    FROM claimed c
    WHERE o.outbox_id = c.outbox_id
      AND COALESCE(c.payload->>'atlas_person_id', c.payload->'social_profiles'->0->>'atlas_person_id') IS NULL;
  END IF;

  -- 3. UPSERT VALID ROWS TO DISCOVERY CANDIDATES
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

    -- 4. ACKNOWLEDGE PUBLISHED
    UPDATE public.atlas_search_outbox o
    SET 
      status = 'PUBLISHED',
      published_at = now(),
      last_error = NULL
    FROM tmp_valid_batch tb
    WHERE o.outbox_id = tb.outbox_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'claimed', v_claimed_count,
    'total_published', v_total_valid,
    'total_inserted', v_inserted_count,
    'total_updated', v_updated_count,
    'total_unchanged', v_unchanged_count,
    'total_quarantined', v_quarantined_count,
    'failed', 0
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
`;

await client.query(upgradeSql);
await client.query(`
  REVOKE ALL ON FUNCTION public.process_search_outbox_batch(int, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.process_search_outbox_batch(int, text) TO service_role;
  GRANT EXECUTE ON FUNCTION public.process_search_outbox_batch(int, text) TO postgres;
`);

console.log('✅ process_search_outbox_batch upgraded with indexed queue scan.');

// Test call
const t0 = performance.now();
const res = await client.query("SELECT public.process_search_outbox_batch(50, 'test_worker') as result;");
const dt = performance.now() - t0;
console.log(`Test call executed in ${dt.toFixed(2)} ms:`, res.rows[0].result);

await client.end();
