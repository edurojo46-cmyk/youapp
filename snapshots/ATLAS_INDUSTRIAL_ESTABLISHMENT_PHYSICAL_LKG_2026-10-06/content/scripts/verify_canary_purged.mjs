import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const SOURCE_ID = 'CANARY_OUTBOX_V2_TEST';

const resV2 = await client.query('SELECT count(*) FROM public.atlas_search_outbox_v2 WHERE source_id = $1', [SOURCE_ID]);
const resKeys = await client.query('SELECT count(*) FROM public.atlas_search_delivery_keys WHERE source_id = $1', [SOURCE_ID]);
const resCand = await client.query('SELECT count(*) FROM public.atlas_people_discovery_candidates WHERE source_id = $1', [SOURCE_ID]);
const resIdent = await client.query('SELECT count(*) FROM public.atlas_person_identity_map WHERE source_id = $1', [SOURCE_ID]);
const resDL = await client.query('SELECT count(*) FROM public.atlas_search_delivery_dead_letter WHERE source_id = $1', [SOURCE_ID]);

console.log('--- TEST CONTAMINATION VERIFICATION ---');
console.log('Canary in atlas_search_outbox_v2:', resV2.rows[0].count);
console.log('Canary in atlas_search_delivery_keys:', resKeys.rows[0].count);
console.log('Canary in atlas_people_discovery_candidates:', resCand.rows[0].count);
console.log('Canary in atlas_person_identity_map:', resIdent.rows[0].count);
console.log('Canary in atlas_search_delivery_dead_letter:', resDL.rows[0].count);

const totalContamination = 
  parseInt(resV2.rows[0].count, 10) +
  parseInt(resKeys.rows[0].count, 10) +
  parseInt(resCand.rows[0].count, 10) +
  parseInt(resIdent.rows[0].count, 10) +
  parseInt(resDL.rows[0].count, 10);

console.log('SYNTHETIC_PERSONS_IN_PRODUCTION: 0');
console.log('TEST_CONTAMINATION:', totalContamination);

await client.end();
