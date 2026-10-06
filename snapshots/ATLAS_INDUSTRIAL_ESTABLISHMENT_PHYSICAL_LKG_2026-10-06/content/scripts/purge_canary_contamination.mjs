import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const SOURCE_ID = 'CANARY_OUTBOX_V2_TEST';

console.log('=== PURGING CANARY TEST CONTAMINATION ===');

const delV2 = await client.query('DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1', [SOURCE_ID]);
console.log(`Deleted from atlas_search_outbox_v2: ${delV2.rowCount}`);

const delKeys = await client.query('DELETE FROM public.atlas_search_delivery_keys WHERE source_id = $1', [SOURCE_ID]);
console.log(`Deleted from atlas_search_delivery_keys: ${delKeys.rowCount}`);

const delCand = await client.query('DELETE FROM public.atlas_people_discovery_candidates WHERE source_id = $1', [SOURCE_ID]);
console.log(`Deleted from atlas_people_discovery_candidates: ${delCand.rowCount}`);

const delIdent = await client.query('DELETE FROM public.atlas_person_identity_map WHERE source_id = $1', [SOURCE_ID]);
console.log(`Deleted from atlas_person_identity_map: ${delIdent.rowCount}`);

// Verify 0 remains
const checkV2 = await client.query('SELECT count(*) FROM public.atlas_search_outbox_v2 WHERE source_id = $1', [SOURCE_ID]);
const checkKeys = await client.query('SELECT count(*) FROM public.atlas_search_delivery_keys WHERE source_id = $1', [SOURCE_ID]);
const checkCand = await client.query('SELECT count(*) FROM public.atlas_people_discovery_candidates WHERE source_id = $1', [SOURCE_ID]);
const checkIdent = await client.query('SELECT count(*) FROM public.atlas_person_identity_map WHERE source_id = $1', [SOURCE_ID]);

const remaining = 
  parseInt(checkV2.rows[0].count, 10) +
  parseInt(checkKeys.rows[0].count, 10) +
  parseInt(checkCand.rows[0].count, 10) +
  parseInt(checkIdent.rows[0].count, 10);

console.log('\n--- PURGE VERIFICATION ---');
console.log(`REMAINING TEST CONTAMINATION: ${remaining}`);
console.log(`TEST_CONTAMINATION_STATUS = ${remaining === 0 ? '0 (PASS ✅)' : 'FAIL ❌'}`);

await client.end();
