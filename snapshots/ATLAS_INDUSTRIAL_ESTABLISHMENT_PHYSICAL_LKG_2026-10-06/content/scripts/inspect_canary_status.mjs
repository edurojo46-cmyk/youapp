import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== INSPECT CANARY STATUS ===');
const v2Res = await client.query(`
  SELECT status, count(*) 
  FROM public.atlas_search_outbox_v2 
  WHERE source_id = 'CANARY_OUTBOX_V2_TEST'
  GROUP BY status;
`);
console.table(v2Res.rows);

const candRes = await client.query(`
  SELECT count(*) 
  FROM public.atlas_people_discovery_candidates 
  WHERE source_id = 'CANARY_OUTBOX_V2_TEST';
`);
console.log('Published canary rows in candidates table:', candRes.rows[0].count);

await client.end();
