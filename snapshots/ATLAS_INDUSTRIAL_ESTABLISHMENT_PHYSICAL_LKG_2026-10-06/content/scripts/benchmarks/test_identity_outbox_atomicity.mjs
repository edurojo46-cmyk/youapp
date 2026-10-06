import pg from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/pg/lib/index.js';
import dotenv from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/dotenv/lib/main.js';
import fs from 'node:fs';
import path from 'node:path';
import { parseDbUrl } from 'file:///c:/Users/Eduardo/YOUAPP/scripts/export_search_projection_v2.mjs';

dotenv.config({ path: 'c:/Users/Eduardo/YOUAPP/.env' });

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('🔬 ATLAS V1.9 — IDENTITY + OUTBOX V2 ATOMICITY AUDIT & PROOF');
  console.log('================================================================\n');

  let identityCommittedWithoutOutbox = 0;
  let outboxEventWithoutIdentity = 0;

  try {
    // 0. Clean prior atomicity test fixtures
    await client.query("DELETE FROM public.atlas_search_outbox_v2 WHERE source_id LIKE 'ATOM_TEST_%';");
    await client.query("DELETE FROM public.atlas_hot_source_key_map WHERE source_id LIKE 'ATOM_TEST_%';");
    await client.query("DELETE FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac LIKE 'hmac_atom_%';");

    // Test Case 1: Valid Ingestion Commit
    console.log('1. Testing Valid Batch Ingestion (Happy Path Atomicity)...');
    const res1 = await client.query(`
      SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        ARRAY['ATOM_TEST_SRC1'],
        ARRAY['src_rec_001'],
        ARRAY['hmac_atom_001'],
        ARRAY['atlas_arg_per_atom_001'],
        ARRAY['NEW'],
        ARRAY['ev_atom_001'],
        ARRAY[NOW()],
        ARRAY[1]
      ) as result;
    `);
    console.log('   Result:', res1.rows[0].result);

    // Verify all 3 tables have the record
    const chk1_key = await client.query("SELECT count(*) as c FROM public.atlas_hot_source_key_map WHERE source_id = 'ATOM_TEST_SRC1';");
    const chk1_hmac = await client.query("SELECT count(*) as c FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac = 'hmac_atom_001';");
    const chk1_out = await client.query("SELECT count(*) as c FROM public.atlas_search_outbox_v2 WHERE source_id = 'ATOM_TEST_SRC1';");

    if (chk1_key.rows[0].c === '1' && chk1_hmac.rows[0].c === '1' && chk1_out.rows[0].c === '1') {
      console.log('   ✅ All 3 stores committed atomically in happy path.');
    } else {
      throw new Error(`Happy path atomicity violation: key=${chk1_key.rows[0].c}, hmac=${chk1_hmac.rows[0].c}, outbox=${chk1_out.rows[0].c}`);
    }

    // Test Case 2: Injected Error in Middle of Transaction (Rollback Atomicity)
    console.log('\n2. Testing Mid-Transaction Injected Failure (Outbox Failure after Identity Success)...');
    let caughtExpectedError = false;
    try {
      // Passing 2 person_ids but only 1 source_id causes PostgreSQL unnest() in step 3
      // to produce a row with source_id = NULL for the 2nd person, which violates NOT NULL in outbox_v2!
      await client.query(`
        SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
          ARRAY['ATOM_TEST_SRC2_FAIL'],                                     -- 1 element
          ARRAY['src_rec_002_a'],                                           -- 1 element
          ARRAY['hmac_atom_002_a'],                                         -- 1 element
          ARRAY['atlas_arg_per_atom_002_a', 'atlas_arg_per_atom_002_b'],   -- 2 elements!
          ARRAY['NEW', 'NEW'],                                              -- 2 elements
          ARRAY['ev_atom_002_a', 'ev_atom_002_b'],                         -- 2 elements
          ARRAY[NOW(), NOW()]                                               -- 2 elements
        );
      `);
    } catch (err) {
      caughtExpectedError = true;
      console.log('   Caught expected mid-RPC exception:', err.message);
    }

    if (!caughtExpectedError) {
      throw new Error('Expected exception was not thrown on invalid array lengths!');
    }

    // Verify NO state leaked into ANY of the 3 stores
    const chk2_key = await client.query("SELECT count(*) as c FROM public.atlas_hot_source_key_map WHERE source_id = 'ATOM_TEST_SRC2_FAIL';");
    const chk2_hmac = await client.query("SELECT count(*) as c FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac = 'hmac_atom_002';");
    const chk2_out = await client.query("SELECT count(*) as c FROM public.atlas_search_outbox_v2 WHERE source_id = 'ATOM_TEST_SRC2_FAIL';");

    console.log(`   Post-Failure Store Verification: key=${chk2_key.rows[0].c}, hmac=${chk2_hmac.rows[0].c}, outbox=${chk2_out.rows[0].c}`);
    if (chk2_key.rows[0].c === '0' && chk2_hmac.rows[0].c === '0' && chk2_out.rows[0].c === '0') {
      console.log('   ✅ Mid-RPC failure rolled back 100% of identity and outbox state.');
    } else {
      if (chk2_key.rows[0].c !== '0' || chk2_hmac.rows[0].c !== '0') identityCommittedWithoutOutbox++;
      if (chk2_out.rows[0].c !== '0') outboxEventWithoutIdentity++;
    }

    // Test Case 3: Explicit Client Transaction Abort (BEGIN -> RPC -> ROLLBACK)
    console.log('\n3. Testing Client Transaction Explicit ROLLBACK...');
    await client.query('BEGIN;');
    await client.query(`
      SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        ARRAY['ATOM_TEST_SRC3_ABORT'],
        ARRAY['src_rec_003'],
        ARRAY['hmac_atom_003'],
        ARRAY['atlas_arg_per_atom_003'],
        ARRAY['NEW'],
        ARRAY['ev_atom_003'],
        ARRAY[NOW()],
        ARRAY[1]
      );
    `);
    await client.query('ROLLBACK;');

    const chk3_key = await client.query("SELECT count(*) as c FROM public.atlas_hot_source_key_map WHERE source_id = 'ATOM_TEST_SRC3_ABORT';");
    const chk3_hmac = await client.query("SELECT count(*) as c FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac = 'hmac_atom_003';");
    const chk3_out = await client.query("SELECT count(*) as c FROM public.atlas_search_outbox_v2 WHERE source_id = 'ATOM_TEST_SRC3_ABORT';");

    console.log(`   Post-Rollback Store Verification: key=${chk3_key.rows[0].c}, hmac=${chk3_hmac.rows[0].c}, outbox=${chk3_out.rows[0].c}`);
    if (chk3_key.rows[0].c === '0' && chk3_hmac.rows[0].c === '0' && chk3_out.rows[0].c === '0') {
      console.log('   ✅ Client ROLLBACK safely rolled back all state atomically.');
    } else {
      if (chk3_key.rows[0].c !== '0' || chk3_hmac.rows[0].c !== '0') identityCommittedWithoutOutbox++;
      if (chk3_out.rows[0].c !== '0') outboxEventWithoutIdentity++;
    }

    // Test Case 4: Complete Database Audit Across Existing Outbox V2 Records
    console.log('\n4. Cross-Store Referential Integrity Audit for Outbox V2...');
    const orphanOutbox = await client.query(`
      SELECT count(*) as orphans
      FROM public.atlas_search_outbox_v2 o
      LEFT JOIN public.atlas_hot_source_key_map k 
        ON o.source_id = k.source_id AND o.source_person_id = k.source_person_id
      WHERE k.source_id IS NULL;
    `);
    outboxEventWithoutIdentity += parseInt(orphanOutbox.rows[0].orphans, 10);

    const ATOMICITY_PASS = (identityCommittedWithoutOutbox === 0 && outboxEventWithoutIdentity === 0);

    const resultReport = {
      TIMESTAMP: new Date().toISOString(),
      TESTS_EXECUTED: [
        'HAPPY_PATH_ALL_STORES_COMMITTED',
        'MID_RPC_FAILURE_TOTAL_ROLLBACK',
        'CLIENT_TRANSACTION_ROLLBACK',
        'CROSS_STORE_REFERENTIAL_INTEGRITY'
      ],
      IDENTITY_COMMITTED_WITHOUT_REQUIRED_OUTBOX_EVENT: identityCommittedWithoutOutbox,
      OUTBOX_EVENT_WITHOUT_VALID_CANONICAL_IDENTITY: outboxEventWithoutIdentity,
      IDENTITY_OUTBOX_ATOMICITY_PASS: ATOMICITY_PASS ? 'PASS' : 'FAIL'
    };

    console.log('\n================================================================');
    console.log('🏁 ATOMICITY AUDIT VERDICT:', resultReport.IDENTITY_OUTBOX_ATOMICITY_PASS);
    console.log(`IDENTITY_COMMITTED_WITHOUT_REQUIRED_OUTBOX_EVENT: ${identityCommittedWithoutOutbox}`);
    console.log(`OUTBOX_EVENT_WITHOUT_VALID_CANONICAL_IDENTITY  : ${outboxEventWithoutIdentity}`);
    console.log('================================================================\n');

    const outDir = path.resolve('reports/atlas/benchmarks');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'atlas_v19_identity_outbox_atomicity_report.json'),
      JSON.stringify(resultReport, null, 2)
    );

    // Cleanup fixtures
    await client.query("DELETE FROM public.atlas_search_outbox_v2 WHERE source_id LIKE 'ATOM_TEST_%';");
    await client.query("DELETE FROM public.atlas_hot_source_key_map WHERE source_id LIKE 'ATOM_TEST_%';");
    await client.query("DELETE FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac LIKE 'hmac_atom_%';");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
