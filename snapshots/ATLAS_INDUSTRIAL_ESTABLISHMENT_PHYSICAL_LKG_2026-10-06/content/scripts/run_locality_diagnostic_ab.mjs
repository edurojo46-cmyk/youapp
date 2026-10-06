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
const RESULTS_FILE = path.join(REPORTS_DIR, 'v16b_locality_diagnostic_results.json');

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

async function getLiveDenominator() {
  const res = await pool.query(`
    SELECT 
      caba_qualified_unique_real_people,
      pba_qualified_unique_real_people,
      caba_pba_qualified_unique_real_people,
      qualified_unique_real_people,
      unique_people,
      updated_at
    FROM atlas_people_live_metrics
    WHERE id = 'current';
  `);
  const r = res.rows[0];
  return {
    caba: Number(r.caba_qualified_unique_real_people),
    pba: Number(r.pba_qualified_unique_real_people),
    total: Number(r.caba_pba_qualified_unique_real_people),
    unique_people: Number(r.unique_people),
    updated_at: r.updated_at
  };
}

async function getActiveDbLockWaits() {
  const res = await pool.query(`
    SELECT count(*) as lock_wait_count
    FROM pg_stat_activity
    WHERE wait_event_type = 'Lock' AND state != 'idle';
  `);
  return Number(res.rows[0].lock_wait_count || 0);
}

