import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const v4Sql = `
CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox_v4(
  p_identity_rows jsonb,
  p_outbox_rows jsonb,
  p_batch_id text DEFAULT NULL,
  p_rpc_id text DEFAULT NULL,
  p_cohort_epoch text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_fn_start_ts       timestamptz := clock_timestamp();
  v_step_start_ts     timestamptz;
  v_identity_total    integer := 0;
  v_identity_inserted integer := 0;
  v_identity_updated  integer := 0;
  v_outbox_total      integer := 0;
  v_outbox_inserted   integer := 0;
  v_outbox_requeued   integer := 0;
  v_new_unique_people integer := 0;
  v_has_identity      boolean := false;
  v_has_outbox        boolean := false;
  v_fn_total_ms       numeric := 0;
  v_input_parse_ms    numeric := 0;
  v_src_lookup_ms     numeric := 0;
  v_global_lookup_ms  numeric := 0;
  v_id_map_upsert_ms  numeric := 0;
  v_delivery_keys_ms  numeric := 0;
  v_outbox_insert_ms  numeric := 0;
  v_metrics_upsert_ms numeric := 0;
  v_finalization_ms   numeric := 0;
BEGIN
  v_has_identity := (p_identity_rows IS NOT NULL AND jsonb_typeof(p_identity_rows) = 'array' AND jsonb_array_length(p_identity_rows) > 0);
  v_has_outbox   := (p_outbox_rows IS NOT NULL AND jsonb_typeof(p_outbox_rows) = 'array' AND jsonb_array_length(p_outbox_rows) > 0);

  IF NOT v_has_identity AND NOT v_has_outbox THEN
    v_fn_total_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_fn_start_ts)) * 1000)::numeric, 3);
    RETURN jsonb_build_object(
      'ok', true,
      'batch_id', p_batch_id,
      'rpc_id', p_rpc_id,
      'cohort_epoch', p_cohort_epoch,
      'commit_fabric_version', 'V4_PURE_CTE',
      'identity_rows_processed', 0,
      'identity_rows_inserted', 0,
      'identity_rows_updated', 0,
      'outbox_rows_created', 0,
      'outbox_rows_requeued', 0,
      'NEW_UNIQUE_PEOPLE_INSERTED', 0,
      'server_timing', jsonb_build_object(
        'server_function_total_ms', v_fn_total_ms,
        'total_function_ms', v_fn_total_ms,
        'stage_input_parse_ms', 0,
        'stage_source_identity_lookup_ms', 0,
        'stage_global_identity_lookup_ms', 0,
        'stage_canonical_person_upsert_ms', 0,
        'stage_identity_map_upsert_ms', 0,
        'stage_discovery_candidate_write_ms', 0,
        'stage_outbox_insert_ms', 0,
        'stage_finalization_ms', v_fn_total_ms,
        'server_stage_sum_ms', 0,
        'server_unaccounted_ms', v_fn_total_ms
      )
    );
  END IF;

  -- 1. PURE SET-BASED IDENTITY MERGE (NO TEMPORARY TABLES, NO SCHEMA LOCKS)
  IF v_has_identity THEN
    v_step_start_ts := clock_timestamp();

    WITH incoming_identity AS (
      SELECT DISTINCT ON (source_id, source_person_id)
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method,
        COALESCE(observed_at, now()) AS observed_at
      FROM jsonb_to_recordset(p_identity_rows) AS x(
        atlas_person_id text, source_id text, source_person_id text, identifier_type text,
        identifier_value text, evidence_id text, confidence float, resolution_method text,
        observed_at timestamptz
      )
      ORDER BY source_id, source_person_id, observed_at DESC
    ),
    distinct_incoming AS (
      SELECT DISTINCT atlas_person_id
      FROM incoming_identity
      ORDER BY atlas_person_id
    ),
    new_candidates AS (
      SELECT d.atlas_person_id
      FROM distinct_incoming d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_person_identity_map existing
        WHERE existing.atlas_person_id = d.atlas_person_id
      )
    ),
    upsert_res AS (
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method, observed_at
      )
      SELECT 
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method, observed_at
      FROM incoming_identity
      ON CONFLICT (source_id, source_person_id) DO UPDATE SET
        identifier_value  = EXCLUDED.identifier_value,
        confidence        = EXCLUDED.confidence,
        resolution_method = EXCLUDED.resolution_method,
        observed_at       = EXCLUDED.observed_at
      RETURNING (xmax = 0) AS is_inserted
    )
    SELECT
      count(*),
      count(*) FILTER (WHERE is_inserted),
      count(*) FILTER (WHERE NOT is_inserted),
      (SELECT count(*) FROM new_candidates)
    INTO v_identity_total, v_identity_inserted, v_identity_updated, v_new_unique_people
    FROM upsert_res;

    v_id_map_upsert_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start_ts)) * 1000)::numeric, 3);
  END IF;

  -- 2. PURE SET-BASED OUTBOX V2 & DELIVERY KEYS (NO TEMPORARY TABLES)
  IF v_has_outbox THEN
    v_step_start_ts := clock_timestamp();

    WITH incoming_outbox AS (
      SELECT DISTINCT ON (source_id, source_record_id)
        atlas_person_id, source_id, source_record_id, payload,
        COALESCE(payload_version, 1) AS payload_version,
        (source_id || ':' || source_record_id || ':v' || COALESCE(payload_version, 1)) AS logical_event_id
      FROM jsonb_to_recordset(p_outbox_rows) AS x(
        atlas_person_id text, source_id text, source_record_id text,
        payload jsonb, payload_version integer
      )
      ORDER BY source_id, source_record_id, payload_version DESC
    ),
    upsert_keys AS (
      INSERT INTO public.atlas_search_delivery_keys (
        logical_event_id, atlas_person_id, source_id, source_record_id,
        payload_version, delivery_status, first_committed_at, last_seen_at
      )
      SELECT 
        inc.logical_event_id, inc.atlas_person_id, inc.source_id, inc.source_record_id,
        inc.payload_version, 'COMMITTED', now(), now()
      FROM incoming_outbox inc
      ON CONFLICT (logical_event_id) DO UPDATE SET
        last_seen_at = now()
      RETURNING (xmax = 0) AS is_new_event, logical_event_id
    ),
    insert_v2 AS (
      INSERT INTO public.atlas_search_outbox_v2 (
        logical_event_id, atlas_person_id, source_id, source_record_id,
        payload, payload_version, status, attempt_count, created_at, next_retry_at
      )
      SELECT 
        inc.logical_event_id, inc.atlas_person_id, inc.source_id, inc.source_record_id,
        inc.payload, inc.payload_version, 'PENDING', 0, now(), now()
      FROM incoming_outbox inc
      JOIN upsert_keys uk ON uk.logical_event_id = inc.logical_event_id
      WHERE uk.is_new_event = true
      RETURNING outbox_id
    )
    SELECT
      (SELECT count(*) FROM incoming_outbox),
      (SELECT count(*) FROM insert_v2),
      (SELECT count(*) FROM incoming_outbox) - (SELECT count(*) FROM insert_v2)
    INTO v_outbox_total, v_outbox_inserted, v_outbox_requeued;

    v_outbox_insert_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start_ts)) * 1000)::numeric, 3);
  END IF;

  -- 3. SSOT METRICS UPDATE
  v_step_start_ts := clock_timestamp();
  IF v_new_unique_people > 0 THEN
    UPDATE public.atlas_people_live_metrics
    SET qualified_unique_real_people = qualified_unique_real_people + v_new_unique_people,
        unique_people = unique_people + v_new_unique_people,
        verified_entities = verified_entities + v_new_unique_people,
        people_added_today = people_added_today + v_new_unique_people,
        last_verified_change_at = now(),
        updated_at = now()
    WHERE id = 'current';
  END IF;
  v_metrics_upsert_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_step_start_ts)) * 1000)::numeric, 3);

  -- 4. FINALIZATION
  v_fn_total_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_fn_start_ts)) * 1000)::numeric, 3);

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'rpc_id', p_rpc_id,
    'cohort_epoch', p_cohort_epoch,
    'commit_fabric_version', 'V4_PURE_CTE',
    'identity_rows_processed', v_identity_total,
    'identity_rows_inserted', v_identity_inserted,
    'identity_rows_updated', v_identity_updated,
    'outbox_rows_created', v_outbox_inserted,
    'outbox_rows_requeued', v_outbox_requeued,
    'NEW_UNIQUE_PEOPLE_INSERTED', v_new_unique_people,
    'server_timing', jsonb_build_object(
      'server_function_total_ms', v_fn_total_ms,
      'total_function_ms', v_fn_total_ms,
      'stage_input_parse_ms', v_input_parse_ms,
      'stage_source_identity_lookup_ms', v_src_lookup_ms,
      'stage_global_identity_lookup_ms', v_global_lookup_ms,
      'stage_canonical_person_upsert_ms', v_metrics_upsert_ms,
      'stage_identity_map_upsert_ms', v_id_map_upsert_ms,
      'stage_discovery_candidate_write_ms', v_delivery_keys_ms,
      'stage_outbox_insert_ms', v_outbox_insert_ms,
      'stage_finalization_ms', v_finalization_ms,
      'server_stage_sum_ms', (v_id_map_upsert_ms + v_outbox_insert_ms + v_metrics_upsert_ms),
      'server_unaccounted_ms', GREATEST(0, ROUND((v_fn_total_ms - (v_id_map_upsert_ms + v_outbox_insert_ms + v_metrics_upsert_ms))::numeric, 3))
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok', false,
    'error', SQLERRM,
    'code', SQLSTATE,
    'commit_fabric_version', 'V4_PURE_CTE'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox_v4(jsonb, jsonb, text, text, text) TO service_role, postgres, anon, authenticated;
ALTER FUNCTION public.commit_canonical_with_search_outbox_v4(jsonb, jsonb, text, text, text) SET statement_timeout = '60s';
COMMENT ON FUNCTION public.commit_canonical_with_search_outbox_v4 IS 'Atlas Commit Fabric V1 — Pure in-memory set-based CTE transaction (Zero Temp Table Churn).';
`;

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  console.log('Deploying commit_canonical_with_search_outbox_v4...');
  const t0 = Date.now();
  await pool.query(v4Sql);
  console.log(`Function commit_canonical_with_search_outbox_v4 deployed successfully in ${Date.now() - t0}ms!`);

  // Verify function existence and signature
  const res = await pool.query(`
    SELECT proname, pg_get_function_identity_arguments(oid) as args
    FROM pg_proc
    WHERE proname = 'commit_canonical_with_search_outbox_v4';
  `);
  console.log('Verified registered function:');
  console.log(res.rows[0]);

  await pool.end();
}

main().catch(console.error);
