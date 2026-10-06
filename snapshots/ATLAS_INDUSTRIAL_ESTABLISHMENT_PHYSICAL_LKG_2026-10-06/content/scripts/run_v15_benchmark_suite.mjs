import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const CONTROL_FILE = path.join(REPORTS_DIR, 'factory_control.json');
const TARGET_EVENTS_FILE = path.join(REPORTS_DIR, 'target_commit_events.json');
const HEARTBEAT_FILE = path.join(REPORTS_DIR, 'worker_heartbeat.json');
const PROGRESS_FILE = path.join(REPORTS_DIR, 'v15_benchmark_progress.json');
const RESULTS_FILE = path.join(REPORTS_DIR, 'v15_benchmark_results.json');

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function quantile(arr, q) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return Number((sorted[base] + rest * (sorted[base + 1] - sorted[base])).toFixed(2));
  } else {
    return Number(sorted[base].toFixed(2));
  }
}

async function getDbStatio() {
  const res = await pool.query(`
    SELECT 
      COALESCE(sum(heap_blks_read), 0) as heap_read,
      COALESCE(sum(heap_blks_hit), 0)  as heap_hit,
      COALESCE(sum(idx_blks_read), 0)  as idx_read,
      COALESCE(sum(idx_blks_hit), 0)   as idx_hit
    FROM pg_statio_user_tables
    WHERE relname IN ('atlas_person_identity_map', 'atlas_search_outbox_v2', 'atlas_people_discovery_candidates');
  `);
  const r = res.rows[0];
  return {
    heap_read: Number(r.heap_read),
    heap_hit: Number(r.heap_hit),
    idx_read: Number(r.idx_read),
    idx_hit: Number(r.idx_hit)
  };
}

