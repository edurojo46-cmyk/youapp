import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

async function main() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const res = await client.query('SELECT public.reclaim_stale_search_outbox_leases(120) as result;');
    console.log('RECLAIM RESULT:', res.rows[0].result);
    const outboxDist = await client.query('SELECT status, count(*) FROM public.atlas_search_outbox GROUP BY status ORDER BY count DESC;');
    console.log('NEW OUTBOX DIST:', outboxDist.rows);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
