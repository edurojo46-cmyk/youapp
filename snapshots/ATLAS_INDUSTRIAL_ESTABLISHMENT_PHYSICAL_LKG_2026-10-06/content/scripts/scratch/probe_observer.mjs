import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const res = await pool.query(`
    SELECT wait_event_type, wait_event, state, count(*) as count
    FROM pg_stat_activity
    WHERE pid != pg_backend_pid()
    GROUP BY wait_event_type, wait_event, state;
  `);
  console.log('pg_stat_activity summary:');
  console.table(res.rows);
  await pool.end();
}

main().catch(console.error);
