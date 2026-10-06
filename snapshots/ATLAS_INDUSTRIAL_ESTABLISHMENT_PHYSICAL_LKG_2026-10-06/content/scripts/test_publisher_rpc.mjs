import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('Testing process_search_outbox_batch with limit 5...');
console.time('process_search_outbox_batch');
try {
  const res = await client.query(`
    SELECT public.process_search_outbox_batch(5, 'test_worker_debug') as result;
  `);
  console.timeEnd('process_search_outbox_batch');
  console.log('Result:', res.rows[0].result);
} catch (e) {
  console.timeEnd('process_search_outbox_batch');
  console.error('Error:', e.message);
}

await client.end();
