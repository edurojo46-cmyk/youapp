import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const c = new pg.Client(parseDbUrl());
await c.connect();

const res = await c.query("SELECT to_regclass('public.atlas_snapshot_processing_runs') as tbl;");
console.log('atlas_snapshot_processing_runs table:', res.rows[0].tbl);

if (!res.rows[0].tbl) {
  console.log('Creating table public.atlas_snapshot_processing_runs...');
  await c.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_snapshot_processing_runs (
      run_id text PRIMARY KEY,
      snapshot_id text NOT NULL,
      processing_scope text NOT NULL,
      candidate_population text NOT NULL,
      raw_start_offset bigint NOT NULL,
      raw_end_offset bigint,
      eligible_candidates_processed bigint NOT NULL DEFAULT 0,
      status text NOT NULL DEFAULT 'RUNNING',
      checkpoint_id text,
      started_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      metadata jsonb DEFAULT '{}'::jsonb
    );
  `);
  console.log('Table public.atlas_snapshot_processing_runs created.');
}

await c.end();
