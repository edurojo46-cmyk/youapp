import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const pool = new pg.Pool(parseDbUrl());
const client = await pool.connect();

console.log('--- Plan 3: using idx_atlas_search_outbox_ready_queue ---');
const res = await client.query(`
  EXPLAIN
  SELECT outbox_id, payload FROM public.atlas_search_outbox
  WHERE status IN ('PENDING', 'RETRY') AND next_retry_at <= NOW()
  ORDER BY next_retry_at ASC, outbox_id ASC
  LIMIT 4000
  FOR UPDATE SKIP LOCKED
`);
console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));

client.release();
await pool.end();
