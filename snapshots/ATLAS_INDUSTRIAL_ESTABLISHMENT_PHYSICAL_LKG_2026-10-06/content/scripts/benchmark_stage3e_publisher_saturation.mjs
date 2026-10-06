import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const BENCHMARK_INDEX = 'atlas_stage3e_benchmark';
const BENCHMARK_TABLE = 'public.atlas_stage3e_benchmark_outbox';
const EVENTS_PER_RUN = 6000;

async function setupBenchmarkEnvironment(client) {
  console.log('Setting up isolated benchmark environment...');
  // 1. Create isolated benchmark table in PG
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${BENCHMARK_TABLE} (
      outbox_id BIGSERIAL PRIMARY KEY,
      atlas_person_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_record_id TEXT NOT NULL,
      source_surface_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      leased_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT clock_timestamp()
    );
    CREATE INDEX IF NOT EXISTS idx_b_outbox_pending ON ${BENCHMARK_TABLE} (outbox_id) WHERE status = 'PENDING';
  `);

  // 2. Ensure isolated benchmark index in Meilisearch
  await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, {
    method: 'DELETE'
  });
  await new Promise(r => setTimeout(r, 200));

  await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: BENCHMARK_INDEX, primaryKey: 'atlas_person_id' })
  });
  await new Promise(r => setTimeout(r, 300));
  console.log('✔ Isolated benchmark environment ready.');
}

async function populateBenchmarkQueue(client, count) {
  console.log(`Populating ${count} benchmark events into ${BENCHMARK_TABLE}...`);
  await client.query(`TRUNCATE TABLE ${BENCHMARK_TABLE}`);
  
  // Insert in batches of 2000
  for (let i = 0; i < count; i += 2000) {
    const batchSize = Math.min(2000, count - i);
    const pids = [];
    for (let j = 0; j < batchSize; j++) {
      const idx = i + j;
      const pid = `bench_pid_${idx.toString().padStart(8, '0')}`;
      const payload = JSON.stringify({
        atlas_person_id: pid,
        display_name: `BENCHMARK PERSON ${idx}`,
        source_id: 'STAGE3E_BENCHMARK',
        source_record_id: `bench_rec_${idx}`,
        source_surface_id: 'SURF_BENCH',
        source_ids: ['STAGE3E_BENCHMARK']
      });
      pids.push(`('${pid}', 'STAGE3E_BENCHMARK', 'bench_rec_${idx}', 'SURF_BENCH', '${payload}'::jsonb, 'PENDING')`);
    }
    await client.query(`
      INSERT INTO ${BENCHMARK_TABLE} (atlas_person_id, source_id, source_record_id, source_surface_id, payload, status)
      VALUES ${pids.join(',')}
    `);
  }
  console.log(`✔ Populated ${count} events.`);
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0 };
  latencies.sort((a, b) => a - b);
  return {
    p50: Math.round(latencies[Math.floor(latencies.length * 0.50)]),
    p95: Math.round(latencies[Math.floor(latencies.length * 0.95)])
  };
}

async function testPublisherConfig(numWorkers, batchSize) {
  console.log(`\n--- Testing Publisher Workers=${numWorkers}, BatchSize=${batchSize} ---`);
  const dbConfig = parseDbUrl();
  const setupClient = new pg.Client(dbConfig);
  await setupClient.connect();
  await populateBenchmarkQueue(setupClient, EVENTS_PER_RUN);
  await setupClient.end();

  const clientPool = [];
  for (let i = 0; i < numWorkers; i++) {
    const c = new pg.Client(dbConfig);
    await c.connect();
    clientPool.push(c);
  }

  const claimLatencies = [];
  const pushLatencies = [];
  const taskLatencies = [];
  const ackLatencies = [];
  let totalProcessed = 0;
  const startTime = Date.now();

  async function publisherWorker(workerId, client) {
    while (true) {
      // 1. CLAIM BATCH
      const claimStart = Date.now();
      const claimRes = await client.query(`
        UPDATE ${BENCHMARK_TABLE}
        SET status = 'PROCESSING', leased_at = clock_timestamp()
        WHERE outbox_id IN (
          SELECT outbox_id
          FROM ${BENCHMARK_TABLE}
          WHERE status = 'PENDING'
          ORDER BY outbox_id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING outbox_id, payload
      `, [batchSize]);
      const claimTime = Date.now() - claimStart;
      if (claimRes.rowCount === 0) break;
      claimLatencies.push(claimTime);

      const rows = claimRes.rows;
      const outboxIds = rows.map(r => r.outbox_id);
      const docs = rows.map(r => r.payload);

      // 2. MEILI PUSH
      const pushStart = Date.now();
      const meiliRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });
      const meiliData = await meiliRes.json();
      pushLatencies.push(Date.now() - pushStart);

      // 3. WAIT FOR TASK SUCCESS
      const taskStart = Date.now();
      while (true) {
        const tRes = await fetch(`${MEILI_URL}/tasks/${meiliData.taskUid}`);
        const t = await tRes.json();
        if (t.status === 'succeeded') break;
        if (t.status === 'failed') throw new Error(`Meili task ${meiliData.taskUid} failed`);
        await new Promise(r => setTimeout(r, 20));
      }
      taskLatencies.push(Date.now() - taskStart);

      // 4. BULK SET-BASED ACK PUBLISHED
      const ackStart = Date.now();
      await client.query(`
        UPDATE ${BENCHMARK_TABLE}
        SET status = 'PUBLISHED', published_at = clock_timestamp()
        WHERE outbox_id = ANY($1::bigint[])
      `, [outboxIds]);
      ackLatencies.push(Date.now() - ackStart);

      totalProcessed += rows.length;
    }
  }

  const workerPromises = clientPool.map((c, i) => publisherWorker(i, c));
  await Promise.all(workerPromises);

  const durationSec = (Date.now() - startTime) / 1000;
  const departureRate = totalProcessed / durationSec;

  for (const c of clientPool) await c.end();

  const claimP = calculatePercentiles(claimLatencies);
  const pushP = calculatePercentiles(pushLatencies);
  const taskP = calculatePercentiles(taskLatencies);
  const ackP = calculatePercentiles(ackLatencies);

  const result = {
    workers: numWorkers,
    batchSize,
    totalEvents: totalProcessed,
    elapsedSeconds: parseFloat(durationSec.toFixed(3)),
    departureRatePerSec: parseFloat(departureRate.toFixed(1)),
    claim_p50_ms: claimP.p50,
    claim_p95_ms: claimP.p95,
    push_p50_ms: pushP.p50,
    push_p95_ms: pushP.p95,
    task_p50_ms: taskP.p50,
    task_p95_ms: taskP.p95,
    ack_p50_ms: ackP.p50,
    ack_p95_ms: ackP.p95
  };

  console.log(`Result: ${departureRate.toFixed(1)} events/sec | Claim p50=${claimP.p50}ms | Push p50=${pushP.p50}ms | Task p50=${taskP.p50}ms | ACK p50=${ackP.p50}ms`);
  return result;
}

async function cleanupBenchmarkEnvironment(client) {
  console.log('\nCleaning up isolated benchmark state...');
  await client.query(`DROP TABLE IF EXISTS ${BENCHMARK_TABLE}`);
  await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, { method: 'DELETE' });
  console.log('✔ Cleanup complete.');
}

async function main() {
  console.log('=== PHASE A2: PUBLISHER SATURATION CURVE (ISOLATED BENCHMARK) ===\n');

  const setupClient = new pg.Client(parseDbUrl());
  await setupClient.connect();
  await setupBenchmarkEnvironment(setupClient);
  await setupClient.end();

  const testMatrix = [
    { workers: 8, batchSize: 1000 },
    { workers: 12, batchSize: 1000 },
    { workers: 12, batchSize: 2000 },
    { workers: 16, batchSize: 2000 },
    { workers: 24, batchSize: 2000 },
    { workers: 16, batchSize: 4000 }
  ];

  const results = [];
  let prevRate = 0;
  let kneeFound = null;

  for (const cfg of testMatrix) {
    const res = await testPublisherConfig(cfg.workers, cfg.batchSize);
    results.push(res);

    if (prevRate > 0) {
      const gain = (res.departureRatePerSec - prevRate) / prevRate;
      console.log(`  Rate delta vs prev: ${(gain * 100).toFixed(1)}%`);
      if (gain < 0.10 && !kneeFound && cfg.workers >= 16) {
        kneeFound = cfg;
        console.log(`  👉 Saturation knee observed around Workers=${cfg.workers}, Batch=${cfg.batchSize}`);
      }
    }
    prevRate = res.departureRatePerSec;
  }

  const sorted = [...results].sort((a, b) => b.departureRatePerSec - a.departureRatePerSec);
  const maxObserved = sorted[0];

  console.log('\n=== PUBLISHER SATURATION SUMMARY ===');
  console.table(results);

  const cleanupClient = new pg.Client(parseDbUrl());
  await cleanupClient.connect();
  await cleanupBenchmarkEnvironment(cleanupClient);
  await cleanupClient.end();

  const fs = await import('node:fs');
  fs.writeFileSync('reports/atlas/discovery/atlas_stage3e_publisher_saturation_curve_v1.json', JSON.stringify({
    stage: 'STAGE_3E',
    phase: 'PHASE_A2_PUBLISHER_SATURATION',
    timestamp: new Date().toISOString(),
    benchmark_events_per_run: EVENTS_PER_RUN,
    isolated_benchmark_table: BENCHMARK_TABLE,
    isolated_benchmark_index: BENCHMARK_INDEX,
    results,
    publisher_knee_configuration: kneeFound || results[2],
    publisher_max_observed_configuration: maxObserved
  }, null, 2));

  console.log('\n✔ Saved publisher saturation curve to reports/atlas/discovery/atlas_stage3e_publisher_saturation_curve_v1.json');
}

main().catch(console.error);
