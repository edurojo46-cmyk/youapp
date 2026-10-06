import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

export const NEW_RPC_SQL = `
CREATE OR REPLACE FUNCTION public.commit_canonical_with_search_outbox(
  p_identity_rows jsonb,
  p_outbox_rows   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_identity_total    integer := 0;
  v_identity_inserted integer := 0;
  v_identity_updated  integer := 0;
  v_outbox_total      integer := 0;
  v_outbox_inserted   integer := 0;
  v_outbox_requeued   integer := 0;
  v_new_unique_people integer := 0;
  v_has_identity      boolean := false;
  v_has_outbox        boolean := false;
BEGIN
  v_has_identity := (p_identity_rows IS NOT NULL AND jsonb_typeof(p_identity_rows) = 'array' AND jsonb_array_length(p_identity_rows) > 0);
  v_has_outbox   := (p_outbox_rows IS NOT NULL AND jsonb_typeof(p_outbox_rows) = 'array' AND jsonb_array_length(p_outbox_rows) > 0);

  IF NOT v_has_identity AND NOT v_has_outbox THEN
    RETURN jsonb_build_object(
      'ok', true,
      'identity_rows_processed', 0,
      'identity_rows_inserted', 0,
      'identity_rows_updated', 0,
      'outbox_rows_created', 0,
      'outbox_rows_requeued', 0,
      'NEW_UNIQUE_PEOPLE_INSERTED', 0
    );
  END IF;

  -- 1. SET-BASED UPSERT FOR IDENTITY MAP
  IF v_has_identity THEN
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
    new_people AS (
      SELECT DISTINCT i.atlas_person_id
      FROM incoming_identity i
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_person_identity_map existing
        WHERE existing.atlas_person_id = i.atlas_person_id
      )
    ),
    upsert_identity AS (
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method, observed_at
      )
      SELECT * FROM incoming_identity
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
      (SELECT count(*) FROM new_people)
    INTO v_identity_total, v_identity_inserted, v_identity_updated, v_new_unique_people
    FROM upsert_identity;
  END IF;

  -- 2. SET-BASED IDEMPOTENCY & UPSERT FOR OUTBOX V2
  IF v_has_outbox THEN
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
    -- Register into Global Delivery Keys (determines if new event vs duplicate retry)
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
    -- Insert only net new logical delivery events into Outbox V2
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
  END IF;

  -- 3. RETURN METRICS (HOT ROW atlas_people_live_metrics REMOVED FROM CRITICAL COMMIT PATH)
  RETURN jsonb_build_object(
    'ok', true,
    'identity_rows_processed', v_identity_total,
    'identity_rows_inserted', v_identity_inserted,
    'identity_rows_updated', v_identity_updated,
    'outbox_rows_created', v_outbox_inserted,
    'outbox_rows_requeued', v_outbox_requeued,
    'NEW_UNIQUE_PEOPLE_INSERTED', v_new_unique_people
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.commit_canonical_with_search_outbox(jsonb, jsonb) TO service_role;
`;

async function applyMigration() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  console.log('[MIGRATION] Applying non-blocking commit_canonical_with_search_outbox RPC...');
  await pool.query(NEW_RPC_SQL);
  console.log('✅ Successfully replaced commit_canonical_with_search_outbox in PostgreSQL.');

  // Verify definition
  const verifyRes = await pool.query(`
    SELECT pg_get_functiondef(oid) as def
    FROM pg_proc
    WHERE proname = 'commit_canonical_with_search_outbox';
  `);
  const def = verifyRes.rows[0]?.def || '';
  if (def.includes("UPDATE public.atlas_people_live_metrics")) {
    throw new Error('Verification failed: atlas_people_live_metrics still present in RPC!');
  } else {
    console.log('✅ Verified: atlas_people_live_metrics hot row is COMPLETELY REMOVED from RPC.');
  }

  await pool.end();
}

if (process.argv[1]?.endsWith('remove_live_metrics_from_commit_rpc.mjs')) {
  applyMigration().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
