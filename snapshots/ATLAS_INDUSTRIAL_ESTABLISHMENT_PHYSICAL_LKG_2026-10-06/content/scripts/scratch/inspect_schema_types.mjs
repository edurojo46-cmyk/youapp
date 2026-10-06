import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  const res1 = await client.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'atlas_person_identity_map'
    ORDER BY ordinal_position
  `);
  console.log('\n=== ATLAS_PERSON_IDENTITY_MAP COLUMNS ===');
  console.table(res1.rows);

  const res2 = await client.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'atlas_search_outbox'
    ORDER BY ordinal_position
  `);
  console.log('\n=== ATLAS_SEARCH_OUTBOX COLUMNS ===');
  console.table(res2.rows);

  client.release();
  await pool.end();
}

main().catch(console.error);
