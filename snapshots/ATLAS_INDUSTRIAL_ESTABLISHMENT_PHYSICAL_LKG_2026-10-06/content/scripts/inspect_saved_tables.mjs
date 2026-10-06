import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND (table_name LIKE '%saved%' OR table_name LIKE '%base%' OR table_name LIKE '%user%');
    `);
    console.log('Tables found:', res.rows.map(r => r.table_name));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
