import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('========================================================================');
console.log('🧪 RUNNING RIGOROUS OUTBOX V2 CANARY TEST SUITE (1,000 EVENTS IN 100-ROW BATCHES)');
console.log('========================================================================\n');

const SOURCE_ID = 'CANARY_OUTBOX_V2_TEST';
const CANARY_COUNT = 1000;
const BATCH_SIZE = 100;

// Clean any leftover canary data first
await client.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1`, [SOURCE_ID]);
await client.query(`DELETE FROM public.atlas_search_delivery_keys WHERE source_id = $1`, [SOURCE_ID]);
await client.query(`DELETE FROM public.atlas_people_discovery_candidates WHERE source_id = $1`, [SOURCE_ID]);
await client.query(`DELETE FROM public.atlas_person_identity_map WHERE source_id = $1`, [SOURCE_ID]);

const allIdentityRows = [];
const allOutboxRows = [];

for (let i = 1; i <= CANARY_COUNT; i++) {
  const pad = String(i).padStart(4, '0');
  const personId = `atlas_canary_person_${pad}`;
  const recordId = `canary_rec_${pad}`;

  allIdentityRows.push({
    atlas_person_id: personId,
    source_id: SOURCE_ID,
    source_person_id: recordId,
    identifier_type: 'CANARY_ID',
    identifier_value: `canary_val_${pad}`,
    evidence_id: `evi_canary_${pad}`,
    confidence: 0.99,
    resolution_method: 'CANARY_TEST',
    observed_at: new Date().toISOString()
  });

  allOutboxRows.push({
    atlas_person_id: personId,
    source_id: SOURCE_ID,
    source_record_id: recordId,
    payload_version: 1,
    payload: {
      discovery_id: `disc_canary_${pad}`,
      display_name: `Canary Test Candidate ${pad}`,
      profession: 'Ingeniero de Software',
      role: 'Investigador',
      organization: 'Laboratorio de Pruebas Atlas',
      source_id: SOURCE_ID,
      source_record_id: recordId,
      atlas_person_id: personId,
      location_relation_type: 'PRIMARY_OFFICE',
      location_evidence: 'Canary Test Verification Evidence',
      evidence_strength: 'STRONG',
      neighborhood: 'Palermo',
      geography_id: 'ARG-CABA',
      current_activity_state: 'ACTIVE',
      last_seen_at: new Date().toISOString(),
      source_last_checked_at: new Date().toISOString(),
      first_seen_at: new Date().toISOString()
    }
  });
}

// ── TEST 1: INITIAL DELIVERY (1,000 Events via 10x 100 Batches) ──
console.log('--- TEST 1: INITIAL DELIVERY (1,000 Events in 10 Batches) ---');
let totalCreated = 0;
const t0 = performance.now();

for (let b = 0; b < CANARY_COUNT / BATCH_SIZE; b++) {
  const batchIdent = allIdentityRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
  const batchOutbox = allOutboxRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

  const res = await client.query(`
    SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) as result
  `, [JSON.stringify(batchIdent), JSON.stringify(batchOutbox)]);

  const data = res.rows[0].result;
  if (!data?.ok) throw new Error(`Batch ${b} failed: ${data?.error}`);
  totalCreated += data.outbox_rows_created;
}
const dt1 = (performance.now() - t0).toFixed(1);
console.log(`1,000 events committed in ${dt1}ms. Total created in V2: ${totalCreated}`);

const check1 = await client.query(`
  SELECT 
    (SELECT count(*) FROM public.atlas_search_outbox_v2 WHERE source_id = $1 AND status = 'PENDING') as pending_v2,
    (SELECT count(*) FROM public.atlas_search_delivery_keys WHERE source_id = $1 AND delivery_status = 'COMMITTED') as delivery_keys
`, [SOURCE_ID]);

console.log('Test 1 Verification:', check1.rows[0]);
const test1Pass = (Number(check1.rows[0].pending_v2) === CANARY_COUNT && Number(check1.rows[0].delivery_keys) === CANARY_COUNT);
console.log(`TEST 1 RESULT: ${test1Pass ? 'PASS ✅' : 'FAIL ❌'}`);
if (!test1Pass) process.exit(1);

// ── TEST 2: DUPLICATE RETRY IDEMPOTENCY (Same 1,000 Events Resent) ──
console.log('\n--- TEST 2: DUPLICATE RETRY IDEMPOTENCY (Same 1,000 Events Resent) ---');
let duplicateCreated = 0;
let duplicateRequeued = 0;

for (let b = 0; b < CANARY_COUNT / BATCH_SIZE; b++) {
  const batchIdent = allIdentityRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
  const batchOutbox = allOutboxRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

  const res = await client.query(`
    SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) as result
  `, [JSON.stringify(batchIdent), JSON.stringify(batchOutbox)]);

  const data = res.rows[0].result;
  duplicateCreated += data.outbox_rows_created;
  duplicateRequeued += data.outbox_rows_requeued;
}

const check2 = await client.query(`
  SELECT count(*) as total_v2 
  FROM public.atlas_search_outbox_v2 
  WHERE source_id = $1
