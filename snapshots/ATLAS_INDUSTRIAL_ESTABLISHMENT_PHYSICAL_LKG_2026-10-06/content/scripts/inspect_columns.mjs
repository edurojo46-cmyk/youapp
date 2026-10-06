import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const cols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'atlas_person_identity_map'
    ORDER BY ordinal_position;
  `);
  console.log('--- atlas_person_identity_map COLUMNS ---');
  console.table(cols.rows);

  const candCols = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'atlas_people_discovery_candidates'
    ORDER BY ordinal_position;
  `);
  console.log('\n--- atlas_people_discovery_candidates COLUMNS ---');
  console.table(candCols.rows);

  await pool.end();
}

run().catch(console.error);
