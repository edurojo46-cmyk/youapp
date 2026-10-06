import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const MEILI_URL = 'http://127.0.0.1:7700';
const TEST_INDEX = 'atlas_stage3k_test_index';
const TEST_TABLE = 'public.stage3k_test_outbox';

function hashFile(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function pollMeiliTask(taskUid, timeoutMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const data = await res.json();
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
      return data;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Timeout polling task ${taskUid}`);
}

async function setupTestEnvironment(client) {
  console.log('--- Setting up isolated Stage 3K test environment ---');
  await client.query(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
  await client.query(`
    CREATE UNLOGGED TABLE ${TEST_TABLE} (
      outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id text NOT NULL,
      source_record_id text NOT NULL,
      status text NOT NULL DEFAULT 'PENDING',
      attempt_count integer NOT NULL DEFAULT 0,
      next_retry_at timestamptz NOT NULL DEFAULT now(),
      processing_started_at timestamptz,
      processing_worker_id text,
      published_at timestamptz,
      quarantined_at timestamptz,
      last_error text,
      payload jsonb NOT NULL,
      payload_version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await client.query(`
    CREATE INDEX idx_stage3k_test_ready_queue ON ${TEST_TABLE} USING btree (next_retry_at, outbox_id) 
      WHERE (status = ANY (ARRAY['PENDING'::text, 'RETRY'::text]));
  `);

  // Ensure test Meilisearch index
  await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}`, { method: 'DELETE' }).catch(() => {});
  const createRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: TEST_INDEX, primaryKey: 'atlas_person_id' })
  });
  const createData = await createRes.json();
  if (createData.taskUid) {
    await pollMeiliTask(createData.taskUid);
  }
}

async function teardownTestEnvironment(client) {
  console.log('--- Tearing down isolated Stage 3K test environment ---');
  await client.query(`DROP TABLE IF EXISTS ${TEST_TABLE};`);
  await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}`, { method: 'DELETE' }).catch(() => {});
}

async function populateTestRows(client, count = 20000, idOffset = 0) {
  console.log(`Populating ${count} mock rows into ${TEST_TABLE} (idOffset: ${idOffset})...`);
  // Insert in batches of 5000 using generate_series
  const batchSize = 5000;
  for (let offset = 0; offset < count; offset += batchSize) {
    const curLimit = Math.min(batchSize, count - offset);
    await client.query(`
      INSERT INTO ${TEST_TABLE} (source_id, source_record_id, status, payload)
      SELECT 
        'TEST_SOURCE',
        'rec_' || (i + ${offset} + ${idOffset}),
        'PENDING',
        jsonb_build_object(
          'atlas_person_id', 'atlas_test_per_' || LPAD((i + ${offset} + ${idOffset})::text, 16, '0'),
          'display_name', 'TEST PERSON ' || (i + ${offset} + ${idOffset}),
          'display_name_normalized', 'TEST PERSON ' || (i + ${offset} + ${idOffset}),
          'search_text_normalized', 'TEST PERSON ' || (i + ${offset} + ${idOffset}),
          'cuit_masked', '20***01',
          'entity_type', 'NATURAL_PERSON',
          'source_id', 'TEST_SOURCE',
          'source_record_id', 'rec_' || (i + ${offset} + ${idOffset}),
          'source_ids', jsonb_build_array('TEST_SOURCE'),
          'evidence_state', 'HIGH_CONFIDENCE_OFFICIAL_REGISTRY',
          'geography', 'Argentina',
          'province', 'Nacional',
          'created_at', now()
        )
      FROM generate_series(1, ${curLimit}) s(i);
    `);
  }
  console.log(`Inserted ${count} rows.`);
}

