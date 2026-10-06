import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function check() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT pid, query, state, wait_event_type, wait_event, (now() - query_start) as duration
      FROM pg_stat_activity
      WHERE state != 'idle' AND pid != pg_backend_pid();
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
