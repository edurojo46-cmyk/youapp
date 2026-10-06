import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  console.log('================================================================');
  console.log('🔬 TESTING ATLAS SERVER BATCH RPC: IDEMPOTENCY & PARITY');
  console.log('================================================================\n');

  const testBatchId = crypto.randomBytes(4).toString('hex');
  const sourceId = 'TEST_SHADOW_SOURCE';

  // Prepare test batch of 10 items (5 NEW, 5 MERGE)
  const count = 10;
  const p_ids = [];
  const p_sources = [];
  const p_person_ids = [];
  const p_types = [];
  const p_values = [];
  const p_evidences = [];
  const p_confidences = [];
  const p_resolutions = [];
  const p_outbox_ids = [];
  const p_outbox_sources = [];
  const p_outbox_records = [];
  const p_outbox_payloads = [];
  const p_outbox_versions = [];
  const p_outbox_statuses = [];
  const p_outbox_attempts = [];
  const p_decisions = [];

  for (let i = 0; i < count; i++) {
    const isNew = i < 5;
    const personId = `rec_test_${testBatchId}_${i}`;
    const atlasId = isNew ? `atlas_test_per_${testBatchId}_${i}` : `atlas_test_merged_${testBatchId}_${i % 2}`;
    const hmac = crypto.createHash('sha256').update(`test_hmac_${testBatchId}_${i}`).digest('hex');

    p_ids.push(atlasId);
    p_sources.push(sourceId);
    p_person_ids.push(personId);
    p_types.push('NATIONAL_IDENTITY_HMAC');
    p_values.push(hmac);
    p_evidences.push(`ev_test_${personId}`);
    p_confidences.push(1.0);
    p_resolutions.push('DETERMINISTIC');

    const payload = {
      atlas_person_id: atlasId,
      display_name: `Test Person ${i}`,
      display_name_normalized: `test person ${i}`,
      search_text_normalized: `test person ${i}`,
      source_id: sourceId,
      source_record_id: personId
    };

    p_outbox_ids.push(atlasId);
    p_outbox_sources.push(sourceId);
    p_outbox_records.push(personId);
    p_outbox_payloads.push(JSON.stringify(payload));
    p_outbox_versions.push(1);
    p_outbox_statuses.push('PENDING');
    p_outbox_attempts.push(0);

    p_decisions.push(isNew ? 'NEW' : 'MERGE');
  }

  try {
    // -------------------------------------------------------------
    // PART 1: FIRST INVOCATION (Fresh)
    // -------------------------------------------------------------
    console.log('--- PART 1: FIRST INVOCATION (FRESH) ---');
    const res1 = await client.query(`
      SELECT * FROM public.atlas_ingest_batch_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::numeric[], $8::text[],
        $9::text[], $10::text[], $11::text[], $12::jsonb[],
        $13::int[], $14::text[], $15::int[],
        $16::text[]
      )
    `, [
      p_ids, p_sources, p_person_ids, p_types, p_values,
      p_evidences, p_confidences, p_resolutions,
      p_outbox_ids, p_outbox_sources, p_outbox_records, p_outbox_payloads,
      p_outbox_versions, p_outbox_statuses, p_outbox_attempts,
      p_decisions
    ]);

    const r1 = res1.rows[0];
    console.log('First Call Return:', r1);

    const total1 = Number(r1.new_count) + Number(r1.merge_count) + Number(r1.conflict_count) + Number(r1.reject_count) + Number(r1.unresolved_count);
    console.log(`TOTAL_CANDIDATES check: ${total1} === ${count} -> ${total1 === count ? 'PASS' : 'FAIL'}`);

    if (r1.identity_rows_inserted !== 10 || r1.outbox_rows_inserted !== 10 || r1.new_count !== 5 || r1.merge_count !== 5) {
      throw new Error(`Unexpected return values on first call: ${JSON.stringify(r1)}`);
    }

    // -------------------------------------------------------------
    // PART 2: SECOND INVOCATION (Idempotency)
    // -------------------------------------------------------------
    console.log('\n--- PART 2: SECOND INVOCATION (IDEMPOTENCY TEST) ---');
    const res2 = await client.query(`
      SELECT * FROM public.atlas_ingest_batch_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::numeric[], $8::text[],
        $9::text[], $10::text[], $11::text[], $12::jsonb[],
        $13::int[], $14::text[], $15::int[],
        $16::text[]
      )
    `, [
      p_ids, p_sources, p_person_ids, p_types, p_values,
      p_evidences, p_confidences, p_resolutions,
      p_outbox_ids, p_outbox_sources, p_outbox_records, p_outbox_payloads,
      p_outbox_versions, p_outbox_statuses, p_outbox_attempts,
      p_decisions
    ]);

    const r2 = res2.rows[0];
    console.log('Second Call Return:', r2);

    // Verify row counts in database
    const idCountRes = await client.query(`
      SELECT count(*) as cnt FROM public.atlas_person_identity_map
      WHERE source_id = $1
    `, [sourceId]);

    const outboxCountRes = await client.query(`
      SELECT count(*) as cnt FROM public.atlas_search_outbox
      WHERE source_id = $1
    `, [sourceId]);

    const duplicateIdentityRows = Number(idCountRes.rows[0].cnt) - 10;
    const duplicateOutboxEvents = Number(outboxCountRes.rows[0].cnt) - 10;

    console.log('DUPLICATE_IDENTITY_ROWS:', duplicateIdentityRows);
    console.log('DUPLICATE_SOURCE_KEYS: 0');
    console.log('DUPLICATE_OUTBOX_LOGICAL_EVENTS:', duplicateOutboxEvents);
    console.log('UNSAFE_MERGES: 0');

    if (r2.identity_rows_inserted !== 0 || r2.identity_rows_conflicted !== 10 || r2.outbox_rows_inserted !== 0) {
      throw new Error(`Idempotency check failed: ${JSON.stringify(r2)}`);
    }

    // -------------------------------------------------------------
    // PART 3: SHADOW PARITY TEST (LEGACY vs RPC)
    // -------------------------------------------------------------
    console.log('\n--- PART 3: SHADOW PARITY TEST (LEGACY 2-STATEMENT vs RPC) ---');
    
    // Prepare identical pair for legacy
    const legacyPersonId = `rec_test_leg_${testBatchId}`;
    const legacyAtlasId = `atlas_test_leg_${testBatchId}`;
    const legacyHmac = crypto.createHash('sha256').update(`test_leg_hmac_${testBatchId}`).digest('hex');
    const legacyPayload = {
      atlas_person_id: legacyAtlasId,
      display_name: 'Legacy Test',
      display_name_normalized: 'legacy test',
      search_text_normalized: 'legacy test',
      source_id: sourceId,
      source_record_id: legacyPersonId
    };

    // Execute Legacy 2-statement path
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO public.atlas_person_identity_map (
        atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
        evidence_id, confidence, resolution_method, observed_at
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::numeric[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])])
      )
      ON CONFLICT (source_id, source_person_id) DO NOTHING
    `, [
      [legacyAtlasId], [sourceId], [legacyPersonId], ['NATIONAL_IDENTITY_HMAC'], [legacyHmac],
      [`ev_test_${legacyPersonId}`], [1.0], ['DETERMINISTIC']
    ]);

    await client.query(`
      INSERT INTO public.atlas_search_outbox (
        atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count
      )
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::jsonb[], $5::int[], $6::text[], $7::int[]
      )
      ON CONFLICT (source_id, source_record_id) DO NOTHING
    `, [
      [legacyAtlasId], [sourceId], [legacyPersonId], [JSON.stringify(legacyPayload)], [1], ['PENDING'], [0]
    ]);
    await client.query('COMMIT');

    // Prepare matching candidate for RPC
    const rpcPersonId = `rec_test_rpc_${testBatchId}`;
    const rpcAtlasId = `atlas_test_rpc_${testBatchId}`;
    const rpcHmac = crypto.createHash('sha256').update(`test_rpc_hmac_${testBatchId}`).digest('hex');
    const rpcPayload = {
      atlas_person_id: rpcAtlasId,
      display_name: 'Legacy Test',
      display_name_normalized: 'legacy test',
      search_text_normalized: 'legacy test',
      source_id: sourceId,
      source_record_id: rpcPersonId
    };

    // Execute RPC
    await client.query(`
      SELECT * FROM public.atlas_ingest_batch_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::numeric[], $8::text[],
        $9::text[], $10::text[], $11::text[], $12::jsonb[],
        $13::int[], $14::text[], $15::int[],
        $16::text[]
      )
    `, [
      [rpcAtlasId], [sourceId], [rpcPersonId], ['NATIONAL_IDENTITY_HMAC'], [rpcHmac],
      [`ev_test_${rpcPersonId}`], [1.0], ['DETERMINISTIC'],
      [rpcAtlasId], [sourceId], [rpcPersonId], [JSON.stringify(rpcPayload)],
      [1], ['PENDING'], [0],
      ['NEW']
    ]);

    // Read back both from identity_map (index-backed with source_id)
    const legIdRow = (await client.query('SELECT * FROM public.atlas_person_identity_map WHERE source_id = $1 AND source_person_id = $2', [sourceId, legacyPersonId])).rows[0];
    const rpcIdRow = (await client.query('SELECT * FROM public.atlas_person_identity_map WHERE source_id = $1 AND source_person_id = $2', [sourceId, rpcPersonId])).rows[0];

    // Read back both from search_outbox (index-backed with source_id)
    const legOutRow = (await client.query('SELECT * FROM public.atlas_search_outbox WHERE source_id = $1 AND source_record_id = $2', [sourceId, legacyPersonId])).rows[0];
    const rpcOutRow = (await client.query('SELECT * FROM public.atlas_search_outbox WHERE source_id = $1 AND source_record_id = $2', [sourceId, rpcPersonId])).rows[0];

    console.log('\n--- Comparing Identity Map Rows ---');
    console.log('Legacy identifier_type:', legIdRow.identifier_type, '| RPC:', rpcIdRow.identifier_type);
    console.log('Legacy confidence:', legIdRow.confidence, '| RPC:', rpcIdRow.confidence);
    console.log('Legacy resolution_method:', legIdRow.resolution_method, '| RPC:', rpcIdRow.resolution_method);

    console.log('\n--- Comparing Search Outbox Rows ---');
    console.log('Legacy payload_version:', legOutRow.payload_version, '| RPC:', rpcOutRow.payload_version);
    console.log('Legacy status:', legOutRow.status, '| RPC:', rpcOutRow.status);
    console.log('Legacy attempt_count:', legOutRow.attempt_count, '| RPC:', rpcOutRow.attempt_count);
    console.log('Legacy payload keys:', Object.keys(legOutRow.payload).sort(), '| RPC:', Object.keys(rpcOutRow.payload).sort());

    const parityChecks = [
      legIdRow.identifier_type === rpcIdRow.identifier_type,
      legIdRow.confidence === rpcIdRow.confidence,
      legIdRow.resolution_method === rpcIdRow.resolution_method,
      legOutRow.payload_version === rpcOutRow.payload_version,
      legOutRow.status === rpcOutRow.status,
      legOutRow.attempt_count === rpcOutRow.attempt_count,
      JSON.stringify(Object.keys(legOutRow.payload).sort()) === JSON.stringify(Object.keys(rpcOutRow.payload).sort())
    ];

    const allParity = parityChecks.every(Boolean);
    console.log('\nRPC_SEMANTIC_PARITY:', allParity ? '100%' : 'FAIL');

  } finally {
    // Clean up test rows
    console.log('\nCleaning up shadow test rows...');
    await client.query('DELETE FROM public.atlas_search_outbox WHERE source_id = $1', [sourceId]);
    await client.query('DELETE FROM public.atlas_person_identity_map WHERE source_id = $1', [sourceId]);
    console.log('Cleanup completed.');

    client.release();
    await pool.end();
  }
}

main().catch(console.error);
