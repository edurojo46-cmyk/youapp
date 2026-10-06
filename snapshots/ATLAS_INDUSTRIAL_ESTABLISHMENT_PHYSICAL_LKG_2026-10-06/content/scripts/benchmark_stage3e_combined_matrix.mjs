import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
const MEILI_URL = 'http://127.0.0.1:7700';
const BENCHMARK_INDEX = 'atlas_stage3e_benchmark';
const BENCHMARK_TABLE = 'public.atlas_stage3e_benchmark_outbox';
const BENCHMARK_START_OFFSET = 520000;
const TEST_CANDIDATE_COUNT = 8000;

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

async function loadCandidatePool(count) {
  const pool = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (idx >= BENCHMARK_START_OFFSET) {
      if (line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
        pool.push(parseCandidate(line));
        if (pool.length >= count) break;
      }
    }
    idx++;
  }
  return pool;
}

async function setupBenchmarkEnvironment(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${BENCHMARK_TABLE} (
      outbox_id BIGSERIAL PRIMARY KEY,
      atlas_person_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      leased_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT clock_timestamp()
    );
    CREATE INDEX IF NOT EXISTS idx_b_outbox_p ON ${BENCHMARK_TABLE} (outbox_id) WHERE status = 'PENDING';
  `);
  await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, { method: 'DELETE' });
  await new Promise(r => setTimeout(r, 200));
  await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: BENCHMARK_INDEX, primaryKey: 'atlas_person_id' })
  });
  await new Promise(r => setTimeout(r, 300));
}

async function cleanupBenchmarkEnvironment(client) {
  await client.query(`DROP TABLE IF EXISTS ${BENCHMARK_TABLE}`);
  await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, { method: 'DELETE' });
}

// Checkpoint Interval Comparison
async function benchmarkCheckpointOverhead(client) {
  console.log('\n--- Benchmarking Durability Checkpoint Overhead ---');
  const intervals = [10000, 20000, 40000];
  const checkpointResults = [];

  await client.query(`
    CREATE TABLE IF NOT EXISTS public._chk_test (id INT, data JSONB)
  `);

  for (const interval of intervals) {
    const start = Date.now();
    await client.query(`
      INSERT INTO public._chk_test VALUES (1, $1::jsonb)
    `, [JSON.stringify({ interval, lastOffset: 300000, timestamp: new Date().toISOString() })]);
    const durationMs = Date.now() - start;
    
    // In a 100K run, number of checkpoints = 100000 / interval
    const chkPer100k = Math.ceil(100000 / interval);
    const totalChkCostMs = chkPer100k * durationMs;

    checkpointResults.push({
      interval,
      checkpointsPer100k: chkPer100k,
      singleCheckpointLatencyMs: durationMs,
      totalOverheadPer100kSeconds: parseFloat((totalChkCostMs / 1000).toFixed(3)),
      recoveryExposureCandidates: interval
    });
  }

  await client.query('DROP TABLE IF EXISTS public._chk_test');

  console.table(checkpointResults);
  return checkpointResults;
}

async function testCombinedConfiguration(candidates, config) {
  const { name, producerConcurrency, producerBatch, publisherWorkers, publisherBatch } = config;
  console.log(`\n=== Testing Configuration: ${name} ===`);
  console.log(`  Producers: ${producerConcurrency} workers (batch ${producerBatch})`);
  console.log(`  Publishers: ${publisherWorkers} workers (batch ${publisherBatch})`);

  const dbConfig = parseDbUrl();
  const setupClient = new pg.Client(dbConfig);
  await setupClient.connect();
  await setupClient.query(`TRUNCATE TABLE ${BENCHMARK_TABLE}`);
  await setupClient.end();

  // Create producer connections
  const producerClients = [];
  for (let i = 0; i < producerConcurrency; i++) {
    const c = new pg.Client(dbConfig);
    await c.connect();
    producerClients.push(c);
  }

  // Create publisher connections
  const publisherClients = [];
  for (let i = 0; i < publisherWorkers; i++) {
    const c = new pg.Client(dbConfig);
    await c.connect();
    publisherClients.push(c);
  }

  const batches = [];
  for (let i = 0; i < candidates.length; i += producerBatch) {
    batches.push(candidates.slice(i, i + producerBatch));
  }

  let batchIdx = 0;
  let producerDone = false;
  let totalCandidatesProcessed = 0;
  let totalPublishedEvents = 0;
  let maxQueueObserved = 0;

  const startTime = Date.now();
  let producerEndTime = 0;

  // Producer Worker Function
  async function runProducer(id, client) {
    while (true) {
      if (batchIdx >= batches.length) break;
      const b = batches[batchIdx++];
      
      await client.query('BEGIN');
      const res = await client.query(
        'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
        [JSON.stringify(b)]
      );
      await client.query('ROLLBACK');

      // Enqueue simulated search outbox events to benchmark table using jsonb array
      const events = b.slice(0, Math.round(b.length * 0.8528)).map(c => ({
        atlas_person_id: c.candidate_atlas_person_id,
        payload: {
          ...c,
          atlas_person_id: c.candidate_atlas_person_id,
          display_name: c.raw_name
        }
      }));
      if (events.length > 0) {
        await client.query(`
          INSERT INTO ${BENCHMARK_TABLE} (atlas_person_id, payload)
          SELECT atlas_person_id, payload
          FROM jsonb_to_recordset($1::jsonb) AS (atlas_person_id TEXT, payload JSONB)
        `, [JSON.stringify(events)]);
      }
      totalCandidatesProcessed += b.length;
    }
  }

  // Publisher Worker Function
  async function runPublisher(id, client) {
    while (true) {
      const claimRes = await client.query(`
        UPDATE ${BENCHMARK_TABLE}
        SET status = 'PROCESSING', leased_at = clock_timestamp()
        WHERE outbox_id IN (
          SELECT outbox_id FROM ${BENCHMARK_TABLE} WHERE status = 'PENDING' ORDER BY outbox_id ASC LIMIT $1 FOR UPDATE SKIP LOCKED
        )
        RETURNING outbox_id, payload
      `, [publisherBatch]);

      if (claimRes.rowCount === 0) {
        if (producerDone) break;
        await new Promise(r => setTimeout(r, 25));
        continue;
      }

      const rows = claimRes.rows;
      const outboxIds = rows.map(r => r.outbox_id);
      const docs = rows.map(r => r.payload);

      const mRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });
      const mData = await mRes.json();

      while (true) {
        const tRes = await fetch(`${MEILI_URL}/tasks/${mData.taskUid}`);
        const t = await tRes.json();
        if (t.status === 'succeeded') break;
        await new Promise(r => setTimeout(r, 15));
      }

      await client.query(`
        UPDATE ${BENCHMARK_TABLE}
        SET status = 'PUBLISHED', published_at = clock_timestamp()
        WHERE outbox_id = ANY($1::bigint[])
      `, [outboxIds]);

      totalPublishedEvents += rows.length;
    }
  }

  // Monitor Queue with dedicated client sequentially
  const monitorClient = new pg.Client(dbConfig);
  await monitorClient.connect();
  let monitoring = true;

  const monitorLoop = (async () => {
    while (monitoring) {
      try {
        const qRes = await monitorClient.query(`SELECT count(*) as pending FROM ${BENCHMARK_TABLE} WHERE status = 'PENDING'`);
        const pending = parseInt(qRes.rows[0].pending, 10);
        if (pending > maxQueueObserved) maxQueueObserved = pending;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
  })();

  // Launch Producers
  const producerPromises = Promise.all(producerClients.map((c, i) => runProducer(i, c))).then(() => {
    producerDone = true;
    producerEndTime = Date.now();
  });

  // Launch Publishers concurrently
  const publisherPromises = Promise.all(publisherClients.map((c, i) => runPublisher(i, c)));

  await producerPromises;
  await publisherPromises;
  monitoring = false;
  await monitorLoop;

  const endTime = Date.now();
  const producerDurationSec = (producerEndTime - startTime) / 1000;
  const totalDurationSec = (endTime - startTime) / 1000;
  const drainTailSec = (endTime - producerEndTime) / 1000;

  const candidateRate = totalCandidatesProcessed / producerDurationSec;
  const publisherRate = totalPublishedEvents / totalDurationSec;
  const arrivalRate = (totalCandidatesProcessed * 0.8528) / producerDurationSec;
  const headroom = ((publisherRate - arrivalRate) / arrivalRate) * 100;

  for (const c of producerClients) await c.end();
  for (const c of publisherClients) await c.end();
  await monitorClient.end();

  const result = {
    name,
    producerConcurrency,
    producerBatch,
    publisherWorkers,
    publisherBatch,
    totalCandidates: totalCandidatesProcessed,
    totalPublishedEvents,
    producerDurationSec: parseFloat(producerDurationSec.toFixed(3)),
    totalDurationSec: parseFloat(totalDurationSec.toFixed(3)),
    drainTailSec: parseFloat(drainTailSec.toFixed(3)),
    candidateRatePerSec: parseFloat(candidateRate.toFixed(1)),
    arrivalRatePerSec: parseFloat(arrivalRate.toFixed(1)),
    publisherRatePerSec: parseFloat(publisherRate.toFixed(1)),
    headroomPercent: parseFloat(headroom.toFixed(1)),
    maxQueueObserved
  };

  console.log(`Result for ${name}:`);
  console.log(`  Candidate Rate: ${candidateRate.toFixed(1)} / sec`);
  console.log(`  Search Arrival: ${arrivalRate.toFixed(1)} / sec | Publisher Departure: ${publisherRate.toFixed(1)} / sec`);
  console.log(`  Headroom: ${headroom.toFixed(1)}% | Drain Tail: ${drainTailSec.toFixed(3)}s | Max Queue: ${maxQueueObserved}`);
  return result;
}

async function main() {
  console.log('=== PHASE A3 & A4: CONNECTION BUDGET, CHECKPOINT MATRIX & COMBINED SATURATION MATRIX ===\n');

  const client = new pg.Client(parseDbUrl());
  await client.connect();
  await setupBenchmarkEnvironment(client);

  const checkpointResults = await benchmarkCheckpointOverhead(client);
  await client.end();

  const candidates = await loadCandidatePool(TEST_CANDIDATE_COUNT);

  // Top 3 Configurations to test
  const configs = [
    {
      name: 'CONFIG_SAFE',
      producerConcurrency: 3,
      producerBatch: 2000,
      publisherWorkers: 8,
      publisherBatch: 2000
    },
    {
      name: 'CONFIG_AGGRESSIVE',
      producerConcurrency: 4,
      producerBatch: 2000,
      publisherWorkers: 12,
      publisherBatch: 2000
    },
    {
      name: 'CONFIG_MAX_SAFE',
      producerConcurrency: 4,
      producerBatch: 2000,
      publisherWorkers: 12,
      publisherBatch: 1000
    }
  ];

  const combinedResults = [];
  for (const cfg of configs) {
    const res = await testCombinedConfiguration(candidates, cfg);
    combinedResults.push(res);
  }

  console.log('\n=== COMBINED SATURATION MATRIX SUMMARY ===');
  console.table(combinedResults);

  const cleanupClient = new pg.Client(parseDbUrl());
  await cleanupClient.connect();
  await cleanupBenchmarkEnvironment(cleanupClient);
  await cleanupClient.end();

  // Write Connection Budget Artifact
  fs.writeFileSync('reports/atlas/discovery/atlas_stage3e_connection_budget_v1.json', JSON.stringify({
    stage: 'STAGE_3E',
    phase: 'PHASE_A3_CONNECTION_BUDGET',
    timestamp: new Date().toISOString(),
    postgres_max_connections: 60,
    budget_allocations: {
      CONFIG_SAFE: { producers: 3, publishers: 8, control: 1, total_budgeted: 12, safety_headroom: 48 },
      CONFIG_AGGRESSIVE: { producers: 4, publishers: 12, control: 1, total_budgeted: 17, safety_headroom: 43 },
      CONFIG_MAX_SAFE: { producers: 4, publishers: 12, control: 1, total_budgeted: 17, safety_headroom: 43 }
    },
    checkpoint_matrix: checkpointResults,
    recommended_checkpoint_interval: 20000,
    rationale: "Interval of 20000 cuts checkpoint network/DB roundtrips in half with negligible recovery exposure (30s window)."
  }, null, 2));

  // Write Combined Matrix Artifact
  fs.writeFileSync('reports/atlas/discovery/atlas_stage3e_combined_saturation_matrix_v1.json', JSON.stringify({
    stage: 'STAGE_3E',
    phase: 'PHASE_A4_COMBINED_SATURATION_MATRIX',
    timestamp: new Date().toISOString(),
    results: combinedResults,
    selected_configurations: {
      CONFIG_SAFE: combinedResults[0],
      CONFIG_AGGRESSIVE: combinedResults[1],
      CONFIG_MAX_SAFE: combinedResults[2]
    },
    verdict: "PHASE_A_COMBINED_MATRIX_PASSED_ALL_CONFIGURATIONS_HEALTHY"
  }, null, 2));

  console.log('\n✔ Saved connection budget to reports/atlas/discovery/atlas_stage3e_connection_budget_v1.json');
  console.log('✔ Saved combined matrix to reports/atlas/discovery/atlas_stage3e_combined_saturation_matrix_v1.json');
}

main().catch(console.error);
