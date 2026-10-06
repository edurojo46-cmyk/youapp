import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const rV4 = await client.query(`
  SELECT pg_get_functiondef(oid) as def
  FROM pg_proc
  WHERE proname = 'commit_canonical_with_search_outbox_v4';
`);
console.log('=== FUNCTION commit_canonical_with_search_outbox_v4 ===');
console.log(rV4.rows[0]?.def || 'NOT FOUND');

const rV2 = await client.query(`
  SELECT pg_get_functiondef(oid) as def
  FROM pg_proc
  WHERE proname = 'commit_staged_batch_v2';
`);
console.log('\n=== FUNCTION commit_staged_batch_v2 ===');
console.log(rV2.rows[0]?.def || 'NOT FOUND');

await client.end();
