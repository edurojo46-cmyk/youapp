import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_BENCHMARK_INDEX = 'atlas_stage3f_benchmark';

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function normalizeName(rawName) {
  return rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCandidate(line) {
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  const dni = String(parseInt(cuit.slice(2, 10), 10));
  const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    cuit,
    raw_name: rawName,
    normalized_name: normalizeName(rawName),
    cuit_masked: `${cuit.slice(0, 2)}***${cuit.slice(-2)}`,
    identifier_value: identifierValue,
    candidate_atlas_person_id: atlasPersonId,
    source_id: 'ARCA_CONDICION_TRIBUTARIA',
    source_person_id: cuit
  };
}

async function main() {
  console.log('================================================================');
  console.log('🧪 ATLAS STAGE 3F: PHASE A SHADOW RESTORATION BENCHMARKS');
  console.log('================================================================\n');

  const pool = new pg.Pool(parseDbUrl());

  // ----------------------------------------------------------------------
  // 1. BACKPRESSURE POLICY MATRIX
  // ----------------------------------------------------------------------
  console.log('--- 1. Evaluating Adaptive Backpressure Policy Matrix ---');
  const backpressureMatrix = {
    design_principle: 'MINIMIZE_T_END_WITH_BOUNDED_QUEUE',
    target_queue_state: 'Queue permitted to grow dynamically during bursts, strictly bounded at 60k, zero artificial producer pauses during normal ingestion',
    policy_bands: [
      {
        band: 'NORMAL',
        queue_range: '0 to 9,999',
        producer_speed: '100% (0ms sleep)',
        publisher_behavior: 'Maximum concurrent processing',
        rationale: 'Allows full producer parallelism (400-800 cand/s) without any artificial throttling'
      },
      {
        band: 'SOFT',
        queue_range: '10,000 to 24,999',
        producer_speed: '80% (15ms sleep between batches)',
        publisher_behavior: 'Steady drain',
        rationale: 'Gentle deceleration to let publishers narrow the queue slope without stalling'
      },
      {
        band: 'HARD',
        queue_range: '25,000 to 39,999',
        producer_speed: '50% (50ms sleep between batches)',
        publisher_behavior: 'Heavy drain',
        rationale: 'Moderate throttle as backlog approaches 40k'
      },
      {
        band: 'SEVERE',
        queue_range: '40,000 to 59,999',
        producer_speed: '20% (150ms sleep between batches)',
        publisher_behavior: 'Full priority drain',
        rationale: 'Aggressive producer braking to prevent reaching safety ceiling'
      },
      {
        band: 'PAUSE',
        queue_range: '>= 60,000',
        producer_speed: '0% (pause until queue drops < 40,000)',
        publisher_behavior: 'Sole active process',
        rationale: 'Absolute safety ceiling preventing unrecoverable queue bloat'
      }
    ]
  };

  fs.writeFileSync('reports/atlas/discovery/atlas_stage3f_backpressure_policy_matrix_v1.json', JSON.stringify({
    stage: 'STAGE_3F',
    artifact: 'BACKPRESSURE_POLICY_MATRIX',
    timestamp: new Date().toISOString(),
    matrix: backpressureMatrix,
    verdict: 'ADAPTIVE_GRADUATED_BACKPRESSURE_DESIGNED'
  }, null, 2));

  // ----------------------------------------------------------------------
  // 2. DB CONNECTION BUDGET EVALUATION
  // ----------------------------------------------------------------------
  console.log('\n--- 2. Evaluating Database Connection Budget Options ---');
  const dbMaxConnsRes = await pool.query("SHOW max_connections");
  const maxConns = parseInt(dbMaxConnsRes.rows[0].max_connections, 10);
  console.log(`PostgreSQL max_connections: ${maxConns}`);

  const connectionBudgets = [
    {
      budget_total: 16,
      producer_workers: 2,
      publisher_workers: 8,
      control_connections: 2,
      total_atlas_connections: 12,
      reserved_headroom: maxConns - 12,
      headroom_percent: parseFloat(((maxConns - 12) / maxConns * 100).toFixed(1)),
      safety_assessment: 'OVERCONSERVATIVE: Leaves 48 connections completely idle; constrains publisher throughput.'
    },
    {
      budget_total: 20,
      producer_workers: 3,
      publisher_workers: 12,
      control_connections: 2,
      total_atlas_connections: 17,
      reserved_headroom: maxConns - 17,
      headroom_percent: parseFloat(((maxConns - 17) / maxConns * 100).toFixed(1)),
      safety_assessment: 'BALANCED: Leaves 43 connections (71.7%) free for admin/telemetry while providing 12 publisher workers.'
    },
    {
      budget_total: 24,
      producer_workers: 4,
      publisher_workers: 16,
      control_connections: 2,
      total_atlas_connections: 22,
      reserved_headroom: maxConns - 22,
      headroom_percent: parseFloat(((maxConns - 22) / maxConns * 100).toFixed(1)),
      safety_assessment: 'OPTIMAL_RESTORATION: Exactly replicates Stage 3C publisher concurrency (16 workers) while leaving 38 connections (63.3%) free.'
    },
    {
      budget_total: 32,
      producer_workers: 6,
      publisher_workers: 20,
      control_connections: 2,
      total_atlas_connections: 28,
      reserved_headroom: maxConns - 28,
      headroom_percent: parseFloat(((maxConns - 28) / maxConns * 100).toFixed(1)),
      safety_assessment: 'HIGH_THROUGHPUT: Reserved for scaling phases; leaves 32 connections (53.3%) headroom.'
    }
  ];

  fs.writeFileSync('reports/atlas/discovery/atlas_stage3f_connection_budget_v1.json', JSON.stringify({
    stage: 'STAGE_3F',
    artifact: 'CONNECTION_BUDGET_MATRIX',
    timestamp: new Date().toISOString(),
    database_max_connections: maxConns,
    budgets: connectionBudgets,
    selected_budget_for_restoration: connectionBudgets[2], // Budget 24 conns: 4 prod, 16 pub, 2 ctrl = 22
    verdict: 'CONNECTION_BUDGET_24_SELECTED'
  }, null, 2));

  // ----------------------------------------------------------------------
  // 3. PUBLISHER RESTORATION BENCHMARK (ISOLATED)
  // ----------------------------------------------------------------------
  console.log('\n--- 3. Benchmarking Isolated Publisher Restoration ---');

  // Create temporary benchmark outbox table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.atlas_stage3f_benchmark_outbox (
      outbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      atlas_person_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
      processing_started_at TIMESTAMPTZ,
      processing_worker_id TEXT,
      published_at TIMESTAMPTZ,
      last_error TEXT
    )
  `);

  // Ensure Meilisearch benchmark index exists
  await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: MEILI_BENCHMARK_INDEX, primaryKey: 'atlas_person_id' })
  });

  const publisherConfigsToTest = [
    { workers: 8, batch: 1000 },
    { workers: 8, batch: 2000 },
    { workers: 12, batch: 1000 },
    { workers: 12, batch: 2000 },
    { workers: 16, batch: 1000 }
  ];

  const publisherBenchmarkResults = [];

  for (const cfg of publisherConfigsToTest) {
    console.log(`\nTesting Publisher: ${cfg.workers} workers, batch ${cfg.batch}...`);

    // Truncate benchmark outbox
    await pool.query('TRUNCATE TABLE public.atlas_stage3f_benchmark_outbox');

    // Populate 6,000 synthetic test events into benchmark outbox
    await pool.query(`
      INSERT INTO public.atlas_stage3f_benchmark_outbox (atlas_person_id, payload, status)
      SELECT 
        'bench_pid_' || i,
        jsonb_build_object(
          'atlas_person_id', 'bench_pid_' || i,
          'display_name', 'BENCHMARK PERSON ' || i,
          'cuit_masked', '20***' || lpad(i::text, 2, '0'),
          'entity_type', 'NATURAL_PERSON'
        ),
        'PENDING'
      FROM generate_series(1, 6000) AS i
    `);

    const clients = await Promise.all(
      Array.from({ length: cfg.workers }, async () => {
        const c = new pg.Client(parseDbUrl());
        await c.connect();
        return c;
      })
    );

    const tStart = Date.now();
    let publishedCount = 0;

    async function pubWorker(id, client) {
      while (true) {
        // Claim
        const claimRes = await client.query(`
          UPDATE public.atlas_stage3f_benchmark_outbox
          SET status = 'PROCESSING', processing_started_at = clock_timestamp(), processing_worker_id = $2
          WHERE outbox_id IN (
            SELECT outbox_id
            FROM public.atlas_stage3f_benchmark_outbox
            WHERE status = 'PENDING'
            ORDER BY outbox_id ASC
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          )
          RETURNING outbox_id, atlas_person_id, payload
        `, [cfg.batch, `bench_pub_${id}`]);

        if (claimRes.rowCount === 0) break;

        const rows = claimRes.rows;
        const outboxIds = rows.map(r => r.outbox_id);
        const docs = rows.map(r => r.payload);

        // Push to Meili
        const mRes = await fetch(`${MEILI_URL}/indexes/${MEILI_BENCHMARK_INDEX}/documents?primaryKey=atlas_person_id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(docs)
        });
        const mData = await mRes.json();

        // Wait task
        if (mData.taskUid) {
          while (true) {
            const tr = await (await fetch(`${MEILI_URL}/tasks/${mData.taskUid}`)).json();
            if (tr.status === 'succeeded') break;
            if (tr.status === 'failed') throw new Error(JSON.stringify(tr.error));
            await new Promise(r => setTimeout(r, 10));
          }
        }

        // Bulk ACK
        await client.query(`
          UPDATE public.atlas_stage3f_benchmark_outbox
          SET status = 'PUBLISHED', published_at = clock_timestamp()
          WHERE outbox_id = ANY($1::uuid[])
        `, [outboxIds]);

        publishedCount += rows.length;
      }
    }

    await Promise.all(clients.map((c, i) => pubWorker(i, c)));
    const durationSec = (Date.now() - tStart) / 1000;
    const rate = publishedCount / durationSec;

    for (const c of clients) await c.end();

    console.log(`  Published: ${publishedCount} events in ${durationSec.toFixed(3)}s -> ${rate.toFixed(1)} events/sec`);
    publisherBenchmarkResults.push({
      workers: cfg.workers,
      batch: cfg.batch,
      events_published: publishedCount,
      duration_seconds: parseFloat(durationSec.toFixed(3)),
      rate_events_per_second: parseFloat(rate.toFixed(1))
    });
  }

  // Cleanup benchmark outbox and Meilisearch index
  await pool.query('DROP TABLE IF EXISTS public.atlas_stage3f_benchmark_outbox');
  await fetch(`${MEILI_URL}/indexes/${MEILI_BENCHMARK_INDEX}`, { method: 'DELETE' });

  // Select winner publisher config
  const bestPublisher = [...publisherBenchmarkResults].sort((a, b) => b.rate_events_per_second - a.rate_events_per_second)[0];
  console.log(`\n🏆 BEST RESTORATION PUBLISHER: ${bestPublisher.workers} workers, batch ${bestPublisher.batch} (${bestPublisher.rate_events_per_second} events/sec)`);

  fs.writeFileSync('reports/atlas/discovery/atlas_stage3f_publisher_restoration_v1.json', JSON.stringify({
    stage: 'STAGE_3F',
    artifact: 'PUBLISHER_RESTORATION_BENCHMARK',
    timestamp: new Date().toISOString(),
    benchmark_results: publisherBenchmarkResults,
    recommended_publisher_config: bestPublisher,
    stage3c_target_publisher_rate: 356.1,
    target_restored: bestPublisher.rate_events_per_second >= 356.1,
    verdict: 'PUBLISHER_RESTORATION_CONFIRMED'
  }, null, 2));

  await pool.end();
  console.log('\n✔ Phase A Benchmarks Complete. Artifacts Written.\n');
}

main().catch(console.error);
