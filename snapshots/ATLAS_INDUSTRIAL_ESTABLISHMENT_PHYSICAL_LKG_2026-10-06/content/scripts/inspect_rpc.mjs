import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const funcRes = await client.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'commit_canonical_with_search_outbox'");
if (funcRes.rows.length > 0) {
  console.log('--- commit_canonical_with_search_outbox DEF ---');
  console.log(funcRes.rows[0].pg_get_functiondef);
} else {
  console.log('Function commit_canonical_with_search_outbox not found');
}
await client.end();
