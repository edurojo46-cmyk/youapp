import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function terminate() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  const procs = await client.query("SELECT pid FROM pg_stat_activity WHERE query ILIKE '%autovacuum%'");
  for (const row of procs.rows) {
    const res = await client.query('SELECT pg_terminate_backend($1)', [row.pid]);
    console.log(`Terminated autovacuum PID ${row.pid}:`, res.rows[0]);
  }
  await client.release();
  await pool.end();
}
terminate().catch(console.error);
