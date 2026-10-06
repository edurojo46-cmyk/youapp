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
    const sSample = await client.query(`
      SELECT outbox_id, atlas_person_id, source_id, source_record_id, status, processing_worker_id, processing_started_at, payload
      FROM public.atlas_search_outbox
      WHERE status = 'PROCESSING'
      LIMIT 3;
    `);
    console.log('STALE PROCESSING SAMPLE:', JSON.stringify(sSample.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
