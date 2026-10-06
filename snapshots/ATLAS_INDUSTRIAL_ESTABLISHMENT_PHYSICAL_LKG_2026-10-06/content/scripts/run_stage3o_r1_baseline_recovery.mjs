import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET || HMAC_SECRET.length === 0) {
  console.error('FATAL: ATLAS_IGJ_IDENTITY_HMAC_KEY is missing.');
  process.exit(1);
}

const SHADOW_POPULATION_SIZE = 96000;
const SHADOW_OFFSET_START = 600000;
const BATCH_SIZE = 2000;
const WORKERS = 3;
const REPEATS = 3;
const FROZEN_STAGE3M_MEDIAN = 622.93;
const TOLERANCE_PERCENT = 0.10; // +/- 10%

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

async function loadDeterministicCandidates(startOffset, count) {
  console.log(`Loading ${count} deterministic candidates from offset ${startOffset}...`);
  const candidates = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (idx >= startOffset && line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
      candidates.push(parseCandidate(line));
      if (candidates.length >= count) break;
    }
    idx++;
  }
  console.log(`Loaded ${candidates.length} candidates.`);
  return candidates;
}

function computeStats(values) {
  if (values.length === 0) return { min: 0, median: 0, max: 0, mean: 0, stddev: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const min = Number(sorted[0].toFixed(2));
  const max = Number(sorted[sorted.length - 1].toFixed(2));
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
    : Number(sorted[mid].toFixed(2));
  const mean = Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2));
  const variance = sorted.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / sorted.length;
  const stddev = Number(Math.sqrt(variance).toFixed(2));
  return { min, median, max, mean, stddev };
}

async function sampleWaitEvents(observerClient, waitStats) {
  try {
    const res = await observerClient.query(`
      SELECT wait_event_type, wait_event, count(*) as cnt
      FROM pg_stat_activity
      WHERE state = 'active' AND pid != pg_backend_pid()
      GROUP BY wait_event_type, wait_event;
    `);
    waitStats.sample_count++;
    for (const row of res.rows) {
      const type = row.wait_event_type || 'ActiveCPU';
      const event = row.wait_event || 'CPU';
      const cnt = parseInt(row.cnt, 10);
      
      const key = `${type}:${event}`;
      waitStats.raw_counts[key] = (waitStats.raw_counts[key] || 0) + cnt;

      // Category aggregation
      if (event === 'DataFileRead') waitStats.categories.DataFileRead = (waitStats.categories.DataFileRead || 0) + cnt;
      else if (event === 'BuffileRead') waitStats.categories.BuffileRead = (waitStats.categories.BuffileRead || 0) + cnt;
      else if (event === 'transactionid') waitStats.categories.transactionid = (waitStats.categories.transactionid || 0) + cnt;
      else if (event === 'tuple') waitStats.categories.tuple = (waitStats.categories.tuple || 0) + cnt;
      else if (type === 'Lock') waitStats.categories.Lock = (waitStats.categories.Lock || 0) + cnt;
      else if (event === 'WALWrite') waitStats.categories.WALWrite = (waitStats.categories.WALWrite || 0) + cnt;
      else if (event === 'WALSync') waitStats.categories.WALSync = (waitStats.categories.WALSync || 0) + cnt;
      else if (event === 'ClientRead') waitStats.categories.ClientRead = (waitStats.categories.ClientRead || 0) + cnt;
      else if (event === 'ClientWrite') waitStats.categories.ClientWrite = (waitStats.categories.ClientWrite || 0) + cnt;
      else if (type === 'ActiveCPU') waitStats.categories.ActiveCPU = (waitStats.categories.ActiveCPU || 0) + cnt;
      else waitStats.categories.other = (waitStats.categories.other || 0) + cnt;
    }
  } catch (err) {
    // observer error ignored
  }
}

async function recordEnvironmentState(pool) {
  const client = await pool.connect();
  try {
    const actRes = await client.query(`
      SELECT 
        count(*) FILTER (WHERE state = 'active') as active_sessions,
        count(*) FILTER (WHERE state = 'idle') as idle_sessions,
        count(*) as total_sessions
      FROM pg_stat_activity
      WHERE pid != pg_backend_pid();
    `);
    const timeoutRes = await client.query("SHOW statement_timeout;");
    return {
      active_sessions: parseInt(actRes.rows[0].active_sessions, 10),
      idle_sessions: parseInt(actRes.rows[0].idle_sessions, 10),
      total_sessions: parseInt(actRes.rows[0].total_sessions, 10),
      statement_timeout: timeoutRes.rows[0].statement_timeout
    };
  } finally {
    client.release();
  }
}

