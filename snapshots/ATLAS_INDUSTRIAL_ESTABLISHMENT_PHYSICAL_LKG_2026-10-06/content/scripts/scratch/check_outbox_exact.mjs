import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  const res = await client.query(`
    SELECT status, count(outbox_id) as cnt
    FROM public.atlas_search_outbox
    GROUP BY status
  `);
  console.table(res.rows);

  client.release();
  await pool.end();
}

main().catch(console.error);
