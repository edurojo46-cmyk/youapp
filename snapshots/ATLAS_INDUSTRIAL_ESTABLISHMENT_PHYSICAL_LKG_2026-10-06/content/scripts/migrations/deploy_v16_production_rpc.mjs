import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('⚡ DEPLOYING ATLAS V1.6 PRODUCTION DIRECT-WRITE RPC & COMPAT VIEW');
  console.log('================================================================\n');

  try {
    // 1. Direct-write Production RPC (Hot path: writes directly to physical tables, NO INSTEAD OF triggers)
    console.log('1. Deploying atlas_resolve_and_ingest_batch_v16_production_rpc...');
    const rpcSql = `
    CREATE OR REPLACE FUNCTION public.atlas_resolve_and_ingest_batch_v16_production_rpc(
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

      -- 3. Direct Write: Minimal Transactional Durable Outbox
      v_t_outbox := clock_timestamp();
      
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
      v_out_ms := (EXTRACT(EPOCH FROM (clock_timestamp() - v_t_outbox)) * 1000.0);

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
    console.log('✅ atlas_resolve_and_ingest_batch_v16_production_rpc deployed successfully.');

    // 2. Backward-Compatibility Read View (Physical atlas_person_identity_map is preserved for rollback)
    console.log('\n2. Deploying atlas_person_identity_map_compat_v16 view for legacy consumers...');
    const viewSql = `
    CREATE OR REPLACE VIEW public.atlas_person_identity_map_compat_v16 AS
    SELECT 
      k.source_id,
      k.source_person_id,
      k.atlas_person_id,
      n.national_identity_hmac as identifier_value,
      CASE WHEN n.national_identity_hmac IS NOT NULL THEN 'NATIONAL_IDENTITY_HMAC' ELSE 'SOURCE_KEY' END as identifier_type,
      k.created_at,
      k.created_at as last_seen_at
    FROM public.atlas_hot_source_key_map k
    LEFT JOIN public.atlas_hot_national_identity_map n 
      ON k.atlas_person_id = n.atlas_person_id;
    `;
    await client.query(viewSql);
    console.log('✅ atlas_person_identity_map_compat_v16 view deployed.');

    // 3. INSTEAD OF Trigger on the compatibility view ONLY for legacy fallback writes
    console.log('\n3. Deploying INSTEAD OF trigger on compatibility view for legacy writers...');
    const triggerSql = `
    CREATE OR REPLACE FUNCTION public.fn_atlas_person_identity_map_compat_v16_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO public.atlas_hot_source_key_map (
        source_id, source_person_id, atlas_person_id, created_at
      ) VALUES (
        NEW.source_id, NEW.source_person_id, NEW.atlas_person_id, COALESCE(NEW.created_at, NOW())
      ) ON CONFLICT (source_id, source_person_id) 
      DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;

      IF NEW.identifier_value IS NOT NULL AND NEW.identifier_value != '' AND NEW.identifier_type IN ('NATIONAL_IDENTITY_HMAC', 'DNI_HMAC') THEN
        INSERT INTO public.atlas_hot_national_identity_map (
          national_identity_hmac, atlas_person_id, created_at
        ) VALUES (
          NEW.identifier_value, NEW.atlas_person_id, COALESCE(NEW.created_at, NOW())
        ) ON CONFLICT (national_identity_hmac) 
        DO UPDATE SET atlas_person_id = EXCLUDED.atlas_person_id;
      END IF;

      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS trg_compat_v16_insert ON public.atlas_person_identity_map_compat_v16;
    CREATE TRIGGER trg_compat_v16_insert
    INSTEAD OF INSERT ON public.atlas_person_identity_map_compat_v16
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_atlas_person_identity_map_compat_v16_insert();
    `;
    await client.query(triggerSql);
    console.log('✅ Compatibility trigger deployed (Strictly isolated from hot path RPC).');

    console.log('\n================================================================');
    console.log('🏆 V1.6 PRODUCTION RPC & COMPAT VIEW DEPLOYMENT COMPLETE');
    console.log('================================================================\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Deployment error:', err);
  process.exit(1);
});
