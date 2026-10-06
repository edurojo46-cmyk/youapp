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
      SELECT conname, contype, pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conrelid = 'public.atlas_search_outbox'::regclass;
    `);
    console.log('CONSTRAINTS:', res.rows);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
