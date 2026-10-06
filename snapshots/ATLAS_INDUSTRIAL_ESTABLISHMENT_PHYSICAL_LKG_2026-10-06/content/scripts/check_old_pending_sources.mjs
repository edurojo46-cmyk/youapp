import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT 
    source_id,
    status,
    COUNT(*) as row_count
  FROM public.atlas_search_outbox
  WHERE status = ANY (ARRAY['PENDING'::text, 'RETRY'::text])
  GROUP BY source_id, status
  ORDER BY row_count DESC
`);
console.table(res.rows);

await client.end();
