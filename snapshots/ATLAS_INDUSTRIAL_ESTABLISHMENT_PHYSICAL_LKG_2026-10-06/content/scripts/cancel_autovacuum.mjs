import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function cancel() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  const procs = await client.query("SELECT pid FROM pg_stat_activity WHERE query ILIKE '%autovacuum%'");
  for (const row of procs.rows) {
    const res = await client.query('SELECT pg_cancel_backend($1)', [row.pid]);
    console.log(`Cancelled autovacuum PID ${row.pid}:`, res.rows[0]);
  }
  await client.release();
  await pool.end();
}
cancel().catch(console.error);
