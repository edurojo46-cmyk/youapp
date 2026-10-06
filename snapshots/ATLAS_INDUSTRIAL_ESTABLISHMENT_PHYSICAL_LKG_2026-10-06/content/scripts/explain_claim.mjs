import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const pool = new pg.Pool(parseDbUrl());
const client = await pool.connect();

console.log('--- Plan 1: ORDER BY outbox_id ---');
let res = await client.query(`
  EXPLAIN
  SELECT outbox_id, payload FROM public.atlas_search_outbox
  WHERE status = 'PENDING'
  ORDER BY outbox_id ASC
  LIMIT 4000
  FOR UPDATE SKIP LOCKED
`);
console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));

console.log('\n--- Plan 2: ORDER BY next_retry_at, outbox_id ---');
res = await client.query(`
  EXPLAIN
  SELECT outbox_id, payload FROM public.atlas_search_outbox
  WHERE status = 'PENDING'
  ORDER BY next_retry_at ASC, outbox_id ASC
  LIMIT 4000
  FOR UPDATE SKIP LOCKED
`);
console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));

client.release();
await pool.end();
