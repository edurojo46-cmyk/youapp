import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';
const TEST_PID = 'atlas_arg_per_test123';
const TEST_SOURCE_PID = '20123456789';
const TEST_OUTBOX_RECORD = 'rec_arca_20123456789';

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== REMEDIATING TEST CONTAMINATION (atlas_arg_per_test123) ===\n');

// 1. PRE-REMEDIATION STATE
const preMap = await client.query('SELECT count(*) AS total_rows, count(DISTINCT atlas_person_id) AS distinct_canonical FROM public.atlas_person_identity_map');
const preOutbox = await client.query('SELECT count(*) AS total_rows FROM public.atlas_search_outbox');
console.log('PRE STATE:', {
  canonical_distinct: preMap.rows[0].distinct_canonical,
  identity_map_rows: preMap.rows[0].total_rows,
  search_outbox_total: preOutbox.rows[0].total_rows
});

// 2. ATOMIC TRANSACTION DELETE
await client.query('BEGIN');

const delOutbox = await client.query(`
  DELETE FROM public.atlas_search_outbox 
  WHERE atlas_person_id = $1 AND source_record_id = $2
  RETURNING outbox_id
`, [TEST_PID, TEST_OUTBOX_RECORD]);
console.log('Deleted outbox rows:', delOutbox.rowCount);

const delMap = await client.query(`
  DELETE FROM public.atlas_person_identity_map 
  WHERE atlas_person_id = $1 AND source_person_id = $2
  RETURNING id
`, [TEST_PID, TEST_SOURCE_PID]);
console.log('Deleted identity map rows:', delMap.rowCount);

if (delOutbox.rowCount !== 1 || delMap.rowCount !== 1) {
  await client.query('ROLLBACK');
  throw new Error(`UNEXPECTED_DELETE_COUNT: outbox=${delOutbox.rowCount}, map=${delMap.rowCount}`);
}

await client.query('COMMIT');
console.log('✔ Transaction committed successfully.');

// 3. DELETE FROM MEILISEARCH DELTA INDEX
const meiliDelRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${TEST_PID}`, {
  method: 'DELETE'
});
const meiliDelData = await meiliDelRes.json();
console.log('Meilisearch document delete task enqueued:', meiliDelData);

// Wait for task
while (true) {
  const tRes = await fetch(`${MEILI_URL}/tasks/${meiliDelData.taskUid}`);
  const t = await tRes.json();
  if (t.status === 'succeeded') break;
  await new Promise(r => setTimeout(r, 40));
}
console.log('✔ Meilisearch document deleted.');

// 4. POST-REMEDIATION VERIFICATION
const postMap = await client.query('SELECT count(*) AS total_rows, count(DISTINCT atlas_person_id) AS distinct_canonical FROM public.atlas_person_identity_map');
const postOutbox = await client.query('SELECT count(*) AS total_rows, count(*) FILTER (WHERE status = \'PENDING\') AS pending, count(*) FILTER (WHERE status = \'PROCESSING\') AS processing, count(*) FILTER (WHERE status = \'PUBLISHED\') AS published, count(*) FILTER (WHERE status = \'QUARANTINED\') AS quarantined FROM public.atlas_search_outbox');

const postState = {
  canonical_distinct: parseInt(postMap.rows[0].distinct_canonical, 10),
  identity_map_rows: parseInt(postMap.rows[0].total_rows, 10),
  search_outbox_total: parseInt(postOutbox.rows[0].total_rows, 10),
  pending: parseInt(postOutbox.rows[0].pending, 10),
  processing: parseInt(postOutbox.rows[0].processing, 10),
  published: parseInt(postOutbox.rows[0].published, 10),
  quarantined: parseInt(postOutbox.rows[0].quarantined, 10)
};

console.log('\nPOST-REMEDIATION STATE:', postState);

const decCanonical = parseInt(preMap.rows[0].distinct_canonical, 10) - postState.canonical_distinct;
const decMap = parseInt(preMap.rows[0].total_rows, 10) - postState.identity_map_rows;
const decOutbox = parseInt(preOutbox.rows[0].total_rows, 10) - postState.search_outbox_total;

console.log('--- VERIFICATION DELTAS ---');
console.log(`Canonical Decreased:    ${decCanonical} (Expected: 1) -> Match: ${decCanonical === 1}`);
console.log(`Identity Map Decreased: ${decMap} (Expected: 1) -> Match: ${decMap === 1}`);
console.log(`Outbox Decreased:       ${decOutbox} (Expected: 1) -> Match: ${decOutbox === 1}`);

if (decCanonical !== 1 || decMap !== 1 || decOutbox !== 1) {
  throw new Error('REMEDIATION_DELTA_MISMATCH');
}

await client.end();
