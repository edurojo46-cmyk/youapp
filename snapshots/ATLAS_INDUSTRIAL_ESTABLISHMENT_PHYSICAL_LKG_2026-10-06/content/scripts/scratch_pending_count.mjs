import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT count(*) 
  FROM atlas_search_outbox 
  WHERE status IN ('PENDING', 'RETRY');
`);
console.log('Pending / Retry outbox count:', res.rows[0].count);

await client.end();
