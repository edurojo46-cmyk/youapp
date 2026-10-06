import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  console.log('[MIGRATION] Applying atlas_user_bases schema...');
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_user_bases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        base_name TEXT NOT NULL,
        original_query TEXT,
        filters JSONB DEFAULT '{}'::jsonb,
        sort TEXT,
        total_results_at_save INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_base_name UNIQUE (user_id, base_name)
      );

      CREATE INDEX IF NOT EXISTS idx_user_bases_user_id ON public.atlas_user_bases(user_id);

      ALTER TABLE public.atlas_user_bases ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS user_bases_all_own ON public.atlas_user_bases;
      CREATE POLICY user_bases_all_own ON public.atlas_user_bases
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);

    console.log('[MIGRATION] atlas_user_bases schema applied successfully.');
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
