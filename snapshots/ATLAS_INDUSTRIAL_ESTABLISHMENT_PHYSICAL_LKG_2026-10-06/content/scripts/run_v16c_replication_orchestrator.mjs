import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { runConflictForensics } from './analyze_exact_conflict_forensics.mjs';

dotenv.config();

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const CONTROL_FILE = path.join(REPORTS_DIR, 'factory_control.json');
const TARGET_EVENTS_FILE = path.join(REPORTS_DIR, 'target_commit_events.json');
const HEARTBEAT_FILE = path.join(REPORTS_DIR, 'worker_heartbeat.json');
const V16C_REPORT_FILE = path.join(REPORTS_DIR, 'v16c_benchmark_results.json');

const pool = new pg.Pool({ ...parseDbUrl(), max: 3 });

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

async function getCanonicalDenominator() {
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
    qualified_unique_real_people: Number(r.qualified_unique_real_people),
    updated_at: r.updated_at
  };
}

async function getActiveDbLockWaits() {
  const res = await pool.query(`
    SELECT count(*) as lock_wait_count
    FROM pg_stat_activity
    WHERE wait_event_type = 'Lock' AND state != 'idle';
  `);
  return Number(res.rows[0]?.lock_wait_count || 0);
}

function getActiveLogPath() {
  const tasksDir = 'C:\\Users\\Eduardo\\.gemini\antigravity-ide\\brain\\b70f6231-c295-467c-8e9f-83a60304d56c\\.system_generated\\tasks';
  if (fs.existsSync(tasksDir)) {
    const taskLogs = fs.readdirSync(tasksDir).filter(f => f.endsWith('.log') && f.startsWith('task-')).sort().reverse();
    if (taskLogs.length > 0) {
      return path.join(tasksDir, taskLogs[0]);
    }
  }
  return null;
}

/**
 * Execute a clean measurement window with stabilization.
 */
