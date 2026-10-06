import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  await pool.query("ALTER FUNCTION public.process_search_outbox_batch(integer, text) SET statement_timeout = '60s';");
  console.log('ALTER FUNCTION process_search_outbox_batch set statement_timeout = 60s');
  await pool.end();
}

run().catch(console.error);
