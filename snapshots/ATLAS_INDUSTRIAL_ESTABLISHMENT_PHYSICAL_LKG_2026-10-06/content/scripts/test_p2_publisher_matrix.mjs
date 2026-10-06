import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { runPipelinedPublisher } from './run_perf_search_publisher_pipelined.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const SHADOW_TABLE = 'public.atlas_search_outbox_perf_test';
const TEST_INDEX = 'atlas_perf_p2_publisher_bench';

async function setupShadowTable(pool) {
  console.log(`Setting up isolated shadow table ${SHADOW_TABLE}...`);
  await pool.query(`DROP TABLE IF EXISTS ${SHADOW_TABLE} CASCADE`);
  await pool.query(`
    CREATE TABLE ${SHADOW_TABLE} (
      outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      atlas_person_id text NOT NULL,
      source_id text NOT NULL,
      source_record_id text NOT NULL,
      payload jsonb NOT NULL,
      payload_version integer DEFAULT 1,
      status text DEFAULT 'PENDING'::text CHECK (status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'RETRY'::text, 'PUBLISHED'::text, 'QUARANTINED'::text])),
      attempt_count integer DEFAULT 0,
      created_at timestamp with time zone DEFAULT now(),
      next_retry_at timestamp with time zone DEFAULT now(),
      processing_started_at timestamp with time zone,
      processing_worker_id text,
      last_error text,
      quarantined_at timestamp with time zone,
      published_at timestamp with time zone,
      CONSTRAINT uq_perf_test_canonical UNIQUE (source_id, source_record_id)
    )
  `);

  // Create exact identical production indexes
  await pool.query(`
    CREATE INDEX idx_perf_test_ready_queue ON ${SHADOW_TABLE} USING btree (next_retry_at, outbox_id)
    WHERE status = ANY (ARRAY['PENDING'::text, 'RETRY'::text])
  `);
  await pool.query(`
    CREATE INDEX idx_perf_test_processing ON ${SHADOW_TABLE} USING btree (processing_started_at)
    WHERE status = 'PROCESSING'::text
  `);
  console.log(`Shadow table ${SHADOW_TABLE} created with identical indexes.`);
}

async function populateShadowTable(pool, count) {
  console.log(`Populating ${count} test documents into ${SHADOW_TABLE}...`);
  const chunkSize = 2000;
  for (let c = 0; c < count; c += chunkSize) {
    const batchSize = Math.min(chunkSize, count - c);
    const atlasIds = [];
    const sourceIds = [];
    const recordIds = [];
    const payloads = [];

    for (let i = 0; i < batchSize; i++) {
      const idx = c + i;
      const pid = `atlas_p2_pub_${idx}_${crypto.randomBytes(4).toString('hex')}`;
      const recId = `rec_p2_pub_${idx}`;
      const payload = {
        atlas_person_id: pid,
        display_name: `BENCHMARK CANDIDATE ${idx}`,
        display_name_normalized: `benchmark candidate ${idx}`,
        search_text_normalized: `benchmark candidate ${idx}`,
        source_id: 'STAGE_P2_BENCH',
        source_record_id: recId
      };
      atlasIds.push(pid);
      sourceIds.push('STAGE_P2_BENCH');
      recordIds.push(recId);
      payloads.push(payload);
    }

    await pool.query(`
      INSERT INTO ${SHADOW_TABLE} (atlas_person_id, source_id, source_record_id, payload)
      SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::jsonb[])
    `, [atlasIds, sourceIds, recordIds, payloads]);
  }
  console.log(`Populated ${count} documents.`);
}

