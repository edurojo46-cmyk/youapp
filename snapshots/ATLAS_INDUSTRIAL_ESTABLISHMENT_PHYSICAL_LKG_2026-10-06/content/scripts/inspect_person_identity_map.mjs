import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl() });

async function inspectPersonMap() {
  const client = await pool.connect();
  try {
    const cols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'atlas_person_identity_map';
    `);
    console.log('Columns:', cols.rows);

    const sample = await client.query(`
      SELECT * FROM public.atlas_person_identity_map
      LIMIT 2;
    `);
    console.log('Sample rows:', sample.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

inspectPersonMap().catch(console.error);
