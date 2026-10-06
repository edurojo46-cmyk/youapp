import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const res = await pool.query(`
    SELECT pid, now() - query_start AS duration, query, state, wait_event_type, wait_event
    FROM pg_stat_activity
    WHERE state != 'idle' AND pid != pg_backend_pid();
  `);
  console.log('Active queries in PostgreSQL:');
  for (const r of res.rows) {
    console.log(`- PID ${r.pid} (${r.duration}): [${r.state}] wait=${r.wait_event_type}:${r.wait_event} | Query: ${r.query.slice(0, 100)}`);
  }
  await pool.end();
}

run();
