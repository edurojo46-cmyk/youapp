import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Pool } = pg;

async function main() {
  const pool = new Pool({ ...parseDbUrl(), max: 1 });
  const res = await pool.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    WHERE p.proname = 'process_search_outbox_batch';
  `);
  console.log(res.rows[0].def);
  await pool.end();
}

main().catch(console.error);
