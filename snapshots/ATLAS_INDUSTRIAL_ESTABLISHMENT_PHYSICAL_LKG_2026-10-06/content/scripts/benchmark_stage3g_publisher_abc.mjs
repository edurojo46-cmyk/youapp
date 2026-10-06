import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const { Pool } = pg;

const MEILI_URL = 'http://127.0.0.1:7700';
const BENCHMARK_INDEX = 'atlas_stage3g_benchmark_index';
const BENCHMARK_TABLE = 'public.stage3g_benchmark_outbox';

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return sorted[idx];
}

async function setupBenchmarkEnvironment(pool) {
  console.log('--- Setting up isolated benchmark table & Meilisearch index ---');
  const client = await pool.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS ${BENCHMARK_TABLE};`);
    await client.query(`
      CREATE UNLOGGED TABLE ${BENCHMARK_TABLE} (
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
        payload_version text NOT NULL DEFAULT 'v1',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await client.query(`
      CREATE INDEX idx_stage3g_bench_ready_queue ON ${BENCHMARK_TABLE} USING btree (next_retry_at, outbox_id) 
        WHERE (status = ANY (ARRAY['PENDING'::text, 'RETRY'::text]));
    `);
    await client.query(`
      CREATE INDEX idx_stage3g_bench_created ON ${BENCHMARK_TABLE} USING btree (created_at) 
        WHERE (status = ANY (ARRAY['PENDING'::text, 'RETRY'::text, 'QUARANTINED'::text]));
    `);
    await client.query(`
      CREATE INDEX idx_stage3g_bench_status_retry ON ${BENCHMARK_TABLE} USING btree (status, next_retry_at) 
        WHERE (status = ANY (ARRAY['PENDING'::text, 'RETRY'::text]));
    `);

    // Ensure Meilisearch isolated index
    await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, { method: 'DELETE' }).catch(() => {});
    const createRes = await fetch(`${MEILI_URL}/indexes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: BENCHMARK_INDEX, primaryKey: 'candidate_atlas_person_id' })
    });
    const createData = await createRes.json();
    if (createData.taskUid) {
      await pollMeiliTask(createData.taskUid);
    }
  } finally {
    client.release();
  }
}

async function teardownBenchmarkEnvironment(pool) {
  console.log('--- Tearing down isolated benchmark environment ---');
  const client = await pool.connect();
  try {
    await client.query(`DROP TABLE IF EXISTS ${BENCHMARK_TABLE};`);
    await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, { method: 'DELETE' }).catch(() => {});
  } finally {
    client.release();
  }
}

async function populateBenchmarkRows(pool, pendingCount = 5000, publishedBackgroundCount = 20000) {
  const client = await pool.connect();
  try {
    await client.query(`TRUNCATE TABLE ${BENCHMARK_TABLE};`);
    
    // Background published rows
    await client.query(`
      INSERT INTO ${BENCHMARK_TABLE} (source_id, source_record_id, status, payload, created_at, published_at)
      SELECT 
        'ARCA_CONDICION_TRIBUTARIA', 
        '20' || LPAD(i::text, 9, '0'), 
        'PUBLISHED', 
        jsonb_build_object('candidate_atlas_person_id', 'atlas_arg_per_' || LPAD(i::text, 16, '0'), 'display_name', 'TEST PERSON ' || i),
        now() - interval '1 hour',
        now() - interval '30 minutes'
      FROM generate_series(1, ${publishedBackgroundCount}) s(i);
    `);

    // Target pending rows to process
    await client.query(`
      INSERT INTO ${BENCHMARK_TABLE} (source_id, source_record_id, status, payload, created_at, next_retry_at)
      SELECT 
        'ARCA_CONDICION_TRIBUTARIA', 
        '27' || LPAD(i::text, 9, '0'), 
        'PENDING', 
        jsonb_build_object('candidate_atlas_person_id', 'atlas_arg_per_bench_' || LPAD(i::text, 16, '0'), 'display_name', 'BENCH PENDING ' || i),
        now() - (interval '10 seconds' * (${pendingCount} - i) / 1000),
        now() - (interval '10 seconds' * (${pendingCount} - i) / 1000)
      FROM generate_series(1, ${pendingCount}) s(i);
    `);

    await client.query(`ANALYZE ${BENCHMARK_TABLE};`);
  } finally {
    client.release();
  }
}

async function pollMeiliTask(taskUid) {
  const pollStart = Date.now();
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const data = await res.json();
    if (data.status === 'succeeded') return;
    if (data.status === 'failed') throw new Error(`Meili task failed: ${JSON.stringify(data.error)}`);
    if (Date.now() - pollStart > 30000) throw new Error(`Meili task timeout: ${taskUid}`);
    await new Promise(r => setTimeout(r, 20));
  }
}

async function runStrategyBenchmark({ pool, strategy, numWorkers, batchSize, totalRowsToProcess }) {
  await populateBenchmarkRows(pool, totalRowsToProcess, 15000);

  let claimQuery = '';
  if (strategy === 'A_CURRENT_RAW_CLAIM') {
    claimQuery = `
      WITH next_batch AS (
        SELECT outbox_id
        FROM ${BENCHMARK_TABLE}
        WHERE status = 'PENDING'
        ORDER BY outbox_id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      ),
      updated AS (
        UPDATE ${BENCHMARK_TABLE} o
        SET status = 'PROCESSING', processing_started_at = now(), processing_worker_id = $2
        FROM next_batch nb
        WHERE o.outbox_id = nb.outbox_id
        RETURNING o.outbox_id, o.payload
      )
      SELECT * FROM updated;
    `;
  } else if (strategy === 'B_INDEX_ALIGNED_CLAIM') {
    claimQuery = `
      WITH next_batch AS (
        SELECT outbox_id
        FROM ${BENCHMARK_TABLE}
        WHERE status IN ('PENDING', 'RETRY')
          AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp())
        ORDER BY next_retry_at ASC, outbox_id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      ),
      updated AS (
        UPDATE ${BENCHMARK_TABLE} o
        SET status = 'PROCESSING', processing_started_at = now(), processing_worker_id = $2
        FROM next_batch nb
        WHERE o.outbox_id = nb.outbox_id
        RETURNING o.outbox_id, o.payload
      )
      SELECT * FROM updated;
    `;
  } else if (strategy === 'C_CERTIFIED_PROCESS_SEARCH_OUTBOX_BATCH') {
    claimQuery = `
      WITH next_batch AS (
        SELECT outbox_id
        FROM ${BENCHMARK_TABLE}
        WHERE status IN ('PENDING', 'RETRY')
          AND (next_retry_at IS NULL OR next_retry_at <= now())
        ORDER BY attempt_count ASC, next_retry_at ASC NULLS FIRST, created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      ),
      updated AS (
        UPDATE ${BENCHMARK_TABLE} o
        SET status = 'PROCESSING', processing_started_at = now(), processing_worker_id = $2
        FROM next_batch nb
        WHERE o.outbox_id = nb.outbox_id
        RETURNING o.outbox_id, o.payload
      )
      SELECT * FROM updated;
    `;
  }

  const claimLatencies = [];
  const pushLatencies = [];
  const taskLatencies = [];
  const ackLatencies = [];
  let totalProcessed = 0;
  let active = true;

  const benchStart = performance.now();

  const workerPromises = Array.from({ length: numWorkers }, async (_, wIdx) => {
    const workerId = `bench_w_${wIdx}`;
    const client = await pool.connect();
    try {
      while (active) {
        // 1. Claim
        const t0 = performance.now();
        const res = await client.query(claimQuery, [batchSize, workerId]);
        const t1 = performance.now();
        claimLatencies.push(t1 - t0);

        if (res.rows.length === 0) {
          // Check if queue completely drained
          const countRes = await client.query(`SELECT count(*) FROM ${BENCHMARK_TABLE} WHERE status = 'PENDING'`);
          if (parseInt(countRes.rows[0].count, 10) === 0) {
            active = false;
            break;
          }
          await new Promise(r => setTimeout(r, 20));
          continue;
        }

        const outboxIds = res.rows.map(r => r.outbox_id);
        const docs = res.rows.map(r => r.payload);

        // 2. Meili Push
        const t2 = performance.now();
        const pushRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(docs)
        });
        const pushData = await pushRes.json();
        const t3 = performance.now();
        pushLatencies.push(t3 - t2);

        // 3. Meili Task Wait
        if (pushData.taskUid) {
          await pollMeiliTask(pushData.taskUid);
        }
        const t4 = performance.now();
        taskLatencies.push(t4 - t3);

        // 4. DB Publish ACK
        await client.query(`
          UPDATE ${BENCHMARK_TABLE}
          SET status = 'PUBLISHED', published_at = now(), processing_worker_id = NULL
          WHERE outbox_id = ANY($1::uuid[])
        `, [outboxIds]);
        const t5 = performance.now();
        ackLatencies.push(t5 - t4);

        totalProcessed += outboxIds.length;
      }
    } finally {
      client.release();
    }
  });

  await Promise.all(workerPromises);
  const benchDurationSec = (performance.now() - benchStart) / 1000;

  return {
    strategy,
    num_workers: numWorkers,
    batch_size: batchSize,
    total_events_processed: totalProcessed,
    duration_seconds: benchDurationSec,
    events_per_second: totalProcessed / benchDurationSec,
    claim_metrics: {
      claim_p50_ms: percentile(claimLatencies, 50),
      claim_p95_ms: percentile(claimLatencies, 95),
      claim_p99_ms: percentile(claimLatencies, 99)
    },
    push_p50_ms: percentile(pushLatencies, 50),
    task_p50_ms: percentile(taskLatencies, 50),
    ack_p50_ms: percentile(ackLatencies, 50)
  };
}

async function main() {
  console.log('================================================================');
  console.log('🚀 ATLAS STAGE 3G: ISOLATED PUBLISHER A/B/C BENCHMARK');
  console.log('   MISSION: DISCOVER & CERTIFY WINNING PUBLISHER >= 750 events/sec');
  console.log('================================================================\n');

  const dbConfig = parseDbUrl();
  // Connection pool sized for concurrent worker tests (up to 16 workers + 4 headroom)
  const pool = new Pool({
    ...dbConfig,
    max: 22,
    idleTimeoutMillis: 10000
  });

  try {
    await setupBenchmarkEnvironment(pool);

    const testGrid = [
      // 8 workers x batch 1000
      { strategy: 'A_CURRENT_RAW_CLAIM', numWorkers: 8, batchSize: 1000, totalRowsToProcess: 4000 },
      { strategy: 'B_INDEX_ALIGNED_CLAIM', numWorkers: 8, batchSize: 1000, totalRowsToProcess: 4000 },
      { strategy: 'C_CERTIFIED_PROCESS_SEARCH_OUTBOX_BATCH', numWorkers: 8, batchSize: 1000, totalRowsToProcess: 4000 },

      // 12 workers x batch 1000
      { strategy: 'A_CURRENT_RAW_CLAIM', numWorkers: 12, batchSize: 1000, totalRowsToProcess: 4000 },
      { strategy: 'B_INDEX_ALIGNED_CLAIM', numWorkers: 12, batchSize: 1000, totalRowsToProcess: 4000 },
      { strategy: 'C_CERTIFIED_PROCESS_SEARCH_OUTBOX_BATCH', numWorkers: 12, batchSize: 1000, totalRowsToProcess: 4000 },

      // 16 workers x batch 1000
      { strategy: 'A_CURRENT_RAW_CLAIM', numWorkers: 16, batchSize: 1000, totalRowsToProcess: 4000 },
      { strategy: 'B_INDEX_ALIGNED_CLAIM', numWorkers: 16, batchSize: 1000, totalRowsToProcess: 4000 },
      { strategy: 'C_CERTIFIED_PROCESS_SEARCH_OUTBOX_BATCH', numWorkers: 16, batchSize: 1000, totalRowsToProcess: 4000 }
    ];

    const results = [];

    for (const cfg of testGrid) {
      console.log(`\nTesting Strategy: ${cfg.strategy} | Workers: ${cfg.numWorkers} | Batch: ${cfg.batchSize}...`);
      const res = await runStrategyBenchmark({
        pool,
        strategy: cfg.strategy,
        numWorkers: cfg.numWorkers,
        batchSize: cfg.batchSize,
        totalRowsToProcess: cfg.totalRowsToProcess
      });
      console.log(`  -> Throughput: ${res.events_per_second.toFixed(1)} events/sec | Claim p50: ${res.claim_metrics.claim_p50_ms.toFixed(1)}ms (p95: ${res.claim_metrics.claim_p95_ms.toFixed(1)}ms) | Task p50: ${res.task_p50_ms.toFixed(1)}ms`);
      results.push(res);
    }

    // Identify best worker count for batch 2000 evaluation
    // Filter by Strategy B (or highest throughput strategy)
    const strategyBResults = results.filter(r => r.strategy === 'B_INDEX_ALIGNED_CLAIM');
    strategyBResults.sort((a, b) => b.events_per_second - a.events_per_second);
    const bestWorkerCount = strategyBResults[0].num_workers;

    console.log(`\nTesting Best Worker Count (${bestWorkerCount} workers) with Batch 2000...`);
    const resBatch2000 = await runStrategyBenchmark({
      pool,
      strategy: 'B_INDEX_ALIGNED_CLAIM',
      numWorkers: bestWorkerCount,
      batchSize: 2000,
      totalRowsToProcess: 6000
    });
    console.log(`  -> Batch 2000 Throughput: ${resBatch2000.events_per_second.toFixed(1)} events/sec | Claim p50: ${resBatch2000.claim_metrics.claim_p50_ms.toFixed(1)}ms`);
    results.push(resBatch2000);

    // Select overall winner
    results.sort((a, b) => b.events_per_second - a.events_per_second);
    const overallWinner = results[0];

    console.log('\n================================================================');
    console.log('🏆 BENCHMARK WINNER SELECTED');
    console.log(`   Strategy:    ${overallWinner.strategy}`);
    console.log(`   Workers:     ${overallWinner.num_workers}`);
    console.log(`   Batch Size:  ${overallWinner.batch_size}`);
    console.log(`   Throughput:  ${overallWinner.events_per_second.toFixed(1)} events/sec`);
    console.log(`   Target (>=750 events/sec): ${overallWinner.events_per_second >= 750 ? 'PASS' : 'FAIL'}`);
    console.log('================================================================\n');

    await teardownBenchmarkEnvironment(pool);

    const artifactPath = 'reports/atlas/discovery/atlas_stage3g_publisher_abc_benchmark_v1.json';
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify({
      stage: 'STAGE_3G',
      version: 'v1',
      benchmark_timestamp: new Date().toISOString(),
      benchmark_matrix: results,
      winner: {
        strategy: overallWinner.strategy,
        workers: overallWinner.num_workers,
        batch_size: overallWinner.batch_size,
        events_per_second: overallWinner.events_per_second,
        target_750_met: overallWinner.events_per_second >= 750,
        preferred_900_met: overallWinner.events_per_second >= 900
      }
    }, null, 2));

    console.log(`Saved benchmark artifact to ${artifactPath}`);

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Benchmark Error:', err);
  process.exit(1);
});
