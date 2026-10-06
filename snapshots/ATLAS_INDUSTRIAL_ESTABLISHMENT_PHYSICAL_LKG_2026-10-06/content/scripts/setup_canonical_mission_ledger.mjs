import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 4 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN;');

    // 1. Revert the 1,156 rows originally belonging to GEN_1_ECOSYSTEM_NET_NEW
    // (first_seen_at < 2026-09-28T01:00:00Z and is_preexisting = false)
    const revertRes = await client.query(`
      UPDATE public.atlas_global_email_authority
      SET authority_generation = 'GEN_1_ECOSYSTEM_NET_NEW'
      WHERE is_preexisting = false 
        AND first_seen_at < '2026-09-28T01:00:00Z'
        AND authority_generation = 'AUTONOMOUS_500K_RUN';
    `);
    console.log(`Reverted ${revertRes.rowCount} rows back to GEN_1_ECOSYSTEM_NET_NEW.`);

    // 2. Create the immutable append-only ledger table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_500k_mission_ledger (
        sequence_id BIGSERIAL PRIMARY KEY,
        email_normalized TEXT NOT NULL UNIQUE,
        email_hash TEXT NOT NULL,
        first_physical_inserted_at TIMESTAMPTZ NOT NULL,
        source_origin TEXT NOT NULL,
        mission_run_id TEXT NOT NULL,
        CONSTRAINT fk_500k_ledger_email FOREIGN KEY (email_normalized)
          REFERENCES public.atlas_global_email_authority(email_normalized) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_500k_ledger_inserted_at 
        ON public.atlas_500k_mission_ledger(first_physical_inserted_at);
    `);
    console.log('Immutable ledger public.atlas_500k_mission_ledger ensured.');

    // 3. Populate immutable ledger with certified FIRST PHYSICAL INSERTS from AUTONOMOUS_500K_RUN
    const insertRes = await client.query(`
      INSERT INTO public.atlas_500k_mission_ledger (
        email_normalized, email_hash, first_physical_inserted_at, source_origin, mission_run_id
      )
      SELECT 
        email_normalized,
        email_hash,
        first_seen_at,
        source_origin,
        'AUTONOMOUS_500K_RUN'
      FROM public.atlas_global_email_authority
      WHERE authority_generation = 'AUTONOMOUS_500K_RUN'
        AND is_preexisting = false
      ON CONFLICT (email_normalized) DO NOTHING;
    `);
    console.log(`Populated immutable ledger with ${insertRes.rowCount} certified rows.`);

    // 4. Verify counts
    const qLedger = await client.query("SELECT count(*) FROM public.atlas_500k_mission_ledger;");
    const qAuth500k = await client.query("SELECT count(*) FROM public.atlas_global_email_authority WHERE authority_generation = 'AUTONOMOUS_500K_RUN';");
    const qAuthGen1 = await client.query("SELECT count(*) FROM public.atlas_global_email_authority WHERE authority_generation = 'GEN_1_ECOSYSTEM_NET_NEW';");
    const qAuthGen0 = await client.query("SELECT count(*) FROM public.atlas_global_email_authority WHERE authority_generation = 'GEN_0_HISTORICAL_BASELINE';");
    const qTotal = await client.query("SELECT count(*) FROM public.atlas_global_email_authority;");

    console.log('\n=== AUDITED POST-CLEANUP COUNTS ===');
    console.log('atlas_500k_mission_ledger count:', qLedger.rows[0].count);
    console.log('atlas_global_email_authority (AUTONOMOUS_500K_RUN):', qAuth500k.rows[0].count);
    console.log('atlas_global_email_authority (GEN_1_ECOSYSTEM_NET_NEW):', qAuthGen1.rows[0].count);
    console.log('atlas_global_email_authority (GEN_0_HISTORICAL_BASELINE):', qAuthGen0.rows[0].count);
    console.log('Total authority:', qTotal.rows[0].count);

    await client.query('COMMIT;');
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
