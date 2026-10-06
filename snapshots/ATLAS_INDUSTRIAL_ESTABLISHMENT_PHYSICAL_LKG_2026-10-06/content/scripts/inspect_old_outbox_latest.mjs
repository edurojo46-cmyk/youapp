import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT 
    outbox_id, status, created_at, source_id, source_record_id, last_error
  FROM public.atlas_search_outbox
  WHERE status = ANY (ARRAY['PENDING'::text, 'RETRY'::text, 'QUARANTINED'::text])
  ORDER BY created_at DESC
  LIMIT 5
`);
console.table(res.rows);

const resOldest = await client.query(`
  SELECT 
    outbox_id, status, created_at, source_id, source_record_id, last_error
  FROM public.atlas_search_outbox
  WHERE status = ANY (ARRAY['PENDING'::text, 'RETRY'::text, 'QUARANTINED'::text])
  ORDER BY created_at ASC
  LIMIT 5
`);
console.table(resOldest.rows);

await client.end();