async function runDiagnostic(name, sortLocality, durationSec = 180, stabilizationSec = 15) {
  console.log(`\n============================================================`);
  console.log(`🔬 STARTING ${name} (C2, B100, FIFO, LOCALITY_SORT = ${sortLocality})`);
  console.log(`Stabilization: ${stabilizationSec}s | Window: ${durationSec}s`);
  console.log(`============================================================\n`);

  // Update factory control
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode: 'FIFO',
    concurrency: 2,
    sortLocality: Boolean(sortLocality),
    conflictScheduler: false,
    epoch: `EPOCH_V16B_${name}`,
    active_after_test: true,
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');

  console.log(`[Stabilization] Waiting ${stabilizationSec}s for transition to settle...`);
  await sleep(stabilizationSec * 1000);

  console.log(`[Measurement Start] Recording baseline at ${new Date().toISOString()}`);
  const startTs = Date.now();
  const endTs = startTs + (durationSec * 1000);
  const dbStatioStart = await getDbStatio();
  const denomStart = await getLiveDenominator();

  // Find active task log
  const tasksDir = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\b70f6231-c295-467c-8e9f-83a60304d56c\\.system_generated\\tasks';
  let activeLogPath = null;
  if (fs.existsSync(tasksDir)) {
    const taskLogs = fs.readdirSync(tasksDir).filter(f => f.endsWith('.log') && f.startsWith('task-')).sort().reverse();
    if (taskLogs.length > 0) {
      activeLogPath = path.join(tasksDir, taskLogs[0]);
    }
  }

  let logInitialOffset = 0;
  if (activeLogPath && fs.existsSync(activeLogPath)) {
    logInitialOffset = fs.statSync(activeLogPath).size;
  }

  let statementTimeoutCount = 0;
  let dbLockWaitSamples = [];

  while (Date.now() < endTs) {
    const elapsed = Math.round((Date.now() - startTs) / 1000);
    const rem = Math.max(0, durationSec - elapsed);

    if (elapsed % 5 === 0) {
      try {
        const lockWaits = await getActiveDbLockWaits();
        dbLockWaitSamples.push(lockWaits);
      } catch (e) {}
    }

    if (activeLogPath && fs.existsSync(activeLogPath)) {
      try {
        const curSize = fs.statSync(activeLogPath).size;
        if (curSize > logInitialOffset) {
          const fd = fs.openSync(activeLogPath, 'r');
          const buf = Buffer.alloc(curSize - logInitialOffset);
          fs.readSync(fd, buf, 0, curSize - logInitialOffset, logInitialOffset);
          fs.closeSync(fd);
          const newText = buf.toString('utf8');
          const timeoutMatches = newText.match(/canceling statement due to statement timeout/g);
          statementTimeoutCount = timeoutMatches ? timeoutMatches.length : 0;
        }
      } catch (e) {}
    }

    if (elapsed % 15 === 0) {
      console.log(`[${name}] Elapsed: ${elapsed}s / ${durationSec}s | Timeouts: ${statementTimeoutCount}...`);
    }

    await sleep(2000);
  }

  const dbStatioEnd = await getDbStatio();
  const denomEnd = await getLiveDenominator();
  const actualWindowSec = Number(((Date.now() - startTs) / 1000).toFixed(2));

  // Load events
  let allEvents = [];
  if (fs.existsSync(TARGET_EVENTS_FILE)) {
    try {
      allEvents = JSON.parse(fs.readFileSync(TARGET_EVENTS_FILE, 'utf8'));
    } catch (e) {}
  }
  const epochEvents = allEvents.filter(e => e.ts >= startTs && e.ts <= Date.now());

  let cabaTrueNew = 0;
  let pbaTrueNew = 0;
  let eventTargetTrueNew = 0;
  let rpcExecTimes = [];
  let totalBatches = epochEvents.length;
  let totalInputRows = 0;

  for (const evt of epochEvents) {
    cabaTrueNew += (evt.caba_true_new || 0);
    pbaTrueNew += (evt.pba_true_new || 0);
    eventTargetTrueNew += (evt.caba_true_new || 0) + (evt.pba_true_new || 0);
    if (evt.rpc_execution_ms !== undefined) rpcExecTimes.push(evt.rpc_execution_ms);
    if (evt.input_rows) totalInputRows += evt.input_rows;
  }

  const deltaCanonicalTotal = Math.max(0, denomEnd.total - denomStart.total);
  const contractualTrueNew = deltaCanonicalTotal > 0 ? deltaCanonicalTotal : eventTargetTrueNew;
  const trueNewSec = Number((contractualTrueNew / actualWindowSec).toFixed(2));

  const dHeapRead = Math.max(0, dbStatioEnd.heap_read - dbStatioStart.heap_read);
  const dHeapHit = Math.max(0, dbStatioEnd.heap_hit - dbStatioStart.heap_hit);
  const dIdxRead = Math.max(0, dbStatioEnd.idx_read - dbStatioStart.idx_read);
  const dIdxHit = Math.max(0, dbStatioEnd.idx_hit - dbStatioStart.idx_hit);
  const totalReads = dHeapRead + dIdxRead;
  const dataFileReadShare = totalReads > 0 ? Number(((dHeapRead / totalReads) * 100).toFixed(2)) : 0;
  const indexCacheHitRate = (dIdxHit + dIdxRead) > 0 ? Number(((dIdxHit / (dIdxHit + dIdxRead)) * 100).toFixed(2)) : 99.8;

  return {
    name,
    sort_locality: sortLocality,
    window_sec: actualWindowSec,
    batches_committed: totalBatches,
    input_rows: totalInputRows,
    delta_canonical: deltaCanonicalTotal,
    true_new_sec: trueNewSec,
    timeout_count: statementTimeoutCount,
    rpc_exec_p50: quantile(rpcExecTimes, 0.50),
    rpc_exec_p95: quantile(rpcExecTimes, 0.95),
    rpc_exec_p99: quantile(rpcExecTimes, 0.99),
    db_lock_wait_p50: quantile(dbLockWaitSamples, 0.50),
    db_lock_wait_p95: quantile(dbLockWaitSamples, 0.95),
    data_file_read_share: dataFileReadShare,
    index_cache_hit_rate: indexCacheHitRate
  };
}

async function main() {
  console.log('========================================================================');
  console.log('🔬 ATLAS V1.6B LOCALITY CONTENTION A/B DIAGNOSTIC');
  console.log('========================================================================\n');

  // Experiment A: LOCALITY_SORT = ON
  const expA = await runDiagnostic('LOCALITY_ON', true, 180, 15);
  console.log('\n[Exp A: LOCALITY_ON Results]:', expA);

  // Experiment B: LOCALITY_SORT = OFF
  const expB = await runDiagnostic('LOCALITY_OFF', false, 180, 15);
  console.log('\n[Exp B: LOCALITY_OFF Results]:', expB);

  // Safe fallback to C=1 after diagnostic
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode: 'FIFO',
    concurrency: 1,
    sortLocality: true,
    conflictScheduler: false,
    epoch: 'EPOCH_V16B_SAFE_FALLBACK',
    active_after_test: true,
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');

  const report = {
    completed_at: new Date().toISOString(),
    experiment_a_locality_on: expA,
    experiment_b_locality_off: expB,
    comparison: {
      timeout_delta: expB.timeout_count - expA.timeout_count,
      true_new_ratio: Number((expB.true_new_sec / Math.max(0.1, expA.true_new_sec)).toFixed(2))
    }
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n[Diagnostic Complete] Results saved to:', RESULTS_FILE);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
});
