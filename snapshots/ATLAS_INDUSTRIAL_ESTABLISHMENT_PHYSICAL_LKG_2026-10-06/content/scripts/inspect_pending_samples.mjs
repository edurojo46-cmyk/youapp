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
    const oSample = await client.query(`
      SELECT outbox_id, atlas_person_id, source_id, source_record_id, status, payload
      FROM public.atlas_search_outbox
      WHERE source_id = 'OPENALEX_ROR_UBA' AND status = 'PENDING'
      LIMIT 2;
    `);
    console.log('OPENALEX SAMPLE:', JSON.stringify(oSample.rows, null, 2));

    const wSample = await client.query(`
      SELECT outbox_id, atlas_person_id, source_id, source_record_id, status, payload
      FROM public.atlas_search_outbox
      WHERE source_id = 'WIKIDATA_SPARQL_CABA' AND status = 'PENDING'
      LIMIT 2;
    `);
    console.log('\nWIKIDATA SAMPLE:', JSON.stringify(wSample.rows, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
