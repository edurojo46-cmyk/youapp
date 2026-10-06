import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../scripts/export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename IN ('atlas_person_identity_map', 'atlas_search_outbox', 'atlas_people_live_metrics')
      ORDER BY tablename, indexname;
    `);
    console.log('--- DB INDEXES ---');
    for (const r of res.rows) {
      console.log(`[${r.tablename}] ${r.indexname}: ${r.indexdef}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
