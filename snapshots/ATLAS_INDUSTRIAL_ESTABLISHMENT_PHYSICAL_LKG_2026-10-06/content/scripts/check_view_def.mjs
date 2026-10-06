import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function check() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    const res = await client.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_argentina_people_search_projection_v1' AND is_nullable = 'NO';
    `);
    console.table(res.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
