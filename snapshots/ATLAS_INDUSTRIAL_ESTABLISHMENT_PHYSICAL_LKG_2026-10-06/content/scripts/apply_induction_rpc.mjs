import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const DDL = `
CREATE OR REPLACE FUNCTION public.atlas_ingest_batch_rpc(
  p_ids text[],
  p_sources text[],
  p_person_ids text[],
  p_types text[],
  p_values text[],
  p_evidences text[],
  p_confidences numeric[],
  p_resolutions text[],
  p_outbox_ids text[],
  p_outbox_sources text[],
  p_outbox_records text[],
  p_outbox_payloads jsonb[],
  p_outbox_versions int[],
  p_outbox_statuses text[],
  p_outbox_attempts int[],
  p_decisions text[]
)
RETURNS TABLE (
  identity_rows_inserted int,
  identity_rows_conflicted int,
  outbox_rows_inserted int,
  new_count int,
  merge_count int,
  conflict_count int,
  reject_count int,
  unresolved_count int
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_id_inserted int := 0;
  v_id_total int := 0;
  v_outbox_inserted int := 0;
  v_new int := 0;
  v_merge int := 0;
  v_conflict int := 0;
  v_reject int := 0;
  v_unresolved int := 0;
  v_dec text;
BEGIN
  v_id_total := cardinality(p_ids);

  -- Semantic decision counters strictly from pre-resolved decision metadata
  IF p_decisions IS NOT NULL THEN
    FOREACH v_dec IN ARRAY p_decisions
    LOOP
      IF v_dec = 'NEW' THEN
        v_new := v_new + 1;
      ELSIF v_dec = 'MERGE' THEN
        v_merge := v_merge + 1;
      ELSIF v_dec = 'CONFLICT' THEN
        v_conflict := v_conflict + 1;
      ELSIF v_dec = 'REJECT' THEN
        v_reject := v_reject + 1;
      ELSE
        v_unresolved := v_unresolved + 1;
      END IF;
    END LOOP;
  END IF;

  -- Statement 1: Identity Map insert with explicit column alias
  IF v_id_total > 0 THEN
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
      u.atlas_person_id,
      u.source_id,
      u.source_person_id,
      u.identifier_type,
      u.identifier_value,
      u.evidence_id,
      u.confidence,
      u.resolution_method,
      NOW()
    FROM UNNEST(
      p_ids,
      p_sources,
      p_person_ids,
      p_types,
      p_values,
      p_evidences,
      p_confidences,
      p_resolutions
    ) AS u(
      atlas_person_id,
      source_id,
      source_person_id,
      identifier_type,
      identifier_value,
      evidence_id,
      confidence,
      resolution_method
    )
    ON CONFLICT (source_id, source_person_id) DO NOTHING;

    GET DIAGNOSTICS v_id_inserted = ROW_COUNT;
  END IF;

  -- Statement 2: Search Outbox insert with explicit column alias
  IF cardinality(p_outbox_ids) > 0 THEN
    INSERT INTO public.atlas_search_outbox (
      atlas_person_id,
      source_id,
      source_record_id,
      payload,
      payload_version,
      status,
      attempt_count
    )
    SELECT
      o.atlas_person_id,
      o.source_id,
      o.source_record_id,
      o.payload,
      o.payload_version,
      o.status,
      o.attempt_count
    FROM UNNEST(
      p_outbox_ids,
      p_outbox_sources,
      p_outbox_records,
      p_outbox_payloads,
      p_outbox_versions,
      p_outbox_statuses,
      p_outbox_attempts
    ) AS o(
      atlas_person_id,
      source_id,
      source_record_id,
      payload,
      payload_version,
      status,
      attempt_count
    )
    ON CONFLICT (source_id, source_record_id) DO NOTHING;

    GET DIAGNOSTICS v_outbox_inserted = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT
    v_id_inserted,
    v_id_total - v_id_inserted,
    v_outbox_inserted,
    v_new,
    v_merge,
    v_conflict,
    v_reject,
    v_unresolved;
END;
$$;
`;

export async function deployRpc() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  try {
    console.log('Deploying corrected public.atlas_ingest_batch_rpc ...');
    await client.query(DDL);
    console.log('✅ atlas_ingest_batch_rpc deployed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.includes('apply_induction_rpc')) {
  deployRpc().catch(err => {
    console.error('❌ Failed to deploy RPC:', err);
    process.exit(1);
  });
}
