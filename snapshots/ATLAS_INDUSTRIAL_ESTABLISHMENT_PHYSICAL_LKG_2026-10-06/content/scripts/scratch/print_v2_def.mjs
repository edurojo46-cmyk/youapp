import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

async function main() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_functiondef(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'resolve_and_commit_candidate_batch_v2';
    `);
    const def = res.rows[0]?.pg_get_functiondef;
    console.log('FUNCTION DEF LENGTH:', def.length);
    const tempTables = def.match(/CREATE TEMP TABLE [a-zA-Z0-9_]+/g);
    console.log('Temp tables in V2:', tempTables);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
