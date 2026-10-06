import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT proname, prosrc 
  FROM pg_proc 
  WHERE proname = 'commit_canonical_with_search_outbox';
`);
console.log('--- RPC SOURCE: commit_canonical_with_search_outbox ---');
console.log(res.rows[0]?.prosrc);

await client.end();