async function setupMeiliIndex() {
  console.log(`Setting up Meilisearch test index ${TEST_INDEX}...`);
  await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}`, { method: 'DELETE' });
  await new Promise(r => setTimeout(r, 100));

  const cRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: TEST_INDEX, primaryKey: 'atlas_person_id' })
  });
  const cData = await cRes.json();
  if (cData.taskUid) {
    while (true) {
      const tRes = await fetch(`${MEILI_URL}/tasks/${cData.taskUid}`);
      const tData = await tRes.json();
      if (tData.status === 'succeeded' || tData.status === 'failed') break;
      await new Promise(r => setTimeout(r, 20));
    }
  }
  console.log(`Meilisearch test index ${TEST_INDEX} ready.`);
}

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  try {
    // -------------------------------------------------------------
    // PART 1: Correctness Test of Atomic Leasing
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('STEP 1: PUBLISHER ASYNC LEASING CORRECTNESS TEST');
    console.log('=============================================================');
    await setupShadowTable(pool);
    await setupMeiliIndex();
    await populateShadowTable(pool, 4000);

    const correctnessStats = await runPipelinedPublisher({
      claimBatch: 2000,
      maxInflight: 2,
      drain: true,
      stopIdleMs: 1500,
      tableName: SHADOW_TABLE,
      indexName: TEST_INDEX,
      statsFile: 'cache_gate31d/p2_publisher_correctness.json'
    });

    // Check DB truth
    const dbCounts = await pool.query(`
      SELECT status, count(*) FROM ${SHADOW_TABLE} GROUP BY status
    `);
    console.log('Shadow Table Status Counts:', dbCounts.rows);

    const publishedCount = parseInt(dbCounts.rows.find(r => r.status === 'PUBLISHED')?.count || '0', 10);
    const processingCount = parseInt(dbCounts.rows.find(r => r.status === 'PROCESSING')?.count || '0', 10);
    const pendingCount = parseInt(dbCounts.rows.find(r => r.status === 'PENDING')?.count || '0', 10);

    const correctnessVerdict = {
      DUPLICATE_OUTBOX_LEASES: correctnessStats.DUPLICATE_OUTBOX_LEASES,
      DOUBLE_PUBLICATION_LOGICAL_EVENTS: correctnessStats.DOUBLE_PUBLICATION_LOGICAL_EVENTS,
      ORPHAN_PROCESSING_ROWS: processingCount,
      PENDING_REMAINING: pendingCount,
      PUBLISHED_RECONCILED: publishedCount,
      CORRECTNESS_PASSED: (
        correctnessStats.DUPLICATE_OUTBOX_LEASES === 0 &&
        correctnessStats.DOUBLE_PUBLICATION_LOGICAL_EVENTS === 0 &&
        processingCount === 0 &&
        publishedCount === 4000
      )
    };
    console.log('Correctness Verdict:', JSON.stringify(correctnessVerdict, null, 2));

    if (!correctnessVerdict.CORRECTNESS_PASSED) {
      throw new Error('Publisher async leasing correctness check failed!');
    }

    // -------------------------------------------------------------
    // PART 2: Search Publisher Performance Matrix
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('STEP 2: SEARCH PUBLISHER PERFORMANCE MATRIX');
    console.log('=============================================================');

    // Matrix test cases: combinations of claim batch and max in-flight
    const testCases = [
      { claimBatch: 2000, maxInflight: 2, docsToTest: 8000 },
      { claimBatch: 2000, maxInflight: 4, docsToTest: 8000 },
      { claimBatch: 4000, maxInflight: 2, docsToTest: 8000 },
      { claimBatch: 4000, maxInflight: 4, docsToTest: 8000 },
      { claimBatch: 4000, maxInflight: 8, docsToTest: 8000 },
      { claimBatch: 8000, maxInflight: 2, docsToTest: 8000 },
      { claimBatch: 8000, maxInflight: 4, docsToTest: 8000 }
    ];

    const matrixResults = [];

    for (const tc of testCases) {
      console.log(`\n--- Benchmarking: CLAIM_BATCH=${tc.claimBatch}, MAX_INFLIGHT=${tc.maxInflight} (${tc.docsToTest} docs) ---`);
      await setupShadowTable(pool);
      await populateShadowTable(pool, tc.docsToTest);

      const stats = await runPipelinedPublisher({
        claimBatch: tc.claimBatch,
        maxInflight: tc.maxInflight,
        drain: true,
        stopIdleMs: 1500,
        tableName: SHADOW_TABLE,
        indexName: TEST_INDEX,
        statsFile: `cache_gate31d/p2_publisher_bench_b${tc.claimBatch}_i${tc.maxInflight}.json`
      });

      const result = {
        CLAIM_BATCH: tc.claimBatch,
        MAX_INFLIGHT: tc.maxInflight,
        DOCS_TESTED: tc.docsToTest,
        CLAIM_DOCS_SEC: stats.CLAIM_DOCS_SEC,
        HTTP_SUBMIT_DOCS_SEC: stats.HTTP_SUBMIT_DOCS_SEC,
        MEILI_ENGINE_DOCS_SEC: stats.MEILI_ENGINE_DOCS_SEC,
        SEARCH_E2E_DOCS_SEC: stats.SEARCH_E2E_DOCS_SEC,
        ELAPSED_SEC: stats.ELAPSED_SEC,
        DUPLICATE_LEASES: stats.DUPLICATE_OUTBOX_LEASES,
        ORPHAN_ROWS: stats.ORPHAN_PROCESSING_ROWS,
        FAILED: stats.totalDocsQuarantined,
        QUARANTINED: stats.totalDocsQuarantined
      };

      console.log(`RESULT: E2E: ${result.SEARCH_E2E_DOCS_SEC} docs/sec | Claim: ${result.CLAIM_DOCS_SEC} | MeiliEngine: ${result.MEILI_ENGINE_DOCS_SEC}`);
      matrixResults.push(result);
    }

    // Sort by SEARCH_E2E_DOCS_SEC desc
    matrixResults.sort((a, b) => b.SEARCH_E2E_DOCS_SEC - a.SEARCH_E2E_DOCS_SEC);
    const bestPublisher = matrixResults[0];

    const finalReport = {
      timestamp: new Date().toISOString(),
      stage: 'atlas_perf_1m30_p2_publisher_matrix',
      correctnessVerdict,
      matrixResults,
      bestPublisherConfig: bestPublisher,
      P2_SEARCH_700_GATE: bestPublisher.SEARCH_E2E_DOCS_SEC >= 700 ? 'PASS' : 'FAIL'
    };

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync(
      'reports/atlas/discovery/atlas_perf_1m30_p2_publisher_matrix_v1.json',
      JSON.stringify(finalReport, null, 2)
    );

    console.log('\n=============================================================');
    console.log('🏆 BEST PUBLISHER CONFIGURATION:');
    console.log(JSON.stringify(bestPublisher, null, 2));
    console.log(`P2_SEARCH_700_GATE: ${finalReport.P2_SEARCH_700_GATE}`);
    console.log('=============================================================\n');

    // Clean up shadow table and test index
    await pool.query(`DROP TABLE IF EXISTS ${SHADOW_TABLE}`);
    await fetch(`${MEILI_URL}/indexes/${TEST_INDEX}`, { method: 'DELETE' });

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal Matrix Error:', err);
  process.exit(1);
});
