import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const dbConfig = parseDbUrl(process.env.DATABASE_URL);
const pool = new pg.Pool({ ...dbConfig, max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '30s'");
    const { rows } = await client.query(`
      SELECT prosrc FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = 'atlas_ingest_v2_shadow' AND proname = 'commit_staged_batch_v2';
    `);
    fs.writeFileSync('scripts/commit_staged_batch_v2.sql', rows[0].prosrc);
    console.log('Saved to scripts/commit_staged_batch_v2.sql');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
