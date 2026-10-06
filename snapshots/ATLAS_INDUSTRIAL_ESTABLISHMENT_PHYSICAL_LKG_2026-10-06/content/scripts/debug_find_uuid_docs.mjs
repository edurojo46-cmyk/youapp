import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';
const testId = '3964d69b-ad84-4a11-847b-6573fe477304';

async function main() {
  // Fetch document from Meilisearch
  const res = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${testId}`);
  const doc = await res.json();
  console.log('Meili doc content:', doc);

  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const mapRes = await client.query('SELECT * FROM public.atlas_person_identity_map WHERE atlas_person_id = $1', [testId]);
  console.log('In identity map:', mapRes.rows);

  const outboxRes = await client.query('SELECT * FROM public.atlas_search_outbox WHERE atlas_person_id = $1', [testId]);
  console.log('In outbox:', outboxRes.rows);

  // Check how many documents in Meili have this UUID format vs 'atlas_arg_per_'
  const sampleDocsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?limit=100`);
  const sampleDocs = await sampleDocsRes.json();
  console.log('Sample 3 docs:', (sampleDocs.results || sampleDocs).slice(0, 3));

  await client.end();
}

main().catch(console.error);