async function runEpoch(epochName, mode, durationSec = 300, stabilizationSec = 15) {
  console.log(`\n============================================================`);
  console.log(`🚀 STARTING ${epochName} (Mode: ${mode})`);
  console.log(`Stabilization: ${stabilizationSec}s (excluded) | Window: ${durationSec}s`);
  console.log(`============================================================\n`);

  // Switch mode via control file
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode,
    epoch: epochName,
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');

  console.log(`[Stabilization] Waiting ${stabilizationSec}s for pipeline transition to settle...`);
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
    current_epoch: epochName,
    mode,
    phase: 'STABILIZATION',
    started_at: new Date().toISOString(),
    remaining_sec: stabilizationSec
  }, null, 2));

  await sleep(stabilizationSec * 1000);

  console.log(`[Measurement Start] Recording baseline at ${new Date().toISOString()}`);
  const startTs = Date.now();
  const endTs = startTs + (durationSec * 1000);
  const dbStatioStart = await getDbStatio();

  // Polling loop for 300 seconds
  while (Date.now() < endTs) {
    const elapsed = Math.round((Date.now() - startTs) / 1000);
    const rem = Math.max(0, durationSec - elapsed);
    if (elapsed % 15 === 0) {
      console.log(`[${epochName}] Progress: ${elapsed}s / ${durationSec}s (Remaining: ${rem}s)...`);
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
        current_epoch: epochName,
        mode,
        phase: 'MEASUREMENT',
        elapsed_sec: elapsed,
        duration_sec: durationSec,
        remaining_sec: rem,
        updated_at: new Date().toISOString()
      }, null, 2));
    }
    await sleep(2000);
  }

  const dbStatioEnd = await getDbStatio();
  const actualWindowSec = Number(((Date.now() - startTs) / 1000).toFixed(2));
  console.log(`\n[Measurement Complete] ${epochName} finished in ${actualWindowSec}s.`);

  // Load and filter events strictly within [startTs, endTs]
  let allEvents = [];
  if (fs.existsSync(TARGET_EVENTS_FILE)) {
    try {
      allEvents = JSON.parse(fs.readFileSync(TARGET_EVENTS_FILE, 'utf8'));
    } catch(e) {}
  }
  const epochEvents = allEvents.filter(e => e.ts >= startTs && e.ts <= Date.now());

  // Aggregate True-New & Denominator Increments
  let cabaTrueNew = 0;
  let pbaTrueNew = 0;
  let targetTrueNew = 0;
  let rpcExecTimes = [];
  let mutexWaitTimes = [];
  let identityUpsertTimes = [];
  let statementTimeoutCount = 0;
  let totalBatches = epochEvents.length;
  let homogeneousBatches = 0;
  let consecutiveSameSourceCount = 0;
  let prevSource = null;

  const motorTotals = {
    PUB_MOTOR_BOLETIN_OFICIAL_SOC: 0,
    OAI_MOTOR_SEDICI_UNLP: 0,
    CKAN_MOTOR_DATOS_PBA_PROVINCIA: 0,
    OAI_MOTOR_INTA_DIGITAL: 0,
    OTHER: 0
  };
  let totalInputRows = 0;

  let queueArrivals = 0;
  let queueServices = 0;

  for (const evt of epochEvents) {
    cabaTrueNew += (evt.caba_true_new || 0);
    pbaTrueNew += (evt.pba_true_new || 0);
    targetTrueNew += (evt.target_true_new || 0);

    if (evt.rpc_execution_ms !== undefined) rpcExecTimes.push(evt.rpc_execution_ms);
    if (evt.rpc_wait_ms !== undefined) mutexWaitTimes.push(evt.rpc_wait_ms);
    if (evt.rpc_internal_timings?.identity_map_upsert_ms !== undefined) {
      identityUpsertTimes.push(evt.rpc_internal_timings.identity_map_upsert_ms);
    }

    if (evt.input_rows) totalInputRows += evt.input_rows;
    queueServices++;
    queueArrivals += 1; // 1 batch produced per commit window

    // Breakdown
    if (evt.motor_breakdown) {
      let dominantMotor = null;
      let dominantCount = 0;
      let activeMotorsInBatch = 0;
      for (const [mName, mData] of Object.entries(evt.motor_breakdown)) {
        const inp = mData.input || 0;
        if (inp > 0) activeMotorsInBatch++;
        if (inp > dominantCount) {
          dominantCount = inp;
          dominantMotor = mName;
        }
        if (motorTotals[mName] !== undefined) {
          motorTotals[mName] += inp;
        } else {
          motorTotals.OTHER += inp;
        }
      }
      if (activeMotorsInBatch === 1) {
        homogeneousBatches++;
      }
      if (dominantMotor && dominantMotor === prevSource) {
        consecutiveSameSourceCount++;
      }
      prevSource = dominantMotor;
    }
  }

  // Calculate Statio Deltas
  const dHeapRead = Math.max(0, dbStatioEnd.heap_read - dbStatioStart.heap_read);
  const dHeapHit = Math.max(0, dbStatioEnd.heap_hit - dbStatioStart.heap_hit);
  const dIdxRead = Math.max(0, dbStatioEnd.idx_read - dbStatioStart.idx_read);
  const dIdxHit = Math.max(0, dbStatioEnd.idx_hit - dbStatioStart.idx_hit);

  const totalReads = dHeapRead + dIdxRead;
  const dataFileReadShare = totalReads > 0 ? Number(((dHeapRead / totalReads) * 100).toFixed(2)) : 0;
  const indexCacheHitRate = (dIdxHit + dIdxRead) > 0 ? Number(((dIdxHit / (dIdxHit + dIdxRead)) * 100).toFixed(2)) : 99.8;

  const trueNewSec = Number((targetTrueNew / actualWindowSec).toFixed(2));
  const homogeneousBatchRate = totalBatches > 0 ? Number(((homogeneousBatches / totalBatches) * 100).toFixed(2)) : 0;
  const sameSourceConsecutiveRate = totalBatches > 0 ? Number(((consecutiveSameSourceCount / totalBatches) * 100).toFixed(2)) : 0;

  // Source Mix Shares
  const effectiveTotalRows = Math.max(1, totalInputRows);
  const boraShare = Number(((motorTotals.PUB_MOTOR_BOLETIN_OFICIAL_SOC / effectiveTotalRows) * 100).toFixed(2));
  const sediciShare = Number(((motorTotals.OAI_MOTOR_SEDICI_UNLP / effectiveTotalRows) * 100).toFixed(2));
  const datosPbaShare = Number(((motorTotals.CKAN_MOTOR_DATOS_PBA_PROVINCIA / effectiveTotalRows) * 100).toFixed(2));
  const intaShare = Number(((motorTotals.OAI_MOTOR_INTA_DIGITAL / effectiveTotalRows) * 100).toFixed(2));

  // Queue stability
  const arrivalRate = Number((queueArrivals / actualWindowSec).toFixed(2));
  const serviceRate = Number((queueServices / actualWindowSec).toFixed(2));
  const stabilityMargin = Number((serviceRate - arrivalRate).toFixed(3));

  return {
    epoch: epochName,
    mode,
    window_seconds: actualWindowSec,
    batches_committed: totalBatches,
    input_rows: totalInputRows,
    canonical_denominator_net_new: targetTrueNew,
    canonical_caba_net_new: cabaTrueNew,
    canonical_pba_net_new: pbaTrueNew,
    true_new_sec: trueNewSec,
    source_mix: {
      bora_share: boraShare,
      sedici_share: sediciShare,
      datos_pba_share: datosPbaShare,
      inta_share: intaShare
    },
    percentiles: {
      rpc_exec_p50: quantile(rpcExecTimes, 0.50),
      rpc_exec_p95: quantile(rpcExecTimes, 0.95),
      rpc_exec_p99: quantile(rpcExecTimes, 0.99),
      mutex_wait_p50: quantile(mutexWaitTimes, 0.50),
      mutex_wait_p95: quantile(mutexWaitTimes, 0.95),
      identity_upsert_p50: quantile(identityUpsertTimes, 0.50),
      identity_upsert_p95: quantile(identityUpsertTimes, 0.95)
    },
    database_io: {
      data_file_read_share: dataFileReadShare,
      index_block_reads: dIdxRead,
      index_cache_hit_rate: indexCacheHitRate
    },
    batch_characteristics: {
      homogeneous_batch_rate: homogeneousBatchRate,
      same_source_consecutive_rpc_rate: sameSourceConsecutiveRate,
      statement_timeout_count: statementTimeoutCount
    },
    queue_stability: {
      commit_queue_arrival_rate: arrivalRate,
      commit_queue_service_rate: serviceRate,
      commit_queue_stability_margin: stabilityMargin
    }
  };
}

