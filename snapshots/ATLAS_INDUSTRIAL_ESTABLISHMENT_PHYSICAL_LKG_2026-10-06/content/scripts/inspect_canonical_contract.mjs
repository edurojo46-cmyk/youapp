import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const sampleRes = await client.query(`
  SELECT atlas_person_id, source_id, source_person_id, identifier_type, identifier_value 
  FROM public.atlas_person_identity_map 
  LIMIT 10
`);
console.log('Sample identity map rows:');
sampleRes.rows.forEach(r => console.log(r));

const arcaSample = await client.query(`
  SELECT atlas_person_id, source_id, source_person_id, identifier_type, identifier_value 
  FROM public.atlas_person_identity_map 
  WHERE source_id = 'SURF_ARCA_RG1817' OR source_id = 'ARCA_PADRON_REDUCIDO'
  LIMIT 10
`);
console.log('\nSample ARCA identity map rows:');
arcaSample.rows.forEach(r => console.log(r));

await client.end();
