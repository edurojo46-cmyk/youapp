import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Client } = pg;

async function main() {
  const c = new Client(parseDbUrl());
  await c.connect();
  const res = await c.query(`
    SELECT 
      (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PENDING' AND next_retry_at <= now()) as pending,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING') as processing,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE created_at >= now() - interval '15 minutes') as recent_total,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PUBLISHED' AND created_at >= now() - interval '15 minutes') as recent_published;
  `);
  console.log('Indexed status counts:', res.rows[0]);
  await c.end();
}

main().catch(console.error);