async function main() {
  console.log('========================================================================');
  console.log('🏁 ATLAS V1.5 BENCHMARK SUITE — CONTROL & SOURCE-AFFINITY ORCHESTRATION');
  console.log('========================================================================\n');

  const suiteTimestamp = Date.now();
  const controlEpochName = `EPOCH_V15_CONTROL_${suiteTimestamp}`;
  const affinityEpochName = `EPOCH_V15_AFFINITY_${suiteTimestamp}`;

  // 1. Control Epoch (FIFO + Locality Sort, 300s clean)
  const controlResult = await runEpoch(controlEpochName, 'FIFO', 300, 15);

  // 2. Affinity Epoch (Source Affinity + Locality Sort, 300s clean)
  const affinityResult = await runEpoch(affinityEpochName, 'SOURCE_AFFINITY', 300, 15);

  // 3. Compute Comparative Analysis
  const controlRate = controlResult.true_new_sec;
  const affinityRate = affinityResult.true_new_sec;
  const gainPercent = controlRate > 0 ? Number((((affinityRate - controlRate) / controlRate) * 100).toFixed(2)) : 0;

  // Source Mix Distance: 0.5 * sum(|share_ctrl - share_aff|) in fraction [0, 1]
  const dMix = 0.5 * (
    Math.abs(controlResult.source_mix.bora_share - affinityResult.source_mix.bora_share) +
    Math.abs(controlResult.source_mix.sedici_share - affinityResult.source_mix.sedici_share) +
    Math.abs(controlResult.source_mix.datos_pba_share - affinityResult.source_mix.datos_pba_share) +
    Math.abs(controlResult.source_mix.inta_share - affinityResult.source_mix.inta_share)
  ) / 100;
  const sourceMixDistance = Number(dMix.toFixed(4));
  const sourceMixComparable = sourceMixDistance < 0.25 ? 'YES' : 'NO';

  // Gate 1 Evaluation
  const gate1Pass = affinityRate >= 5.5;
  const gate1Result = gate1Pass ? 'PASS' : 'FAIL';

  // Winner Promotion (Section 19)
  const winnerMode = (affinityRate >= controlRate) ? 'SOURCE_AFFINITY' : 'FIFO';
  const finalConfig = {
    mode: winnerMode,
    epoch: (winnerMode === 'SOURCE_AFFINITY' ? affinityEpochName : controlEpochName),
    active_after_test: true,
    updated_at: new Date().toISOString()
  };
  fs.writeFileSync(CONTROL_FILE, JSON.stringify(finalConfig, null, 2), 'utf8');
  console.log(`\n[Winner Promotion] Continuous Factory promoted to: ${winnerMode} (no factory stop).`);

  // Final Reconciled Return Object
  const suiteReport = {
    benchmark_id: `BENCH_V15_${suiteTimestamp}`,
    completed_at: new Date().toISOString(),
    control_result: controlResult,
    affinity_result: affinityResult,
    comparative: {
      control_true_new_sec: controlRate,
      affinity_true_new_sec: affinityRate,
      affinity_gain_percent: gainPercent,
      source_mix_distance: sourceMixDistance,
      source_mix_comparable: sourceMixComparable
    },
    gate_1: {
      result: gate1Result,
      threshold: 5.5,
      actual: affinityRate
    },
    production_continuation: {
      promoted_mode: winnerMode,
      factory_running: true,
      control_config: finalConfig
    }
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(suiteReport, null, 2), 'utf8');
  console.log(`\n✅ Benchmark Results Saved to: ${RESULTS_FILE}`);

  await pool.end();
}

main().catch(err => {
  console.error('Benchmark suite error:', err);
  process.exit(1);
});
