import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const exp1 = await client.query(`
  EXPLAIN ANALYZE
  SELECT created_at, outbox_id 
  FROM public.atlas_search_outbox_v2
  WHERE status IN ('PENDING', 'RETRY')
    AND next_retry_at <= now()
  ORDER BY next_retry_at ASC, outbox_id ASC
  LIMIT 100
  FOR UPDATE SKIP LOCKED
`);
console.log('--- EXPLAIN WITHOUT CREATED_AT FILTER ---');
for (const r of exp1.rows) console.log(r['QUERY PLAN']);

const exp2 = await client.query(`
  EXPLAIN ANALYZE
  SELECT created_at, outbox_id 
  FROM public.atlas_search_outbox_v2
  WHERE created_at >= CURRENT_DATE - 1
    AND status IN ('PENDING', 'RETRY')
    AND next_retry_at <= now()
  ORDER BY next_retry_at ASC, outbox_id ASC
  LIMIT 100
  FOR UPDATE SKIP LOCKED
`);
console.log('\n--- EXPLAIN WITH PARTITION PRUNING (created_at >= CURRENT_DATE - 1) ---');
for (const r of exp2.rows) console.log(r['QUERY PLAN']);

await client.end();
