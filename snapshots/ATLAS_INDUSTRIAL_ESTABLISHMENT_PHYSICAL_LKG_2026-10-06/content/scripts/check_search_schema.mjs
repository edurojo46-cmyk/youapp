import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function checkCols() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    const idxs = await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'atlas_argentina_people_search_v1';");
    console.log('Indexes on atlas_argentina_people_search_v1:', idxs.rows);

    const sample = await client.query("SELECT * FROM public.atlas_argentina_people_search_v1 LIMIT 1;");
    console.log('Sample row:', sample.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

checkCols().catch(console.error);
