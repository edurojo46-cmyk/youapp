import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function inspectRpc() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const fnRes = await client.query(`
    SELECT pg_get_functiondef(p.oid) as def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'process_search_outbox_batch' AND n.nspname = 'public';
  `);

  if (fnRes.rows[0]) {
    console.log('=== FUNCTION public.process_search_outbox_batch ===');
    console.log(fnRes.rows[0].def);
  } else {
    console.log('Function public.process_search_outbox_batch NOT found');
  }

  await client.end();
}

inspectRpc().catch(console.error);
