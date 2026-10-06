import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) throw new Error('MISSING_HMAC_SECRET');

const BENCHMARK_START_OFFSET = 500000; // Far beyond upcoming canaries
const CANDIDATES_PER_TEST = 8000;

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

async function loadBenchmarkPool(count) {
  console.log(`Loading ${count} candidates from offset ${BENCHMARK_START_OFFSET}...`);
  const pool = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(SOURCE_FILE),
    crlfDelay: Infinity
  });
  let lineIdx = 0;
  for await (const line of rl) {
    if (lineIdx >= BENCHMARK_START_OFFSET) {
      if (line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
        pool.push(parseCandidate(line));
        if (pool.length >= count) break;
      }
    }
    lineIdx++;
  }
  return pool;
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0 };
  latencies.sort((a, b) => a - b);
  return {
    p50: Math.round(latencies[Math.floor(latencies.length * 0.50)]),
    p95: Math.round(latencies[Math.floor(latencies.length * 0.95)]),
    p99: Math.round(latencies[Math.floor(latencies.length * 0.99)])
  };
}

async function testProducerConfig(poolCandidates, concurrency, batchSize) {
  console.log(`\n--- Testing Concurrency=${concurrency}, BatchSize=${batchSize} ---`);
  const clientPool = [];
  const dbConfig = parseDbUrl();

  for (let i = 0; i < concurrency; i++) {
    const c = new pg.Client(dbConfig);
    await c.connect();
    clientPool.push(c);
  }

  // Divide candidates into batches
  const batches = [];
  for (let i = 0; i < poolCandidates.length; i += batchSize) {
    batches.push(poolCandidates.slice(i, i + batchSize));
  }

  const rpcLatencies = [];
  const txLatencies = [];
  let batchIndex = 0;
  const startTime = Date.now();

  async function worker(workerId, client) {
    while (true) {
      let bIdx;
      if (batchIndex >= batches.length) break;
      bIdx = batchIndex++;
      const currentBatch = batches[bIdx];

      const txStart = Date.now();
      await client.query('BEGIN');

      const rpcStart = Date.now();
      const res = await client.query(
        'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
        [JSON.stringify(currentBatch)]
      );
      const rpcDuration = Date.now() - rpcStart;
      rpcLatencies.push(rpcDuration);

      // ALWAYS ROLLBACK TO PREVENT ACCIDENTAL PERSISTENT COMMITS
      await client.query('ROLLBACK');
      const txDuration = Date.now() - txStart;
      txLatencies.push(txDuration);
    }
  }

  const workerPromises = clientPool.map((client, idx) => worker(idx, client));
  await Promise.all(workerPromises);

  const totalTimeSec = (Date.now() - startTime) / 1000;
  const candidatesPerSec = poolCandidates.length / totalTimeSec;

  for (const c of clientPool) {
    await c.end();
  }

  const rpcP = calculatePercentiles(rpcLatencies);
  const txP = calculatePercentiles(txLatencies);

  const result = {
    concurrency,
    batchSize,
    totalCandidates: poolCandidates.length,
    elapsedSeconds: parseFloat(totalTimeSec.toFixed(3)),
    candidatesPerSec: parseFloat(candidatesPerSec.toFixed(1)),
    rpc_p50_ms: rpcP.p50,
    rpc_p95_ms: rpcP.p95,
    rpc_p99_ms: rpcP.p99,
    tx_p50_ms: txP.p50,
    tx_p95_ms: txP.p95,
    tx_p99_ms: txP.p99
  };

  console.log(`Result: ${candidatesPerSec.toFixed(1)} cand/sec | RPC p50=${rpcP.p50}ms p95=${rpcP.p95}ms | TX p50=${txP.p50}ms`);
  return result;
}

async function main() {
  console.log('=== PHASE A1: PRODUCER SATURATION CURVE (SHADOW / ROLLBACK) ===\n');

  const candidates = await loadBenchmarkPool(CANDIDATES_PER_TEST);
  console.log(`Loaded ${candidates.length} test candidates in memory.\n`);

  const results = [];
  const testMatrix = [
    // 1. Concurrency exploration with batch=2000
    { concurrency: 2, batchSize: 2000 },
    { concurrency: 3, batchSize: 2000 },
    { concurrency: 4, batchSize: 2000 },
    { concurrency: 6, batchSize: 2000 },
    // 2. Batch exploration at best concurrency (e.g. 3 and 4)
    { concurrency: 3, batchSize: 4000 },
    { concurrency: 4, batchSize: 4000 },
    { concurrency: 4, batchSize: 5000 }
  ];

  let prevThroughput = 0;
  let kneeFound = null;

  for (const cfg of testMatrix) {
    const res = await testProducerConfig(candidates, cfg.concurrency, cfg.batchSize);
    results.push(res);

    if (prevThroughput > 0) {
      const gain = (res.candidatesPerSec - prevThroughput) / prevThroughput;
      console.log(`  Throughput delta vs prev: ${(gain * 100).toFixed(1)}%`);
      if (gain < 0.10 && !kneeFound && cfg.concurrency > 2) {
        kneeFound = cfg;
        console.log(`  👉 Saturation knee observed around Concurrency=${cfg.concurrency}, Batch=${cfg.batchSize}`);
      }
    }
    prevThroughput = res.candidatesPerSec;
  }

  // Sort by candidatesPerSec descending
  const sorted = [...results].sort((a, b) => b.candidatesPerSec - a.candidatesPerSec);
  const maxObserved = sorted[0];

  console.log('\n=== PRODUCER SATURATION SUMMARY ===');
  console.table(results);

  fs.writeFileSync('reports/atlas/discovery/atlas_stage3e_producer_saturation_curve_v1.json', JSON.stringify({
    stage: 'STAGE_3E',
    phase: 'PHASE_A1_PRODUCER_SATURATION',
    timestamp: new Date().toISOString(),
    benchmark_candidates_per_run: CANDIDATES_PER_TEST,
    execution_mode: 'SHADOW_ROLLBACK_ISOLATED',
    results,
    producer_knee_configuration: kneeFound || results[1],
    producer_max_observed_configuration: maxObserved
  }, null, 2));

  console.log('\n✔ Saved producer saturation curve to reports/atlas/discovery/atlas_stage3e_producer_saturation_curve_v1.json');
}

main().catch(console.error);
