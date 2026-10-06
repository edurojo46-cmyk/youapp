import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const res = await c.query(`
    SELECT pid, query, duration
    FROM (
      SELECT pid, query, now() - query_start as duration
      FROM pg_stat_activity
      WHERE state = 'active' AND pid <> pg_backend_pid()
    ) q
    WHERE duration > interval '15 seconds';
  `);
  console.log('Stuck queries > 15s:');
  console.table(res.rows);

  for (const r of res.rows) {
    if (!r.query.includes('commit_canonical')) {
      console.log('Terminating pid', r.pid);
      await c.query('SELECT pg_terminate_backend($1)', [r.pid]);
    }
  }

  await c.end();
}

main().catch(console.error);
