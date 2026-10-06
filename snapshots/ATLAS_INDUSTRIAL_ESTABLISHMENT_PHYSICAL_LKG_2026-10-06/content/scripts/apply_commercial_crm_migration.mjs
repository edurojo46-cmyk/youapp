import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  console.log('[MIGRATION] Applying Commercial CRM v1 schema & RLS...');
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    // 1. Add commercial tracking columns to atlas_user_saved_relations
    await client.query(`
      ALTER TABLE public.atlas_user_saved_relations
        ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL DEFAULT 'NEW',
        ADD COLUMN IF NOT EXISTS priority TEXT,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS next_action TEXT,
        ADD COLUMN IF NOT EXISTS next_action_date DATE,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS idx_saved_relations_status ON public.atlas_user_saved_relations(commercial_status);
      CREATE INDEX IF NOT EXISTS idx_saved_relations_priority ON public.atlas_user_saved_relations(priority);
    `);

    // 2. Add base_purpose to atlas_user_bases
    await client.query(`
      ALTER TABLE public.atlas_user_bases
        ADD COLUMN IF NOT EXISTS base_purpose TEXT DEFAULT 'SALES_PROSPECTING';
    `);

    // 3. Create atlas_user_segments and atlas_user_segment_items
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_user_segments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_user_segment_name UNIQUE (user_id, name)
      );

      CREATE INDEX IF NOT EXISTS idx_user_segments_user ON public.atlas_user_segments(user_id);
      ALTER TABLE public.atlas_user_segments ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS user_segments_all_own ON public.atlas_user_segments;
      CREATE POLICY user_segments_all_own ON public.atlas_user_segments
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);

      CREATE TABLE IF NOT EXISTS public.atlas_user_segment_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        segment_id UUID NOT NULL REFERENCES public.atlas_user_segments(id) ON DELETE CASCADE,
        saved_relation_id UUID NOT NULL REFERENCES public.atlas_user_saved_relations(id) ON DELETE CASCADE,
        product_id UUID NOT NULL,
        company_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_segment_item UNIQUE (segment_id, saved_relation_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_segment_items_seg ON public.atlas_user_segment_items(segment_id);
      CREATE INDEX IF NOT EXISTS idx_user_segment_items_user ON public.atlas_user_segment_items(user_id);
      ALTER TABLE public.atlas_user_segment_items ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS user_segment_items_all_own ON public.atlas_user_segment_items;
      CREATE POLICY user_segment_items_all_own ON public.atlas_user_segment_items
        FOR ALL
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);
    `);

    console.log('[MIGRATION] Commercial CRM v1 schema & RLS successfully applied.');
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
