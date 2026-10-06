import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const res = await pool.query(`
    SELECT 
      pid, 
      usename,
      wait_event_type, 
      wait_event, 
      ROUND((EXTRACT(EPOCH FROM (now() - query_start)))::numeric, 2) as duration_sec,
      LEFT(query, 120) as query_sample
    FROM pg_stat_activity
    WHERE state = 'active' AND pid <> pg_backend_pid()
    ORDER BY duration_sec DESC;
  `);
  console.table(res.rows);
  await pool.end();
}

run().catch(console.error);
