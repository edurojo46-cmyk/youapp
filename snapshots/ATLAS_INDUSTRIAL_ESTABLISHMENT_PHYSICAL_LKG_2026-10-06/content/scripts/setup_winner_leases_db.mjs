import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

export async function setupWinnerLeasesDb() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_winner_leases (
        lease_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        motor_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        source_universe TEXT NOT NULL,
        target_region TEXT NOT NULL,
        rotor_count INTEGER NOT NULL DEFAULT 1,
        allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lease_until TIMESTAMPTZ NOT NULL,
        last_torque NUMERIC(8,2) DEFAULT 0.0,
        last_health TEXT NOT NULL DEFAULT 'GREEN',
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        reason TEXT,
        hysteresis_history JSONB DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_atlas_winner_leases_status ON public.atlas_winner_leases(status, lease_until);
    `);
    console.log('✓ PostgreSQL table public.atlas_winner_leases verified/created successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('setup_winner_leases_db.mjs')) {
  setupWinnerLeasesDb().catch(console.error);
}