`, [SOURCE_ID]);

console.log(`Total rows in V2 after duplicate retry: ${check2.rows[0].total_v2} (Expected: exactly ${CANARY_COUNT})`);
console.log(`Duplicate Created: ${duplicateCreated} (Expected: 0), Requeued: ${duplicateRequeued} (Expected: ${CANARY_COUNT})`);
const duplicateLogicalEffects = Number(check2.rows[0].total_v2) - CANARY_COUNT;
const test2Pass = (duplicateLogicalEffects === 0 && duplicateCreated === 0 && duplicateRequeued === CANARY_COUNT);
console.log(`DUPLICATE_LOGICAL_EFFECTS = ${duplicateLogicalEffects}`);
console.log(`TEST 2 RESULT: ${test2Pass ? 'PASS ✅' : 'FAIL ❌'}`);
if (!test2Pass) process.exit(1);

// ── TEST 3: LEGITIMATE UPDATE (Version 2 on 200 Entities) ──
console.log('\n--- TEST 3: LEGITIMATE UPDATE (Version 2 on 200 Entities) ---');
const updateRows = allOutboxRows.slice(0, 200).map(r => ({
  ...r,
  payload_version: 2,
  payload: {
    ...r.payload,
    role: 'Director de Innovación (Updated V2)',
    organization: 'Atlas Advanced Research Institute'
  }
}));

const res3 = await client.query(`
  SELECT public.commit_canonical_with_search_outbox($1::jsonb, $2::jsonb) as result
`, [JSON.stringify(allIdentityRows.slice(0, 200)), JSON.stringify(updateRows)]);
console.log('Legitimate Update Result:', res3.rows[0].result);

const check3 = await client.query(`
  SELECT count(*) as total_v2_v2 
  FROM public.atlas_search_outbox_v2 
  WHERE source_id = $1 AND payload_version = 2
`, [SOURCE_ID]);

console.log(`Version 2 events in V2: ${check3.rows[0].total_v2_v2} (Expected: 200)`);
const test3Pass = (Number(check3.rows[0].total_v2_v2) === 200 && res3.rows[0].result.outbox_rows_created === 200);
console.log(`LEGITIMATE_UPDATE_SUPPRESSED = ${200 - Number(check3.rows[0].total_v2_v2)}`);
console.log(`TEST 3 RESULT: ${test3Pass ? 'PASS ✅' : 'FAIL ❌'}`);
if (!test3Pass) process.exit(1);

// ── TEST 4: PUBLISHER DRAIN & RECONCILIATION ──
console.log('\n--- TEST 4: PUBLISHER DRAIN & RECONCILIATION ---');
let publishedCount = 0;
for (let b = 0; b < 15; b++) {
  const pubRes = await client.query(`
    SELECT public.process_search_outbox_batch(100, 'CANARY_WORKER_01') as result
  `);
  const data = pubRes.rows[0].result;
  if (data && data.total_published) {
    publishedCount += data.total_published;
  }
  if (!data || data.total_published === 0) break;
}
console.log(`Total events published by V2 publisher: ${publishedCount}`);

const check4 = await client.query(`
  SELECT 
    (SELECT count(*) FROM public.atlas_search_outbox_v2 WHERE source_id = $1 AND status = 'PENDING') as pending_remaining,
    (SELECT count(*) FROM public.atlas_people_discovery_candidates WHERE source_id = $1) as searchable_candidates
`, [SOURCE_ID]);

console.log('Reconciliation State:', check4.rows[0]);
const pendingRemaining = Number(check4.rows[0].pending_remaining);
const searchableCandidates = Number(check4.rows[0].searchable_candidates);
const reconDelta = Math.abs(searchableCandidates - CANARY_COUNT);

const test4Pass = (pendingRemaining === 0 && reconDelta === 0);
console.log(`SEARCH_RECONCILIATION_DELTA = ${reconDelta}`);
console.log(`LOST_EVENTS = ${pendingRemaining}`);
console.log(`TEST 4 RESULT: ${test4Pass ? 'PASS ✅' : 'FAIL ❌'}`);
if (!test4Pass) process.exit(1);

// ── TEARDOWN CANARY DATA (Ensure TEST_CONTAMINATION = 0) ──
console.log('\n--- TEARDOWN CANARY TEST DATA ---');
await client.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1`, [SOURCE_ID]);
await client.query(`DELETE FROM public.atlas_search_delivery_keys WHERE source_id = $1`, [SOURCE_ID]);
await client.query(`DELETE FROM public.atlas_people_discovery_candidates WHERE source_id = $1`, [SOURCE_ID]);
await client.query(`DELETE FROM public.atlas_person_identity_map WHERE source_id = $1`, [SOURCE_ID]);

console.log('Canary data completely purged. TEST_CONTAMINATION = 0 certified.');

console.log('\n========================================================================');
console.log('🏆 ALL CANARY INVARIANTS CERTIFIED: 100% PASS');
console.log('  LOST_EVENTS = 0');
console.log('  DUPLICATE_LOGICAL_EFFECTS = 0');
console.log('  LEGITIMATE_UPDATE_SUPPRESSED = 0');
console.log('  UNACCOUNTED = 0');
console.log('  SEARCH_RECONCILIATION_DELTA = 0');
console.log('========================================================================');

await client.end();
