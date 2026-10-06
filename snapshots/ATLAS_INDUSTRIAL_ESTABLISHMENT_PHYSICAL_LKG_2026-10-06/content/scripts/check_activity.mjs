import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();
const dbConfig = parseDbUrl();

async function main() {
  const pool = new pg.Pool({ ...dbConfig, database: 'atlas_shadow_cold_gate', ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const res = await client.query(`
    SELECT pid, state, wait_event_type, wait_event, query 
    FROM pg_stat_activity 
    WHERE datname = 'atlas_shadow_cold_gate' AND pid != pg_backend_pid();
  `);
  console.log(res.rows);
  client.release();
  await pool.end();
}
main().catch(console.error);
