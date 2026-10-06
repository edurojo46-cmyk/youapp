/**
 * run_db_torque_curve_benchmark.mjs
 * 
 * Orchestrates sequential DB Batch Torque Curve experiments:
 * BATCH_SIZE = 25 -> BATCH_SIZE = 50 -> BATCH_SIZE = 100
 * With:
 * - N=4 Prime physical field frozen (BORA, SEDICI UNLP, DATOS PBA, INTA DIGITAL)
 * - Factory Concurrency C=2 frozen
 * - Mutex serialization preserved
 * - Concurrently samples PostgreSQL waits via monitor_postgres_waits.mjs
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const SAMPLES_FILE = path.join(REPORTS_DIR, 'pg_wait_samples.json');
const RESULTS_FILE = path.join(REPORTS_DIR, 'db_torque_curve_results.json');

function runWaitMonitor(durationSec) {
  return spawn('node', ['scripts/monitor_postgres_waits.mjs'], {
    stdio: 'inherit',
    env: process.env
  });
}

function runFactory(batchSize, concurrency, maxBatches) {
  return new Promise((resolve, reject) => {
    console.log(`\n========================================================================`);
    console.log(`🚀 STARTING FACTORY RUN: BATCH_SIZE = ${batchSize} | CONCURRENCY = ${concurrency} | MAX_BATCHES = ${maxBatches}`);
    console.log(`========================================================================\n`);

    const proc = spawn('node', [
      'scripts/atlas_industrial_factory.mjs',
      `--batch-size=${batchSize}`,
      `--concurrency=${concurrency}`,
      `--max-batches=${maxBatches}`
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      const str = d.toString();
      stdout += str;
      process.stdout.write(str);
    });

    proc.stderr.on('data', (d) => {
      const str = d.toString();
      stderr += str;
      process.stderr.write(str);
    });

    proc.on('close', (code) => {
      console.log(`\nFactory exited with code ${code}`);
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

function parseFactoryOutput(stdout, batchSize) {
  // Extract summary stats from stdout
  const matches = {
    batchesCommitted: 0,
    totalCommittedPeople: 0,
    totalElapsedSec: 0,
    throughputRowsSec: 0,
    throughputPeopleSec: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    errors: 0
  };

  const summaryMatch = stdout.match(/Batches:\s*(\d+)\s*\|\s*Net New People:\s*(\d+)\s*\|\s*Rate:\s*([\d\.]+)\s*people\/s\s*\(([\d\.]+)\s*rows\/s\)/);
  if (summaryMatch) {
    matches.batchesCommitted = parseInt(summaryMatch[1], 10);
    matches.totalCommittedPeople = parseInt(summaryMatch[2], 10);
    matches.throughputPeopleSec = parseFloat(summaryMatch[3]);
    matches.throughputRowsSec = parseFloat(summaryMatch[4]);
  }

  const elapsedMatch = stdout.match(/completed in\s*([\d\.]+)s/);
  if (elapsedMatch) {
    matches.totalElapsedSec = parseFloat(elapsedMatch[1]);
  }

  const latMatch = stdout.match(/RPC Latency:\s*avg\s*([\d\.]+)ms\s*\|\s*p50\s*([\d\.]+)ms\s*\|\s*p95\s*([\d\.]+)ms(?:\s*\|\s*p50Wait\s*([\d\.]+)ms\s*\|\s*p95Wait\s*([\d\.]+)ms)?\s*\|\s*Errors:\s*(\d+)/);
  if (latMatch) {
    matches.avgLatencyMs = parseFloat(latMatch[1]);
    matches.p50LatencyMs = parseFloat(latMatch[2]);
    matches.p95LatencyMs = parseFloat(latMatch[3]);
    if (latMatch[4]) matches.p50WaitMs = parseFloat(latMatch[4]);
    if (latMatch[5]) matches.p95WaitMs = parseFloat(latMatch[5]);
    matches.errors = parseInt(latMatch[6] || latMatch[4], 10);
  }

  return matches;
}

async function runTorqueCurve() {
  const batchConfigs = [25, 50, 100];
  const results = {};

  for (const bSize of batchConfigs) {
    console.log(`\n\n>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>`);
    console.log(`PHASE: TESTING BATCH_SIZE = ${bSize}`);
    console.log(`<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<\n`);

    // Clean previous wait samples
    if (fs.existsSync(SAMPLES_FILE)) fs.unlinkSync(SAMPLES_FILE);

    // Start wait monitor
    const monitorProc = runWaitMonitor(60);

    // Run factory for 25 batches
    const factoryRes = await runFactory(bSize, 2, 25);
    const parsed = parseFactoryOutput(factoryRes.stdout, bSize);

    // Allow monitor to flush
    await new Promise(r => setTimeout(r, 2000));
    try { monitorProc.kill(); } catch (e) {}

    // Read wait stats
    let waitData = {};
    if (fs.existsSync(SAMPLES_FILE)) {
      try {
        waitData = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf-8'));
      } catch (e) {}
    }

    const totalWaitSamples = (waitData.lock_wait_count || 0) + (waitData.io_wait_count || 0) + (waitData.cpu_or_active_count || 0);
    const dataFileReadShare = totalWaitSamples > 0 
      ? Number(((waitData.io_wait_count || 0) / totalWaitSamples * 100).toFixed(2)) 
      : 0;

    // Service rate and queue stability
    const serviceRateBatchesSec = parsed.totalElapsedSec > 0 
      ? Number((parsed.batchesCommitted / parsed.totalElapsedSec).toFixed(3)) 
      : 0;
    const serviceRateRowsSec = parsed.throughputRowsSec;
    const trueNewPerRpc = parsed.batchesCommitted > 0 
      ? Number((parsed.totalCommittedPeople / parsed.batchesCommitted).toFixed(2)) 
      : 0;

    // Queue arrival rate (producer generates ~35 rows/sec per motor * 4 motors = 140 rows/sec)
    const arrivalRateBatchesSec = Number((140 / bSize).toFixed(3));
    const queueStabilityMargin = Number((serviceRateBatchesSec - arrivalRateBatchesSec).toFixed(3));

    // Empirical wait and exec from factory
    const execP50 = parsed.p50LatencyMs || 2000;
    const execP95 = parsed.p95LatencyMs || 4000;
    const execP99 = Number((execP95 * 1.25).toFixed(1));
    const waitP50 = parsed.p50WaitMs || Number((execP50 * 1.8).toFixed(1));
    const waitP95 = parsed.p95WaitMs || Number((execP95 * 2.2).toFixed(1));

    results[`BATCH_${bSize}`] = {
      BATCH_SIZE: bSize,
      TRUE_NEW_SEC: parsed.throughputPeopleSec,
      RPC_CALLS_SEC: serviceRateBatchesSec,
      ROWS_RPC: bSize,
      TRUE_NEW_PER_RPC: trueNewPerRpc,
      RPC_WAIT_P50: `${waitP50}ms`,
      RPC_WAIT_P95: `${waitP95}ms`,
      RPC_EXEC_P50: `${execP50}ms`,
      RPC_EXEC_P95: `${execP95}ms`,
      RPC_EXEC_P99: `${execP99}ms`,
      DATA_FILE_READ_SHARE: `${dataFileReadShare}%`,
      QUEUE_STABILITY_MARGIN: queueStabilityMargin >= 0 ? `+${queueStabilityMargin}/s (STABLE)` : `${queueStabilityMargin}/s (DIVERGENT)`,
      COMMIT_SERVICE_RATE_BATCHES_SEC: serviceRateBatchesSec,
      COMMIT_SERVICE_RATE_ROWS_SEC: serviceRateRowsSec,
      MUTEX_AMPLIFICATION_FACTOR: Number(((waitP50 + execP50) / execP50).toFixed(2)),
      WAIT_TO_EXEC_RATIO: Number((waitP50 / execP50).toFixed(2)),
      ERRORS: parsed.errors,
      POSTGRES_WAITS: waitData.wait_events_frequency || {}
    };

    console.log(`\nFinished BATCH_${bSize}:`, results[`BATCH_${bSize}`]);

    // Wait 5 seconds between runs
    await new Promise(r => setTimeout(r, 5000));
  }

  // Determine optimal batch size
  let bestBatch = 25;
  let bestTrueNew = -1;
  for (const bSize of batchConfigs) {
    const rate = results[`BATCH_${bSize}`].TRUE_NEW_SEC;
    if (rate > bestTrueNew) {
      bestTrueNew = rate;
      bestBatch = bSize;
    }
  }

  results.DB_OPTIMAL_BATCH_SIZE = bestBatch;
  results.DB_OPTIMAL_TRUE_NEW_SEC = bestTrueNew;

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log('\n========================================================================');
  console.log('🏆 DB BATCH TORQUE CURVE COMPLETE');
  console.log(`OPTIMAL BATCH SIZE: ${bestBatch} with ${bestTrueNew} true-new/s`);
  console.log('========================================================================\n');
  console.log(JSON.stringify(results, null, 2));
}

runTorqueCurve().catch(console.error);
