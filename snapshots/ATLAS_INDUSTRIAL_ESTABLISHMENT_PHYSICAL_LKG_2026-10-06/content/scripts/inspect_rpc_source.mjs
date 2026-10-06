import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT proname, prosrc 
  FROM pg_proc 
  WHERE proname = 'process_search_outbox_batch';
`);
console.log('--- RPC SOURCE: process_search_outbox_batch ---');
console.log(res.rows[0]?.prosrc);

await client.end();
