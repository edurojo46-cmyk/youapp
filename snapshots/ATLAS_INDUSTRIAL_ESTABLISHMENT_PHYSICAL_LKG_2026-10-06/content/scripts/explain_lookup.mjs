import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const sampleIds = Array.from({ length: 1000 }, (_, i) => `mock_hmac_${i}`);
const explainRes = await client.query(`
  EXPLAIN ANALYZE
  SELECT identifier_value, atlas_person_id
  FROM public.atlas_person_identity_map
  WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
    AND identifier_value = ANY($1::text[])
`, [sampleIds]);

console.log('--- EXPLAIN ANALYZE ON 1,000 ANY() LOOKUP ---');
explainRes.rows.forEach(r => console.log(r['QUERY PLAN']));

await client.end();
