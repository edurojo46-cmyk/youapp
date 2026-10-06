import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    console.log('Deploying Hot Resolver V1.5 Shadow Tables...');
    const ddl = fs.readFileSync('scripts/migrations/deploy_hot_resolver_v15_shadow.sql', 'utf-8');
    await client.query(ddl);
    console.log('Shadow tables deployed successfully.');

    console.log('Deploying atlas_resolve_and_ingest_batch_v15_shadow_rpc...');
    const rpcSql = `
    CREATE OR REPLACE FUNCTION public.atlas_resolve_and_ingest_batch_v15_shadow_rpc(
      p_sources text[],
      p_src_ids text[],
      p_hmacs text[],
      p_person_ids text[],
      p_decisions text[],
      p_evidence_ids text[],
      p_observed_ats timestamptz[],
      p_payloads jsonb[] DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_t0 timestamptz := clock_timestamp();
      v_t_fallback timestamptz;
      v_t_identity timestamptz;
      v_t_outbox timestamptz;
      
      v_fb_ms numeric := 0;
      v_id_ms numeric := 0;
      v_out_ms numeric := 0;
      v_tot_ms numeric := 0;

      v_keys_inserted int := 0;
      v_hmacs_inserted int := 0;
      v_outbox_inserted int := 0;
    BEGIN
      -- 1. Hot Source Key Map Insertion
      v_t_fallback := clock_timestamp();
      
      INSERT INTO public.atlas_hot_source_key_map (
        source_id, source_person_id, atlas_person_id, created_at
      )
      SELECT 
        u.source_id,
        u.source_person_id,
        u.atlas_person_id,
        u.observed_at
      FROM unnest(p_sources, p_src_ids, p_person_ids, p_observed_ats) 
        AS u(source_id, source_person_id, atlas_person_id, observed_at)
      ON CONFLICT (source_id, source_person_id) 
      DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
      
      GET DIAGNOSTICS v_keys_inserted = ROW_COUNT;

      -- 2. Hot National Identity Map Insertion (For rows with valid HMAC)
      INSERT INTO public.atlas_hot_national_identity_map (
        national_identity_hmac, atlas_person_id, created_at
      )
      SELECT 
        u.hmac,
        u.atlas_person_id,
        u.observed_at
      FROM unnest(p_hmacs, p_person_ids, p_observed_ats) 
        AS u(hmac, atlas_person_id, observed_at)
      WHERE u.hmac IS NOT NULL AND u.hmac != ''
      ON CONFLICT (national_identity_hmac) 
      DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;

      GET DIAGNOSTICS v_hmacs_inserted = ROW_COUNT;
      v_id_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_t_fallback)) * 1000.0);

      -- 3. Minimal Transactional Durable Outbox Insertion
      v_t_identity := clock_timestamp();
      
      INSERT INTO public.atlas_search_outbox_minimal (
        atlas_person_id, source_id, source_person_id, source_record_id, event_type, status, created_at
      )
      SELECT 
        u.atlas_person_id,
        u.source_id,
        u.source_person_id,
        u.source_person_id,
        'UPSERT',
        'PENDING',
        u.observed_at
      FROM unnest(p_person_ids, p_sources, p_src_ids, p_observed_ats)
        AS u(atlas_person_id, source_id, source_person_id, observed_at);

      GET DIAGNOSTICS v_outbox_inserted = ROW_COUNT;
      v_out_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_t_identity)) * 1000.0);

      v_tot_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000.0);

      RETURN jsonb_build_object(
        'status', 'OK',
        'keys_inserted', v_keys_inserted,
        'hmacs_inserted', v_hmacs_inserted,
        'outbox_inserted', v_outbox_inserted,
        'HOT_IDENTITY_INSERT_MS', round(v_id_ms, 2),
        'MINIMAL_OUTBOX_INSERT_MS', round(v_out_ms, 2),
        'HOT_PATH_TOTAL_SERVER_MS', round(v_tot_ms, 2)
      );
    END;
    $$;
    `;
    await client.query(rpcSql);
    console.log('atlas_resolve_and_ingest_batch_v15_shadow_rpc successfully deployed!');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
