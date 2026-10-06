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
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'atlas_search_outbox'
      ORDER BY ordinal_position;
    `);
    console.log('COLUMNS OF atlas_search_outbox:');
    console.table(cols.rows);

    // Let's sample 1 row to see actual data structure
    const sample = await client.query(`
      SELECT * FROM public.atlas_search_outbox LIMIT 1;
    `);
    console.log('SAMPLE ROW KEYS:', Object.keys(sample.rows[0]));
    console.log('SAMPLE ROW:', sample.rows[0]);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
