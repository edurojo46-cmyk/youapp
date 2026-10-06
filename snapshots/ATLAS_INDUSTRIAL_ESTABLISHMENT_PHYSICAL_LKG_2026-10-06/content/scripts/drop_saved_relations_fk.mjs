import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  console.log('[MIGRATION] Dropping strict FK constraint on atlas_user_saved_relations.product_id to allow both product and entity references...');
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    await client.query(`
      ALTER TABLE public.atlas_user_saved_relations 
      DROP CONSTRAINT IF EXISTS atlas_user_saved_relations_product_id_fkey;
    `);

    console.log('[MIGRATION] FK constraint successfully dropped. Canonical references can now be products or entities.');
  } finally {
    client.release();
    pool.end();
  }
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
