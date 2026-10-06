import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT 
    date_trunc('hour', created_at) as hour_bucket,
    status,
    COUNT(*) as count
  FROM public.atlas_search_outbox
  WHERE status = ANY (ARRAY['PENDING'::text, 'RETRY'::text])
  GROUP BY 1, 2
  ORDER BY 1 DESC
  LIMIT 20
`);
console.table(res.rows);

await client.end();
