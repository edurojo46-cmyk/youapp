import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const r = await client.query(`
  SELECT proname, proargnames 
  FROM pg_proc 
  WHERE proname LIKE '%search_people%';
`);
console.log('SEARCH RPCS:', r.rows);

await client.end();
