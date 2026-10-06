import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    const redRes = await client.query(`
      SELECT old_atlas_person_id, canonical_atlas_person_id, reason, identity_rule, created_at, migration_version
      FROM public.atlas_person_id_redirects
      ORDER BY old_atlas_person_id;
    `);

    console.log(`Found ${redRes.rows.length} rows in atlas_person_id_redirects:`);
    console.table(redRes.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
