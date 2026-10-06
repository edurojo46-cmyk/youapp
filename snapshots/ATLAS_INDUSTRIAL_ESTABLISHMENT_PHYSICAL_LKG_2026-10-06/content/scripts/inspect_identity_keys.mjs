import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const r = await client.query(`
  SELECT table_schema, table_name 
  FROM information_schema.tables 
  WHERE table_name LIKE '%ident%' OR table_name LIKE '%canonical%';
`);
console.log('Tables:', r.rows);

await client.end();
