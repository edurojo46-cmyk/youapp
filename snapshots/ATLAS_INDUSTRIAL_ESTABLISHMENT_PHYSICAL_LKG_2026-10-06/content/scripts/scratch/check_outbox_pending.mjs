import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  const res = await client.query("SELECT count(outbox_id) FROM public.atlas_search_outbox WHERE status = 'PENDING'");
  console.log('ELIGIBLE_PENDING_COUNT:', res.rows[0].count);
  client.release();
  await pool.end();
}

main().catch(console.error);