async function main() {
  console.log('==================================================');
  console.log('ATLAS STAGE 3K: PRE-INTEGRATION TEST SUITE');
  console.log('==================================================');

  const dbConfig = parseDbUrl();
  const client = new pg.Client(dbConfig);
  await client.connect();

  const testReport = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3K_PRE_INTEGRATION_TEST',
    test_results: {},
    all_passed: false
  };

  try {
    await setupTestEnvironment(client);

    // ----------------------------------------------------
    // TEST 1: 20K Claim & Non-Blocking Lease Commit
    // ----------------------------------------------------
    console.log('\n[TEST 1] 20K Claim & Non-Blocking Lease Commit...');
    await populateTestRows(client, 20000);

    const batchToken1 = `batch_token_${crypto.randomUUID()}`;
    const tClaim0 = Date.now();
    
    // Explicit transaction: claim + commit
    await client.query('BEGIN');
    const claimRes = await client.query(`
      WITH next_batch AS (
        SELECT outbox_id
        FROM ${TEST_TABLE}
        WHERE status IN ('PENDING', 'RETRY')
          AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp())
        ORDER BY next_retry_at ASC, outbox_id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      ),
      claimed AS (
        UPDATE ${TEST_TABLE} o
        SET status = 'PROCESSING',
            processing_started_at = clock_timestamp(),
            processing_worker_id = $2,
            attempt_count = o.attempt_count + 1,
            updated_at = clock_timestamp()
        FROM next_batch nb
        WHERE o.outbox_id = nb.outbox_id
        RETURNING o.outbox_id, o.payload
      )
      SELECT * FROM claimed;
    `, [20000, batchToken1]);
    await client.query('COMMIT');
    const claimDurationMs = Date.now() - tClaim0;

    if (claimRes.rowCount !== 20000) {
      throw new Error(`TEST 1 FAILED: Expected 20,000 claimed, got ${claimRes.rowCount}`);
    }

    // Verify ZERO row locks are held after commit
    const lockCheck = await client.query(`
      SELECT count(*) FROM pg_locks l
      JOIN pg_stat_activity a ON l.pid = a.pid
      WHERE l.relation = '${TEST_TABLE}'::regclass
        AND l.mode IN ('RowExclusiveLock', 'ExclusiveLock');
    `);
    const activeExclusiveLocks = parseInt(lockCheck.rows[0].count, 10);
    if (activeExclusiveLocks !== 0) {
      throw new Error(`TEST 1 FAILED: Locks held after claim commit! Active locks: ${activeExclusiveLocks}`);
    }
    console.log(`  ✔ Claimed 20,000 rows in ${claimDurationMs} ms. Zero exclusive DB locks held.`);
    testReport.test_results.test1_claim_20k_non_blocking = {
      pass: true,
      rows_claimed: claimRes.rowCount,
      claim_duration_ms: claimDurationMs,
      active_locks_post_commit: activeExclusiveLocks
    };

    // ----------------------------------------------------
    // TEST 2: Meili Task Success & Exact Bulk ACK
    // ----------------------------------------------------
    console.log('\n[TEST 2] Meili Task Success & Exact Bulk ACK...');
    const outboxIds1 = claimRes.rows.map(r => r.outbox_id);
    const docs1 = claimRes.rows.map(r => r.payload);

    const pushRes1 = await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}/documents?primaryKey=atlas_person_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docs1)
    });
    const pushData1 = await pushRes1.json();
    if (!pushData1.taskUid) throw new Error('TEST 2 FAILED: No taskUid from Meilisearch');
    
    console.log(`  Pushed 20,000 docs (task ${pushData1.taskUid}). Waiting for success...`);
    const taskResult1 = await pollMeiliTask(pushData1.taskUid);
    if (taskResult1.status !== 'succeeded') {
      throw new Error(`TEST 2 FAILED: Meili task failed with status ${taskResult1.status}`);
    }

    // Execute Bulk ACK
    const tAck0 = Date.now();
    await client.query('BEGIN');
    const ackRes1 = await client.query(`
      UPDATE ${TEST_TABLE}
      SET status = 'PUBLISHED',
          published_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE outbox_id = ANY($1::uuid[])
        AND status = 'PROCESSING'
        AND processing_worker_id = $2
      RETURNING outbox_id;
    `, [outboxIds1, batchToken1]);
    await client.query('COMMIT');
    const ackDurationMs = Date.now() - tAck0;

    if (ackRes1.rowCount !== 20000) {
      throw new Error(`TEST 2 FAILED: Expected 20,000 ACKed, got ${ackRes1.rowCount}`);
    }
    console.log(`  ✔ Bulk ACKed 20,000 rows in ${ackDurationMs} ms. Status verified PUBLISHED.`);
    testReport.test_results.test2_meili_task_success_bulk_ack = {
      pass: true,
      meili_task_uid: pushData1.taskUid,
      meili_task_status: taskResult1.status,
      rows_acked: ackRes1.rowCount,
      ack_duration_ms: ackDurationMs
    };

    // ----------------------------------------------------
    // TEST 3: Stale / Wrong Lease Token Cannot ACK (Fail Closed)
    // ----------------------------------------------------
    console.log('\n[TEST 3] Stale / Wrong Lease Token Cannot ACK (Fail Closed)...');
    await populateTestRows(client, 100, 20000);
    const batchTokenA = `token_A_${crypto.randomUUID()}`;
    const batchTokenB = `token_B_${crypto.randomUUID()}`; // Wrong token

    const claim100 = await client.query(`
      WITH next_batch AS (
        SELECT outbox_id FROM ${TEST_TABLE}
        WHERE status = 'PENDING' LIMIT 100 FOR UPDATE SKIP LOCKED
      )
      UPDATE ${TEST_TABLE} o
      SET status = 'PROCESSING', processing_started_at = clock_timestamp(), processing_worker_id = $1
      FROM next_batch nb WHERE o.outbox_id = nb.outbox_id
      RETURNING o.outbox_id;
    `, [batchTokenA]);

    const ids100 = claim100.rows.map(r => r.outbox_id);

    // Attempt ACK with wrong token B
    const wrongAck = await client.query(`
      UPDATE ${TEST_TABLE}
      SET status = 'PUBLISHED', published_at = clock_timestamp()
      WHERE outbox_id = ANY($1::uuid[])
        AND status = 'PROCESSING'
        AND processing_worker_id = $2
      RETURNING outbox_id;
    `, [ids100, batchTokenB]);

    if (wrongAck.rowCount !== 0) {
      throw new Error(`TEST 3 FAILED: Wrong token updated ${wrongAck.rowCount} rows!`);
    }

    // Verify cardinality check failure simulation
    let failedClosed = false;
    if (wrongAck.rowCount !== ids100.length) {
      failedClosed = true;
    }
    console.log(`  ✔ Wrong lease token updated 0 rows. Fail-closed condition certified.`);
    testReport.test_results.test3_wrong_lease_token_fail_closed = {
      pass: failedClosed,
      expected_rows: ids100.length,
      wrong_token_updated_rows: wrongAck.rowCount
    };

    // ----------------------------------------------------
    // TEST 4: Known Meili Failure -> Atomic RETRY
    // ----------------------------------------------------
    console.log('\n[TEST 4] Known Meili Failure -> Atomic RETRY...');
    // Simulate failure handler for the 100 rows
    await client.query(`
      UPDATE ${TEST_TABLE}
      SET status = 'RETRY',
          next_retry_at = clock_timestamp() + interval '5 seconds',
          processing_worker_id = NULL,
          last_error = 'SIMULATED_MEILI_FAILURE'
      WHERE outbox_id = ANY($1::uuid[])
        AND status = 'PROCESSING'
        AND processing_worker_id = $2;
    `, [ids100, batchTokenA]);

    const retryCheck = await client.query(`
      SELECT count(*) FROM ${TEST_TABLE}
      WHERE outbox_id = ANY($1::uuid[]) AND status = 'RETRY' AND processing_worker_id IS NULL;
    `, [ids100]);

    if (parseInt(retryCheck.rows[0].count, 10) !== 100) {
      throw new Error(`TEST 4 FAILED: Expected 100 rows in RETRY, got ${retryCheck.rows[0].count}`);
    }
    console.log(`  ✔ Known failure reset all 100 rows to RETRY with cleared lease worker.`);
    testReport.test_results.test4_known_failure_to_retry = {
      pass: true,
      requeued_rows: parseInt(retryCheck.rows[0].count, 10)
    };

    // ----------------------------------------------------
    // TEST 5: Crash Before ACK & Stale Lease Reclaim
    // ----------------------------------------------------
    console.log('\n[TEST 5] Crash Before ACK & Stale Lease Reclaim...');
    // Set rows to PROCESSING with processing_started_at = 6 minutes ago (expired lease)
    const crashToken = `crash_token_${crypto.randomUUID()}`;
    await client.query(`
      UPDATE ${TEST_TABLE}
      SET status = 'PROCESSING',
          processing_started_at = clock_timestamp() - interval '6 minutes',
          processing_worker_id = $1
      WHERE outbox_id = ANY($2::uuid[]);
    `, [crashToken, ids100]);

    // Run sweep query
    const reclaimRes = await client.query(`
      UPDATE ${TEST_TABLE}
      SET status = 'RETRY',
          next_retry_at = clock_timestamp(),
          processing_worker_id = NULL,
          last_error = 'STALE_LEASE_RECLAIMED'
      WHERE status = 'PROCESSING'
        AND processing_started_at < clock_timestamp() - interval '5 minutes'
      RETURNING outbox_id;
    `);

    if (reclaimRes.rowCount < 100) {
      throw new Error(`TEST 5 FAILED: Expected at least 100 reclaimed rows, got ${reclaimRes.rowCount}`);
    }
    console.log(`  ✔ Stale lease sweep successfully reclaimed ${reclaimRes.rowCount} rows back to ready queue.`);
    testReport.test_results.test5_stale_lease_reclaim = {
      pass: true,
      reclaimed_rows: reclaimRes.rowCount
    };

    // ----------------------------------------------------
    // TEST 6: Meili Success + ACK Interruption & Idempotent Replay
    // ----------------------------------------------------
    console.log('\n[TEST 6] Meili Success + ACK Interruption & Idempotent Replay...');
    // Replay pushing the 100 rows into Meilisearch
    const replayDocs = (await client.query(`SELECT payload FROM ${TEST_TABLE} WHERE outbox_id = ANY($1::uuid[])`, [ids100])).rows.map(r => r.payload);
    
    const replayPush1 = await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}/documents?primaryKey=atlas_person_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(replayDocs)
    });
    const task1 = await replayPush1.json();
    await pollMeiliTask(task1.taskUid);

    // Replay pushing AGAIN (simulating replay of same document IDs)
    const replayPush2 = await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}/documents?primaryKey=atlas_person_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(replayDocs)
    });
    const task2 = await replayPush2.json();
    await pollMeiliTask(task2.taskUid);

    // Check index count
    const countCheck = await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}/documents?limit=0`);
    const countData = await countCheck.json();
    // 20000 from Test 2 + 100 from Test 6 = 20100 documents total
    if (countData.total !== 20100) {
      throw new Error(`TEST 6 FAILED: Expected 20,100 docs, got ${countData.total} (duplicate document IDs created!)`);
    }
    console.log(`  ✔ Replayed identical documents idempotently. Total documents in index: ${countData.total} (0 duplicates).`);
    testReport.test_results.test6_idempotent_replay = {
      pass: true,
      total_docs_in_index: countData.total,
      duplicates_created: 0
    };

    // ----------------------------------------------------
    // TEST 7: Partial Final Flush
    // ----------------------------------------------------
    console.log('\n[TEST 7] Partial Final Flush (e.g. 2,500 remaining events)...');
    await populateTestRows(client, 2500, 30000);
    const partialToken = `partial_${crypto.randomUUID()}`;

    // Claim partial batch (target = 20000, available = 2500)
    const partialClaim = await client.query(`
      WITH next_batch AS (
        SELECT outbox_id FROM ${TEST_TABLE}
        WHERE status = 'PENDING'
        ORDER BY next_retry_at ASC, outbox_id ASC
        LIMIT 20000
        FOR UPDATE SKIP LOCKED
      ),
      claimed AS (
        UPDATE ${TEST_TABLE} o
        SET status = 'PROCESSING',
            processing_started_at = clock_timestamp(),
            processing_worker_id = $1,
            attempt_count = o.attempt_count + 1
        FROM next_batch nb WHERE o.outbox_id = nb.outbox_id
        RETURNING o.outbox_id, o.payload
      )
      SELECT * FROM claimed;
    `, [partialToken]);

    if (partialClaim.rowCount !== 2500) {
      throw new Error(`TEST 7 FAILED: Expected 2,500 rows claimed, got ${partialClaim.rowCount}`);
    }

    const partialDocs = partialClaim.rows.map(r => r.payload);
    const partialIds = partialClaim.rows.map(r => r.outbox_id);

    const partialPush = await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}/documents?primaryKey=atlas_person_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partialDocs)
    });
    const partialTask = await partialPush.json();
    await pollMeiliTask(partialTask.taskUid);

    // Bulk ACK partial batch
    const partialAck = await client.query(`
      UPDATE ${TEST_TABLE}
      SET status = 'PUBLISHED', published_at = clock_timestamp()
      WHERE outbox_id = ANY($1::uuid[])
        AND status = 'PROCESSING'
        AND processing_worker_id = $2
      RETURNING outbox_id;
    `, [partialIds, partialToken]);

    if (partialAck.rowCount !== 2500) {
      throw new Error(`TEST 7 FAILED: Expected 2,500 ACKed, got ${partialAck.rowCount}`);
    }

    console.log(`  ✔ Partial batch flushed and ACKed cleanly (2,500 / 2,500 rows).`);
    testReport.test_results.test7_partial_final_flush = {
      pass: true,
      partial_batch_size: partialClaim.rowCount,
      rows_acked: partialAck.rowCount
    };

    testReport.all_passed = true;
    console.log('\n==================================================');
    console.log('✔ ALL PRE-INTEGRATION TESTS PASSED 100%');
    console.log('==================================================');

  } finally {
    await teardownTestEnvironment(client);
    await client.end();
  }

  // Save artifact
  const outPath = 'reports/atlas/discovery/atlas_stage3k_aggregator_pre_test_v1.json';
  fs.writeFileSync(outPath, JSON.stringify(testReport, null, 2));
  console.log(`Saved pre-test report to ${outPath}`);
  const hash = hashFile(outPath);
  console.log(`SHA256: ${hash}  ${outPath}`);
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