async function measureWindow(options) {
  const {
    name,
    concurrency,
    durationSec,
    stabilizationSec = 15,
    sortLocality = true,
    exactConflictScheduler = true
  } = options;

  console.log(`\n========================================================================`);
  console.log(`🧪 RUNNING WINDOW: ${name} (C=${concurrency}, B=100, STABILIZATION=${stabilizationSec}s, DURATION=${durationSec}s)`);
  console.log(`========================================================================`);

  // Update factory control
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode: 'FIFO',
    concurrency,
    sortLocality: Boolean(sortLocality),
    conflictScheduler: Boolean(exactConflictScheduler),
    epoch: `EPOCH_V16C_${name}`,
    active_after_test: true,
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');

  if (stabilizationSec > 0) {
    console.log(`[Stabilization] Settling for ${stabilizationSec}s...`);
    await sleep(stabilizationSec * 1000);
  }

  const activeLogPath = getActiveLogPath();
  let logInitialOffset = 0;
  if (activeLogPath && fs.existsSync(activeLogPath)) {
    logInitialOffset = fs.statSync(activeLogPath).size;
  }

  const startTs = Date.now();
  const endTs = startTs + (durationSec * 1000);
  const denomStart = await getCanonicalDenominator();

  console.log(`[Start Baseline] CANONICAL_DENOMINATOR_START = ${denomStart.total} (CABA: ${denomStart.caba}, PBA: ${denomStart.pba})`);

  let statementTimeoutCount = 0;
  let retryCount = 0;
  let correctnessErrors = 0;
  let dbLockWaitSamples = [];

  while (Date.now() < endTs) {
    await sleep(2500);
    const elapsed = Math.round((Date.now() - startTs) / 1000);

    // Sample lock waits
    try {
      const lw = await getActiveDbLockWaits();
      dbLockWaitSamples.push(lw);
    } catch(e) {}

    // Sample active log for timeouts or retries
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

          const retryMatches = newText.match(/Attempt \d\/5 error/g);
          retryCount = retryMatches ? retryMatches.length : 0;

          const errorMatches = newText.match(/RPC temporary failure|VIOLATION OF CONTRACT/g);
          correctnessErrors = errorMatches ? errorMatches.length : 0;
        }
      } catch(e) {}
    }

    if (elapsed % 15 === 0) {
      console.log(`[Progress ${elapsed}s / ${durationSec}s] Timeouts: ${statementTimeoutCount} | Retries: ${retryCount} | LockWaits: ${dbLockWaitSamples[dbLockWaitSamples.length - 1] || 0}`);
    }
  }

  const denomEnd = await getCanonicalDenominator();
  const actualWindowSec = Number(((Date.now() - startTs) / 1000).toFixed(2));
  const canonicalDelta = Math.max(0, denomEnd.total - denomStart.total);
  const canonicalTrueNewSec = Number((canonicalDelta / actualWindowSec).toFixed(2));

  console.log(`[End State] CANONICAL_DENOMINATOR_END = ${denomEnd.total} | DELTA = ${canonicalDelta} in ${actualWindowSec}s => ${canonicalTrueNewSec} true-new/s`);

  // Analyze events committed in this window
  let windowEvents = [];
  if (fs.existsSync(TARGET_EVENTS_FILE)) {
    try {
      const allEvents = JSON.parse(fs.readFileSync(TARGET_EVENTS_FILE, 'utf8'));
      windowEvents = allEvents.filter(e => e.ts >= startTs && e.ts <= (endTs + 2000));
    } catch(e) {}
  }

  const rpcLatencies = windowEvents.map(e => e.rpc_execution_ms).filter(n => typeof n === 'number' && !isNaN(n));
  const rpcP50 = quantile(rpcLatencies, 0.50);
  const rpcP95 = quantile(rpcLatencies, 0.95);
  const rpcP99 = quantile(rpcLatencies, 0.99);

  const totalInputRows = windowEvents.reduce((acc, e) => acc + (e.input_rows || 100), 0);
  const totalBatches = windowEvents.length;
  const rowsCommittedSec = Number((totalInputRows / actualWindowSec).toFixed(2));
  const trueNewYield = totalInputRows > 0 ? Number(((canonicalDelta / totalInputRows) * 100).toFixed(2)) : 0.00;
  const rowsPerTrueNew = canonicalDelta > 0 ? Number((totalInputRows / canonicalDelta).toFixed(2)) : 0.00;

  // Source mix breakdown
  const motorTotals = {
    PUB_MOTOR_BOLETIN_OFICIAL_SOC: 0,
    OAI_MOTOR_SEDICI_UNLP: 0,
    CKAN_MOTOR_DATOS_PBA_PROVINCIA: 0,
    OAI_MOTOR_INTA_DIGITAL: 0
  };

  for (const e of windowEvents) {
    if (e.motor_breakdown) {
      for (const [mId, mStat] of Object.entries(e.motor_breakdown)) {
        if (motorTotals[mId] !== undefined) {
          motorTotals[mId] += (mStat.input || 0);
        }
      }
    }
  }

  const effectiveTotal = Math.max(1, totalInputRows);
  const boraShare = Number(((motorTotals.PUB_MOTOR_BOLETIN_OFICIAL_SOC / effectiveTotal) * 100).toFixed(2));
  const sediciShare = Number(((motorTotals.OAI_MOTOR_SEDICI_UNLP / effectiveTotal) * 100).toFixed(2));
  const datosPbaShare = Number(((motorTotals.CKAN_MOTOR_DATOS_PBA_PROVINCIA / effectiveTotal) * 100).toFixed(2));
  const intaShare = Number(((motorTotals.OAI_MOTOR_INTA_DIGITAL / effectiveTotal) * 100).toFixed(2));

  // Read heartbeat telemetry for scheduler and pre-dedupe stats
  let hbStats = null;
  if (fs.existsSync(HEARTBEAT_FILE)) {
    try {
      hbStats = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
    } catch(e) {}
  }

  return {
    name,
    concurrency,
    actualWindowSec,
    startTs,
    endTs,
    canonicalDenominatorStart: denomStart.total,
    canonicalDenominatorEnd: denomEnd.total,
    canonicalDelta,
    canonicalTrueNewSec,
    totalInputRows,
    totalBatches,
    rowsCommittedSec,
    trueNewYield,
    rowsPerTrueNew,
    initialTimeouts: statementTimeoutCount,
    retries: retryCount,
    correctnessErrors,
    dbLockWaitsP50: quantile(dbLockWaitSamples, 0.50),
    dbLockWaitsMax: Math.max(0, ...dbLockWaitSamples),
    rpcP50,
    rpcP95,
    rpcP99,
    sourceMix: {
      boraShare,
      sediciShare,
      datosPbaShare,
      intaShare
    },
    exactSchedulerStats: hbStats?.exact_scheduler_stats || null,
    preDedupeStats: hbStats?.pre_dedupe_stats || null,
    rowClassificationStats: hbStats?.row_classification_stats || null,
    readyBufferDepth: hbStats?.source_rows_remaining || 0
  };
}

