import pg from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/pg/lib/index.js';
import dotenv from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/dotenv/lib/main.js';
import { parseDbUrl } from 'file:///c:/Users/Eduardo/YOUAPP/scripts/export_search_projection_v2.mjs';

dotenv.config({ path: 'c:/Users/Eduardo/YOUAPP/.env' });

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('⚡ DEPLOYING ATLAS V1.9 APPEND-ONLY OUTBOX V2 SHADOW & RPC');
  console.log('================================================================\n');

  try {
    // 1. Table atlas_search_outbox_v2
    console.log('1. Creating atlas_search_outbox_v2 (append-only, immutable events)...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_search_outbox_v2 (
        event_id bigserial PRIMARY KEY,
        atlas_person_id text NOT NULL,
        source_id text NOT NULL,
        source_person_id text NOT NULL,
        schema_version int NOT NULL DEFAULT 1,
        projection_version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_v2_person_id 
        ON public.atlas_search_outbox_v2 (atlas_person_id);
    `);
    console.log('   ✅ Table atlas_search_outbox_v2 ready.');

    // 2. Table atlas_search_consumer_checkpoint
    console.log('2. Creating atlas_search_consumer_checkpoint (single-row checkpoint)...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_search_consumer_checkpoint (
        consumer_id text PRIMARY KEY,
        last_committed_event_id bigint NOT NULL DEFAULT 0,
        last_successful_meili_task_uid bigint,
        last_batch_event_count int DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT NOW()
      );

      INSERT INTO public.atlas_search_consumer_checkpoint (
        consumer_id, last_committed_event_id, updated_at
      )
      VALUES ('meili_multi_rotor', 0, NOW())
      ON CONFLICT (consumer_id) DO NOTHING;
    `);
    console.log('   ✅ Table atlas_search_consumer_checkpoint ready.');

    // 3. Deploy Direct-Write Production-Shadow RPC v19
    console.log('3. Deploying atlas_resolve_and_ingest_batch_v19_append_rpc...');
    const rpcSql = `
    CREATE OR REPLACE FUNCTION public.atlas_resolve_and_ingest_batch_v19_append_rpc(
      p_sources text[],
      p_src_ids text[],
      p_hmacs text[],
      p_person_ids text[],
      p_decisions text[],
      p_evidence_ids text[],
      p_observed_ats timestamptz[],
      p_projection_versions int[] DEFAULT NULL,
      p_payloads jsonb[] DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_t0 timestamptz := clock_timestamp();
      v_t_id timestamptz;
      v_t_outbox timestamptz;
      
      v_id_ms numeric := 0;
      v_out_ms numeric := 0;
      v_tot_ms numeric := 0;

      v_keys_inserted int := 0;
      v_hmacs_inserted int := 0;
      v_outbox_inserted int := 0;
    BEGIN
      v_t_id := clock_timestamp();

      -- 1. Direct Write: Hot Source Key Map
      INSERT INTO public.atlas_hot_source_key_map (
        source_id, source_person_id, atlas_person_id, created_at
      )
      SELECT DISTINCT ON (u.source_id, u.source_person_id)
        u.source_id,
        u.source_person_id,
        u.atlas_person_id,
        u.observed_at
      FROM unnest(p_sources, p_src_ids, p_person_ids, p_observed_ats) 
        AS u(source_id, source_person_id, atlas_person_id, observed_at)
      ON CONFLICT (source_id, source_person_id) 
      DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
      
      GET DIAGNOSTICS v_keys_inserted = ROW_COUNT;

      -- 2. Direct Write: Hot National Identity Map (For rows with valid HMAC)
      INSERT INTO public.atlas_hot_national_identity_map (
        national_identity_hmac, atlas_person_id, created_at
      )
      SELECT DISTINCT ON (u.hmac)
        u.hmac,
        u.atlas_person_id,
        u.observed_at
      FROM unnest(p_hmacs, p_person_ids, p_observed_ats) 
        AS u(hmac, atlas_person_id, observed_at)
      WHERE u.hmac IS NOT NULL AND u.hmac != ''
      ON CONFLICT (national_identity_hmac) 
      DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;

      GET DIAGNOSTICS v_hmacs_inserted = ROW_COUNT;
      v_id_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_t_id)) * 1000.0);

      -- 3. Direct Write: Append-Only Outbox V2 (Pure Append, NO mutable status!)
      v_t_outbox := clock_timestamp();
      
      IF p_projection_versions IS NOT NULL AND array_length(p_projection_versions, 1) = array_length(p_person_ids, 1) THEN
        INSERT INTO public.atlas_search_outbox_v2 (
          atlas_person_id, source_id, source_person_id, schema_version, projection_version, created_at
        )
        SELECT 
          u.atlas_person_id,
          u.source_id,
          u.source_person_id,
          1,
          u.proj_ver,
          u.observed_at
        FROM unnest(p_person_ids, p_sources, p_src_ids, p_projection_versions, p_observed_ats)
          AS u(atlas_person_id, source_id, source_person_id, proj_ver, observed_at);
      ELSE
        INSERT INTO public.atlas_search_outbox_v2 (
          atlas_person_id, source_id, source_person_id, schema_version, projection_version, created_at
        )
        SELECT 
          u.atlas_person_id,
          u.source_id,
          u.source_person_id,
          1,
          1,
          u.observed_at
        FROM unnest(p_person_ids, p_sources, p_src_ids, p_observed_ats)
          AS u(atlas_person_id, source_id, source_person_id, observed_at);
      END IF;

      GET DIAGNOSTICS v_outbox_inserted = ROW_COUNT;
      v_out_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_t_outbox)) * 1000.0);

      v_tot_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000.0);

      RETURN jsonb_build_object(
        'status', 'OK',
        'keys_inserted', v_keys_inserted,
        'hmacs_inserted', v_hmacs_inserted,
        'outbox_inserted', v_outbox_inserted,
        'HOT_IDENTITY_INSERT_MS', round(v_id_ms, 2),
        'OUTBOX_V2_APPEND_MS', round(v_out_ms, 2),
        'HOT_PATH_TOTAL_SERVER_MS', round(v_tot_ms, 2)
      );
    END;
    $$;
    `;
    await client.query(rpcSql);
    console.log('   ✅ atlas_resolve_and_ingest_batch_v19_append_rpc deployed successfully.');

    // 4. Verify deployment
    const verifyRes = await client.query(`
      SELECT 
        (SELECT count(*) FROM public.atlas_search_outbox_v2) as outbox_count,
        (SELECT count(*) FROM public.atlas_search_consumer_checkpoint) as checkpoint_count;
    `);
    console.log('\nDeployment verification:', verifyRes.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
