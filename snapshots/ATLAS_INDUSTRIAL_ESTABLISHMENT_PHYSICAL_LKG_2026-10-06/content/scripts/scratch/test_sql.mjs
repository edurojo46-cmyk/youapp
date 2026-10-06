import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const c = new pg.Client(parseDbUrl());
await c.connect();

const qRes = await c.query(`
  SELECT 
    count(*) FILTER (WHERE status = 'PENDING') AS pending,
    count(*) FILTER (WHERE status = 'PROCESSING') AS processing,
    COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at) FILTER (WHERE status = 'PENDING'))), 0) AS oldest_pending_age_sec
  FROM public.atlas_search_outbox;
`);
console.log('Query result:', qRes.rows[0]);

await c.end();
