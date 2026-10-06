import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const oldMax = await client.query(`
  SELECT 
    COUNT(*) as total_v2,
    MIN(created_at) as min_v2,
    MAX(created_at) as max_v2
  FROM public.atlas_search_outbox_v2
`);
console.log('Outbox V2 stats:', oldMax.rows[0]);

const oldRecent = await client.query(`
  SELECT 
    status,
    COUNT(*),
    MIN(created_at),
    MAX(created_at)
  FROM public.atlas_search_outbox
  WHERE status IN ('PENDING', 'RETRY')
  GROUP BY status
`);
console.table(oldRecent.rows);

await client.end();