async function runFullReplicationSuite() {
  console.log('########################################################################');
  console.log('🚀 ATLAS — V1.6C EXACT IDENTITY CONFLICT ROUTING BENCHMARK SUITE');
  console.log('########################################################################\n');

  // STEP 1: C1 Baseline (120s, Section 12)
  console.log('>>> STEP 1: Measuring Safe Production C1 Baseline (120s)...');
  const c1Result = await measureWindow({
    name: 'C1_BASELINE',
    concurrency: 1,
    durationSec: 120,
    stabilizationSec: 5,
    sortLocality: true,
    exactConflictScheduler: true
  });

  console.log(`\n[C1 Baseline Results]:`);
  console.log(`C1_TRUE_NEW_SEC = ${c1Result.canonicalTrueNewSec}`);
  console.log(`C1_ROWS_SEC = ${c1Result.rowsCommittedSec}`);
  console.log(`C1_TRUE_NEW_YIELD = ${c1Result.trueNewYield}%`);
  console.log(`C1_ROWS_PER_TRUE_NEW = ${c1Result.rowsPerTrueNew}`);

  // STEP 2: C2 Replication (3x 300s, Section 13)
  console.log('\n>>> STEP 2: Running 3x 300s Replicated C2 Windows with Exact Scheduler...');
  const c2Runs = [];
  for (let runIdx = 1; runIdx <= 3; runIdx++) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`Starting C2 Replicated Run ${runIdx} of 3 (15s stabilization + 300s clean window)...`);
    console.log(`------------------------------------------------------------`);
    const res = await measureWindow({
      name: `C2_REPLICATED_RUN_${runIdx}`,
      concurrency: 2,
      durationSec: 300,
      stabilizationSec: 15,
      sortLocality: true,
      exactConflictScheduler: true
    });
    c2Runs.push(res);
  }

  // Calculate C2 Replicated Metrics
  const rates = c2Runs.map(r => r.canonicalTrueNewSec);
  const run1Rate = rates[0];
  const run2Rate = rates[1];
  const run3Rate = rates[2];
  const meanRate = Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2));
  const minRate = Number(Math.min(...rates).toFixed(2));
  const maxRate = Number(Math.max(...rates).toFixed(2));

  // Sample Standard Deviation
  const variance = rates.reduce((acc, r) => acc + Math.pow(r - meanRate, 2), 0) / (rates.length - 1);
  const stddevRate = Number(Math.sqrt(variance).toFixed(2));

  const totalTimeoutsC2 = c2Runs.reduce((acc, r) => acc + r.initialTimeouts, 0);
  const totalErrorsC2 = c2Runs.reduce((acc, r) => acc + r.correctnessErrors, 0);
  const avgRowsPerTrueNewC2 = Number((c2Runs.reduce((acc, r) => acc + r.rowsPerTrueNew, 0) / c2Runs.length).toFixed(2));

  // Compute Max Source Mix Distance across the 3 runs
  function mixDist(a, b) {
    return Math.sqrt(
      Math.pow(a.boraShare - b.boraShare, 2) +
      Math.pow(a.sediciShare - b.sediciShare, 2) +
      Math.pow(a.datosPbaShare - b.datosPbaShare, 2) +
      Math.pow(a.intaShare - b.intaShare, 2)
    );
  }
  const d12 = mixDist(c2Runs[0].sourceMix, c2Runs[1].sourceMix);
  const d23 = mixDist(c2Runs[1].sourceMix, c2Runs[2].sourceMix);
  const d13 = mixDist(c2Runs[0].sourceMix, c2Runs[2].sourceMix);
  const maxMixDistC2 = Number(Math.max(d12, d23, d13).toFixed(2));

  const c2Passed = (totalTimeoutsC2 === 0 && totalErrorsC2 === 0 && minRate >= 7.5);
  const c2GateStatus = c2Passed ? 'PASS' : 'FAIL';

  console.log(`\n============================================================`);
  console.log(`📊 C2 REPLICATION SUMMARY:`);
  console.log(`RUN1 = ${run1Rate}/s | RUN2 = ${run2Rate}/s | RUN3 = ${run3Rate}/s`);
  console.log(`MEAN = ${meanRate}/s | MIN = ${minRate}/s | MAX = ${maxRate}/s | STDDEV = ${stddevRate}`);
  console.log(`TOTAL_INITIAL_TIMEOUTS = ${totalTimeoutsC2} | ERRORS = ${totalErrorsC2}`);
  console.log(`C2_REPLICATION_GATE = ${c2GateStatus}`);
  console.log(`============================================================\n`);

  let c3Status = 'NOT_EXECUTED';
  let c3TrueNewSec = 0;
  let c3Timeouts = 0;
  let engineeringGate = 'FAIL';
  let currentGate10 = 'FAIL';
  let gate10Rate = 0;
  let bestSafeConcurrency = 1;
  let bestSafeTrueNewSec = c1Result.canonicalTrueNewSec;

  if (c2Passed) {
    bestSafeConcurrency = 2;
    bestSafeTrueNewSec = meanRate;

    // STEP 3: C3 Conditional Escalation (Section 16)
    console.log('>>> STEP 3: C2 Certified. Escalating to C3 (concurrency: 3, 15s stabilization + 300s window)...');
    const c3Result = await measureWindow({
      name: 'C3_ESCALATION',
      concurrency: 3,
      durationSec: 300,
      stabilizationSec: 15,
      sortLocality: true,
      exactConflictScheduler: true
    });

    c3TrueNewSec = c3Result.canonicalTrueNewSec;
    c3Timeouts = c3Result.initialTimeouts;

    if (c3Result.initialTimeouts === 0 && c3Result.correctnessErrors === 0 && c3Result.canonicalTrueNewSec >= 10.0) {
      c3Status = 'PASS';
      engineeringGate = 'PASS';
      bestSafeConcurrency = 3;
      bestSafeTrueNewSec = c3Result.canonicalTrueNewSec;

      // STEP 4: 900s Gate10 Certification (Section 17)
      console.log('\n>>> STEP 4: Promoting C3 and Running 900s Gate10 Certification...');
      const gate10Result = await measureWindow({
        name: 'GATE10_15M_CERTIFICATION',
        concurrency: 3,
        durationSec: 900,
        stabilizationSec: 0,
        sortLocality: true,
        exactConflictScheduler: true
      });

      gate10Rate = gate10Result.canonicalTrueNewSec;
      if (gate10Result.canonicalDelta >= 9000 && gate10Result.initialTimeouts === 0) {
        currentGate10 = 'PASS';
      } else {
        currentGate10 = 'FAIL';
      }
    } else {
      c3Status = 'FAIL';
      engineeringGate = 'FAIL';
      console.warn(`[C3 Escalation Failed] Rate: ${c3Result.canonicalTrueNewSec}/s, Timeouts: ${c3Result.initialTimeouts}`);
    }
  } else {
    c3Status = 'SKIPPED_C2_FAILED_GATE';
    console.warn(`[C3 Skipped] C2 Replication Gate was not met (minRate ${minRate} < 7.5 or timeouts occurred).`);
  }

  // STEP 5: Safe Production Fallback (Section 18)
  console.log(`\n>>> Restoring Safe Continuous Production Config (C=${bestSafeConcurrency})...`);
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode: 'FIFO',
    concurrency: bestSafeConcurrency,
    sortLocality: true,
    conflictScheduler: true,
    epoch: 'EPOCH_V16C_CERTIFIED_PRODUCTION',
    active_after_test: true,
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');

  // Read latest heartbeat stats
  let finalHb = null;
  if (fs.existsSync(HEARTBEAT_FILE)) {
    try {
      finalHb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
    } catch(e) {}
  }

  let forensicsReport = null;
  try {
    forensicsReport = runConflictForensics();
  } catch(e) {
    console.error('Forensics execution error:', e);
  }

  const finalReport = {
    completed_at: new Date().toISOString(),
    c1Result,
    c2Runs,
    c2_summary: {
      run1Rate,
      run2Rate,
      run3Rate,
      meanRate,
      minRate,
      maxRate,
      stddevRate,
      totalTimeouts: totalTimeoutsC2,
      totalErrors: totalErrorsC2,
      gateStatus: c2GateStatus,
      maxMixDist: maxMixDistC2,
      avgRowsPerTrueNew: avgRowsPerTrueNewC2
    },
    c3Status,
    c3TrueNewSec,
    c3Timeouts,
    bestSafeConcurrency,
    bestSafeTrueNewSec,
    engineeringGate,
    currentGate10,
    gate10Rate,
    finalHeartbeat: finalHb,
    forensics: forensicsReport
  };

  fs.writeFileSync(V16C_REPORT_FILE, JSON.stringify(finalReport, null, 2), 'utf8');
  console.log(`[V1.6C Benchmark Report Persisted]: ${V16C_REPORT_FILE}`);

  await pool.end();
  return finalReport;
}

runFullReplicationSuite().catch(err => {
  console.error('Fatal Benchmark Error:', err);
  process.exit(1);
});
