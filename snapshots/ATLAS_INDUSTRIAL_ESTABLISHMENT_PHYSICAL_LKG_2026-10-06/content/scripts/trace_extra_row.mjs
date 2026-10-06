import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- SEARCHING FOR TEST CONTAMINATION RECORD ---');

const testMap = await client.query(`
  SELECT id, atlas_person_id, source_id, source_person_id, identifier_type, observed_at
  FROM public.atlas_person_identity_map 
  WHERE atlas_person_id = 'atlas_arg_per_test123' OR source_person_id = '20123456789'
`);
console.log('Identity Map Test Rows:', testMap.rows);

const testOutbox = await client.query(`
  SELECT outbox_id, atlas_person_id, source_id, source_record_id, status, created_at, published_at
  FROM public.atlas_search_outbox 
  WHERE atlas_person_id = 'atlas_arg_per_test123' OR source_record_id = 'rec_arca_20123456789'
`);
console.log('Outbox Test Rows:', testOutbox.rows);

// Check if any other records exist for this person or if any foreign keys reference them
if (testMap.rows.length > 0) {
  const pid = testMap.rows[0].atlas_person_id;
  const otherMaps = await client.query(`
    SELECT count(*) FROM public.atlas_person_identity_map WHERE atlas_person_id = $1 AND id != $2
  `, [pid, testMap.rows[0].id]);
  console.log('Other mappings pointing to this atlas_person_id:', otherMaps.rows[0].count);
}

await client.end();