async function runBaselineRepeat(pool, candidates, repIndex, waitStats) {
  console.log(`\n>>> STARTING REPEAT ${repIndex + 1} / ${REPEATS} (V2 3W x 2K on 96K)...`);
  
  // Create disjoint batches
  const batches = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    batches.push(candidates.slice(i, i + BATCH_SIZE));
  }
  let nextBatchIdx = 0;

  const rpcDurations = [];
  let totalNew = 0;
  let totalMerge = 0;
  let errors = 0;
  const workerBackendPids = [];

  // Start background observer
  const obsClient = await pool.connect();
  let stopObserver = false;
  const obsInterval = setInterval(async () => {
    if (stopObserver) return;
    await sampleWaitEvents(obsClient, waitStats);
  }, 1200);

  const t0 = performance.now();

  async function workerLoop(workerId) {
    const client = await pool.connect();
    try {
      const pidRes = await client.query('SELECT pg_backend_pid() AS pid');
      workerBackendPids.push({ worker: workerId, pid: pidRes.rows[0].pid });

      while (true) {
        let b = null;
        let bIdx = 0;
        synchronized: {
          if (nextBatchIdx >= batches.length) break;
          bIdx = nextBatchIdx++;
          b = batches[bIdx];
        }

        const rpcT0 = performance.now();
        await client.query('BEGIN');
        try {
          const res = await client.query(
            'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
            [JSON.stringify(b)]
          );
          const r = res.rows[0].result;
          await client.query('ROLLBACK');

          const dur = performance.now() - rpcT0;
          rpcDurations.push(dur);

          if (r && r.ok) {
            totalNew += (r.new_canonical || 0);
            totalMerge += (r.merge_existing || 0);
          } else {
            console.error(`Worker ${workerId} batch ${bIdx} error:`, r);
            errors++;
          }
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          const dur = performance.now() - rpcT0;
          rpcDurations.push(dur);
          console.error(`Worker ${workerId} exception: ${err.message}`);
          errors++;
        }
      }
    } finally {
      client.release();
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, (_, i) => workerLoop(i)));

  stopObserver = true;
  clearInterval(obsInterval);
  obsClient.release();

  const totalWallMs = performance.now() - t0;
  const candSec = Number((candidates.length / (totalWallMs / 1000)).toFixed(2));
  const newRatio = candidates.length > 0 ? (totalNew / candidates.length) : 0.9017;
  const newSec = Number((candSec * newRatio).toFixed(2));

  rpcDurations.sort((a, b) => a - b);
  const p50 = rpcDurations.length > 0 ? Number(rpcDurations[Math.floor(rpcDurations.length * 0.50)].toFixed(1)) : 0;
  const p95 = rpcDurations.length > 0 ? Number(rpcDurations[Math.floor(rpcDurations.length * 0.95)].toFixed(1)) : 0;

  console.log(`✔ Repeat ${repIndex + 1} finished in ${(totalWallMs / 1000).toFixed(2)}s: ${candSec} cand/s | ${newSec} NEW/s | p50: ${p50}ms | p95: ${p95}ms | errors: ${errors}`);

  return {
    repeat: repIndex + 1,
    TOTAL_WALL_SEC: Number((totalWallMs / 1000).toFixed(2)),
    CAND_SEC: candSec,
    NEW_SEC: newSec,
    RPC_COUNT: rpcDurations.length,
    RPC_P50_MS: p50,
    RPC_P95_MS: p95,
    ERRORS: errors,
    WORKER_BACKEND_PIDS: workerBackendPids
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ STAGE 3O-R1: V2 BASELINE RECOVERY & WAIT EVENT HARNESS');
  console.log('================================================================\n');

  const pool = new pg.Pool({
    ...parseDbUrl(),
    max: 10,
    idleTimeoutMillis: 30000
  });

  // 1. Environment Standardization Record
  const envState = await recordEnvironmentState(pool);
  console.log('Pre-Benchmark Environment State:', envState);

  // 2. Load 96,000 deterministic candidates
  const candidates = await loadDeterministicCandidates(SHADOW_OFFSET_START, SHADOW_POPULATION_SIZE);

  // 3. Setup wait stats accumulator
  const waitStats = {
    sample_count: 0,
    categories: {
      DataFileRead: 0,
      BuffileRead: 0,
      Lock: 0,
      transactionid: 0,
      tuple: 0,
      WALWrite: 0,
      WALSync: 0,
      ClientRead: 0,
      ClientWrite: 0,
      ActiveCPU: 0,
      other: 0
    },
    raw_counts: {}
  };

  // 4. Run 3 Repeats
  const repeatResults = [];
  for (let rep = 0; rep < REPEATS; rep++) {
    const res = await runBaselineRepeat(pool, candidates, rep, waitStats);
    repeatResults.push(res);
  }

  // 5. Compute Stats
  const candSecValues = repeatResults.map(r => r.CAND_SEC);
  const newSecValues = repeatResults.map(r => r.NEW_SEC);
  const p50Values = repeatResults.map(r => r.RPC_P50_MS);
  const p95Values = repeatResults.map(r => r.RPC_P95_MS);

  const candStats = computeStats(candSecValues);
  const newStats = computeStats(newSecValues);
  const p50Stats = computeStats(p50Values);
  const p95Stats = computeStats(p95Values);

  // 6. Evaluate Baseline Recovery Gate
  const lowerBound = FROZEN_STAGE3M_MEDIAN * (1 - TOLERANCE_PERCENT);
  const upperBound = FROZEN_STAGE3M_MEDIAN * (1 + TOLERANCE_PERCENT);
  const baselineRecovered = candStats.median >= lowerBound;

  console.log('\n================================================================');
  console.log('BASELINE RECOVERY GATE VERDICT');
  console.log('================================================================');
  console.log(`Frozen Stage3M Target:     ${FROZEN_STAGE3M_MEDIAN} cand/s`);
  console.log(`Acceptance Threshold:      >= ${lowerBound.toFixed(2)} cand/s (±10% tolerance)`);
  console.log(`Recovered V2 Median:       ${candStats.median} cand/s (Min: ${candStats.min}, Max: ${candStats.max}, StdDev: ${candStats.stddev})`);
  console.log(`Recovered NEW/s Median:    ${newStats.median} NEW/s`);
  console.log(`BASELINE_RECOVERED:        ${baselineRecovered ? 'TRUE' : 'FALSE'}\n`);

  // 7. Save Artifacts
  const baselineArtifact = {
    timestamp: new Date().toISOString(),
    stage: 'STAGE3O-R1',
    architecture: 'RESOLVER_V2_3W_2K',
    population_size: SHADOW_POPULATION_SIZE,
    source_offset: SHADOW_OFFSET_START,
    workers: WORKERS,
    batch_size: BATCH_SIZE,
    repeats: repeatResults,
    metrics: {
      CAND_SEC: candStats,
      NEW_SEC: newStats,
      RPC_P50_MS: p50Stats,
      RPC_P95_MS: p95Stats
    },
    gate: {
      FROZEN_STAGE3M_MEDIAN: FROZEN_STAGE3M_MEDIAN,
      TOLERANCE_PERCENT: TOLERANCE_PERCENT * 100,
      ACCEPTANCE_LOWER_BOUND: Number(lowerBound.toFixed(2)),
      BASELINE_RECOVERED: baselineRecovered
    },
    environment_snapshot: envState
  };

  const baselineArtifactPath = path.resolve('reports/atlas/discovery/atlas_stage3o_r1_v2_baseline_recovery_v1.json');
  fs.writeFileSync(baselineArtifactPath, JSON.stringify(baselineArtifact, null, 2));
  console.log(`✔ Baseline Recovery artifact saved: ${baselineArtifactPath}`);

  // Calculate wait event distribution percentages
  const totalObservedEvents = Object.values(waitStats.categories).reduce((a, b) => a + b, 0);
  const categoryPercentages = {};
  for (const [k, v] of Object.entries(waitStats.categories)) {
    categoryPercentages[k] = totalObservedEvents > 0 ? Number(((v / totalObservedEvents) * 100).toFixed(2)) : 0;
  }

  const waitDistributionArtifact = {
    timestamp: new Date().toISOString(),
    stage: 'STAGE3O-R1',
    configuration: 'V2_3W_2K_SUSTAINED_96K',
    WAIT_EVENT_SAMPLE_COUNT: waitStats.sample_count,
    TOTAL_OBSERVED_EVENT_SAMPLES: totalObservedEvents,
    WAIT_EVENT_DISTRIBUTION: categoryPercentages,
    WAIT_EVENT_RAW_COUNTS: waitStats.categories,
    WAIT_EVENT_DETAILED_COUNTS: waitStats.raw_counts,
    PRIMARY_WAIT_EVENT: Object.entries(categoryPercentages).sort((a, b) => b[1] - a[1])[0] || ['None', 0],
    ROW_LOCK_CONTENTION_OBSERVED: (waitStats.categories.transactionid > 0 || waitStats.categories.tuple > 0 || waitStats.categories.Lock > 0),
    WAL_LIMIT_OBSERVED: (waitStats.categories.WALWrite > 0 || waitStats.categories.WALSync > 0)
  };

  const waitArtifactPath = path.resolve('reports/atlas/discovery/atlas_stage3o_r1_wait_event_distribution_v1.json');
  fs.writeFileSync(waitArtifactPath, JSON.stringify(waitDistributionArtifact, null, 2));
  console.log(`✔ Wait Event Distribution artifact saved: ${waitArtifactPath}\n`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
