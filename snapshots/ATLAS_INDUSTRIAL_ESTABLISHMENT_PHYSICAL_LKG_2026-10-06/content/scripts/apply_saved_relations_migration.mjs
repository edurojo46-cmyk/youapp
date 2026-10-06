import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  console.log('[MIGRATION] Applying atlas_user_saved_relations schema & RLS...');
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_user_saved_relations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        product_id UUID NOT NULL REFERENCES public.atlas_products(product_id) ON DELETE CASCADE,
        company_id UUID,
        relation_id UUID,
        base_name TEXT NOT NULL DEFAULT 'Mi base',
        saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_product_base UNIQUE (user_id, product_id, base_name)
      );

      CREATE INDEX IF NOT EXISTS idx_user_saved_relations_user ON public.atlas_user_saved_relations(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_saved_relations_product ON public.atlas_user_saved_relations(product_id);

      ALTER TABLE public.atlas_user_saved_relations ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS user_saved_select_own ON public.atlas_user_saved_relations;
      CREATE POLICY user_saved_select_own ON public.atlas_user_saved_relations
        FOR SELECT
        USING (auth.uid() = user_id);

      DROP POLICY IF EXISTS user_saved_insert_own ON public.atlas_user_saved_relations;
      CREATE POLICY user_saved_insert_own ON public.atlas_user_saved_relations
        FOR INSERT
        WITH CHECK (auth.uid() = user_id);

      DROP POLICY IF EXISTS user_saved_delete_own ON public.atlas_user_saved_relations;
      CREATE POLICY user_saved_delete_own ON public.atlas_user_saved_relations
        FOR DELETE
        USING (auth.uid() = user_id);

      DROP POLICY IF EXISTS user_saved_update_own ON public.atlas_user_saved_relations;
      CREATE POLICY user_saved_update_own ON public.atlas_user_saved_relations
        FOR UPDATE
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);

    console.log('[MIGRATION] Table and RLS policies successfully applied.');

    // Verify
    const verifyRes = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'atlas_user_saved_relations';
    `);
    console.log('Columns created:', verifyRes.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
