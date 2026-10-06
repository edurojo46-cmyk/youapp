import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

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
      WHERE n.nspname = 'public' AND p.proname = 'commit_canonical_with_search_outbox';
    `);
    console.log('FUNCTION DEF:');
    console.log(res.rows[0]?.pg_get_functiondef);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
