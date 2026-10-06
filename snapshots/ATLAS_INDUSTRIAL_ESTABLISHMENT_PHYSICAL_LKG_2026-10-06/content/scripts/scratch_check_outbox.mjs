import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT status, count(*) 
  FROM atlas_search_outbox 
  GROUP BY status;
`);
console.table(res.rows);

await client.end();
