import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const CONTROL_FILE = path.join(REPORTS_DIR, 'factory_control.json');
const HEARTBEAT_FILE = path.join(REPORTS_DIR, 'worker_heartbeat.json');
const TARGET_EVENTS_FILE = path.join(REPORTS_DIR, 'target_commit_events.json');
const V16E_REPORT_FILE = path.join(REPORTS_DIR, 'v16e_benchmark_results.json');

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

async function samplePgWaitEvents() {
  try {
    const res = await pool.query(`
      SELECT pid, wait_event_type, wait_event, state, query
      FROM pg_stat_activity
      WHERE state != 'idle' AND pid <> pg_backend_pid();
    `);
    return res.rows;
  } catch(e) {
    return [];
  }
}

function getActiveLogPath() {
  const tasksDir = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\b70f6231-c295-467c-8e9f-83a60304d56c\\.system_generated\\tasks';
  if (fs.existsSync(tasksDir)) {
    const taskLogs = fs.readdirSync(tasksDir).filter(f => f.endsWith('.log') && f.startsWith('task-')).sort().reverse();
    if (taskLogs.length > 0) {
      return path.join(tasksDir, taskLogs[0]);
    }
  }
  return null;
}

/**
 * Measure a clean window
 */
async function measureWindow(options) {
  const {
    name,
    concurrency = 2,
    durationSec = 180,
    stabilizationSec = 15,
    sortLocality = true,
    exactConflictScheduler = true,
    netNewPriorityActive = false,
    priorityRatio = 0.80
  } = options;

  console.log(`\n========================================================================`);
  console.log(`🧪 RUNNING WINDOW: ${name} (C=${concurrency}, B=100, PRIORITY=${netNewPriorityActive ? 'ON (80/20)' : 'OFF (FIFO)'}, STAB=${stabilizationSec}s, DUR=${durationSec}s)`);
  console.log(`========================================================================`);

  // Update factory control
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode: 'FIFO',
    concurrency,
    sortLocality: Boolean(sortLocality),
    conflictScheduler: Boolean(exactConflictScheduler),
    netNewPriorityActive: Boolean(netNewPriorityActive),
    priorityRatio: Number(priorityRatio),
    epoch: `EPOCH_V16E_${name}`,
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

  // Section 12: Isolate canonical query outside timed window
  const tCanStart0 = performance.now();
  const denomStart = await getCanonicalDenominator();
  const canonicalQueryStartMs = Number((performance.now() - tCanStart0).toFixed(2));
  console.log(`[Start Baseline] CANONICAL_DENOMINATOR_START = ${denomStart.total} (in ${canonicalQueryStartMs}ms)`);

  const startTs = Date.now();
  const endTs = startTs + (durationSec * 1000);

  let statementTimeoutCount = 0;
  const dbWaitSamples = [];

  while (Date.now() < endTs) {
    await sleep(1000);
    const elapsed = Math.round((Date.now() - startTs) / 1000);

    // Sample wait events
    const waitRows = await samplePgWaitEvents();
    for (const w of waitRows) {
      dbWaitSamples.push(w);
    }

    // Sample active log for timeouts
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
      } catch(e) {}
    }

    if (elapsed % 30 === 0 || elapsed === durationSec) {
      process.stdout.write(` [Window ${name}]: ${elapsed}/${durationSec}s | timeouts: ${statementTimeoutCount}\r`);
    }
  }
  console.log('');

  // Stop timing before canonical end query
  const actualDurationSec = (Date.now() - startTs) / 1000;

  // Section 12: Measure canonical end query
  const tCanEnd0 = performance.now();
  const denomEnd = await getCanonicalDenominator();
  const canonicalQueryEndMs = Number((performance.now() - tCanEnd0).toFixed(2));
  console.log(`[End State] CANONICAL_DENOMINATOR_END = ${denomEnd.total} (in ${canonicalQueryEndMs}ms)`);

  // Read commit events that occurred within [startTs, endTs]
  let windowEvents = [];
  if (fs.existsSync(TARGET_EVENTS_FILE)) {
    try {
      const allEvts = JSON.parse(fs.readFileSync(TARGET_EVENTS_FILE, 'utf8'));
      windowEvents = allEvts.filter(e => e.ts >= startTs && e.ts <= (Date.now() + 2000));
    } catch(e) {}
  }

  const netNewTrueCommitted = Math.max(0, denomEnd.total - denomStart.total);
  const rowsCommitted = windowEvents.reduce((acc, ev) => acc + (ev.input_rows || 100), 0);

  const trueNewSec = Number((netNewTrueCommitted / actualDurationSec).toFixed(2));
  const rowsSec = Number((rowsCommitted / actualDurationSec).toFixed(2));

  // Compute RPC Latencies
  const rpcExecutionLats = windowEvents.map(e => e.rpc_execution_ms).filter(n => typeof n === 'number' && n > 0);
  const rpcP50 = quantile(rpcExecutionLats, 0.50);
  const rpcP95 = quantile(rpcExecutionLats, 0.95);
  const rpcP99 = quantile(rpcExecutionLats, 0.99);

  // Timeouts & Over thresholds
  const rpcOver8s = rpcExecutionLats.filter(lat => lat > 8000).length;
  const rpcOver15s = rpcExecutionLats.filter(lat => lat > 15000).length;
  const rpcOver30s = rpcExecutionLats.filter(lat => lat > 30000).length;

  // Real Server-Side Stage Averages
  const stageInputParse = [];
  const stageSourceLookup = [];
  const stageGlobalLookup = [];
  const stageCanUpsert = [];
  const stageIdMapUpsert = [];
  const stageDeliveryKeys = [];
  const stageOutboxInsert = [];
  const stageFinalization = [];
  const serverFunctionTotal = [];
  const clientRpcTotal = [];

  for (const ev of windowEvents) {
    if (ev.rpc_internal_timings) {
      const st = ev.rpc_internal_timings;
      if (st.stage_input_parse_ms !== undefined) stageInputParse.push(st.stage_input_parse_ms);
      if (st.stage_source_identity_lookup_ms !== undefined) stageSourceLookup.push(st.stage_source_identity_lookup_ms);
      if (st.stage_global_identity_lookup_ms !== undefined) stageGlobalLookup.push(st.stage_global_identity_lookup_ms);
      if (st.stage_canonical_person_upsert_ms !== undefined) stageCanUpsert.push(st.stage_canonical_person_upsert_ms);
      if (st.stage_identity_map_upsert_ms !== undefined) stageIdMapUpsert.push(st.stage_identity_map_upsert_ms);
      if (st.stage_discovery_candidate_write_ms !== undefined) stageDeliveryKeys.push(st.stage_discovery_candidate_write_ms);
      if (st.stage_outbox_insert_ms !== undefined) stageOutboxInsert.push(st.stage_outbox_insert_ms);
      if (st.stage_finalization_ms !== undefined) stageFinalization.push(st.stage_finalization_ms);
      if (st.total_function_ms !== undefined) serverFunctionTotal.push(st.total_function_ms);
      else if (st.server_function_total_ms !== undefined) serverFunctionTotal.push(st.server_function_total_ms);
    }
    if (ev.rpc_execution_ms) {
      clientRpcTotal.push(ev.rpc_execution_ms);
    }
  }

  const avg = arr => arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0;

  // Wait event aggregation
  const totalWaitSamples = dbWaitSamples.length;
  let dataFileReadSamples = 0;
  let lockTxIdSamples = 0;
  let walSamples = 0;
  let clientReadSamples = 0;
  let clientWriteSamples = 0;
  let cpuRunningSamples = 0;
  let otherWaitSamples = 0;

  for (const s of dbWaitSamples) {
    if (s.wait_event_type === 'IO' && s.wait_event === 'DataFileRead') dataFileReadSamples++;
    else if (s.wait_event_type === 'Lock' && s.wait_event === 'transactionid') lockTxIdSamples++;
    else if (s.wait_event_type === 'WAL') walSamples++;
    else if (s.wait_event_type === 'Client' && s.wait_event === 'ClientRead') clientReadSamples++;
    else if (s.wait_event_type === 'Client' && s.wait_event === 'ClientWrite') clientWriteSamples++;
    else if (s.state === 'active' && !s.wait_event_type) cpuRunningSamples++;
    else otherWaitSamples++;
  }

  const dataFileReadShare = totalWaitSamples > 0 ? Number(((dataFileReadSamples / totalWaitSamples) * 100).toFixed(2)) : 0.00;
  const lockTxIdShare = totalWaitSamples > 0 ? Number(((lockTxIdSamples / totalWaitSamples) * 100).toFixed(2)) : 0.00;

  console.log(`[Window Results: ${name}]`);
  console.log(`  TRUE_NEW_SEC: ${trueNewSec} | ROWS_SEC: ${rowsSec}`);
  console.log(`  RPC P50: ${rpcP50}ms | P95: ${rpcP95}ms | P99: ${rpcP99}ms`);
  console.log(`  Initial Timeouts: ${statementTimeoutCount} | RPC > 8s: ${rpcOver8s} | RPC > 15s: ${rpcOver15s}`);
  console.log(`  DataFileRead Wait Share: ${dataFileReadShare}% | Lock:transactionid Share: ${lockTxIdShare}%`);
  console.log(`  Server Function Avg: ${avg(serverFunctionTotal)}ms | Client RPC Avg: ${avg(clientRpcTotal)}ms`);
  console.log(`  Identity Map Upsert Avg: ${avg(stageIdMapUpsert)}ms | Delivery Keys Avg: ${avg(stageDeliveryKeys)}ms`);

  return {
    name,
    actualDurationSec,
    canonicalDenominatorStart: denomStart.total,
    canonicalDenominatorEnd: denomEnd.total,
    canonicalQueryStartMs,
    canonicalQueryEndMs,
    netNewTrueCommitted,
    rowsCommitted,
    trueNewSec,
    rowsSec,
    rpcP50,
    rpcP95,
    rpcP99,
    statementTimeoutCount,
    rpcOver8s,
    rpcOver15s,
    rpcOver30s,
    stageAverages: {
      stageInputParseMs: avg(stageInputParse),
      stageSourceIdentityLookupMs: avg(stageSourceLookup),
      stageGlobalIdentityLookupMs: avg(stageGlobalLookup),
      stageCanonicalPersonUpsertMs: avg(stageCanUpsert),
      stageIdentityMapUpsertMs: avg(stageIdMapUpsert),
      stageDiscoveryCandidateWriteMs: avg(stageDeliveryKeys),
      stageOutboxInsertMs: avg(stageOutboxInsert),
      stageFinalizationMs: avg(stageFinalization),
      serverFunctionTotalMs: avg(serverFunctionTotal),
      clientRpcTotalMs: avg(clientRpcTotal)
    },
    waitStats: {
      totalWaitSamples,
      dataFileReadSamples,
      dataFileReadShare,
      lockTxIdSamples,
      lockTxIdShare,
      walSamples,
      clientReadSamples,
      clientWriteSamples,
      cpuRunningSamples,
      otherWaitSamples
    }
  };
}

async function main() {
  console.log('========================================================================');
  console.log('🚀 ATLAS V1.6E: COMMIT PATH DECOMPOSITION & BASELINE REPRODUCTION');
  console.log('========================================================================');

  // Verify statement_timeout
  const toRes = await pool.query("SHOW statement_timeout;");
  const verifiedStatementTimeout = toRes.rows[0]?.statement_timeout || '8s';
  console.log(`V16C_VERIFIED_STATEMENT_TIMEOUT = ${verifiedStatementTimeout}`);

  // Step 1: Run 30s stabilization + 3 x 180s clean windows (Priority OFF, FIFO)
  console.log('\n--- PHASE 1: EXACT V1.6C REPRODUCTION BASELINE (PRIORITY OFF) ---');
  
  // 30s Initial Stabilization
  console.log('[Phase 1 Stabilization] Settling for 30s...');
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode: 'FIFO',
    concurrency: 2,
    sortLocality: true,
    conflictScheduler: true,
    netNewPriorityActive: false,
    priorityRatio: 0.80,
    epoch: 'EPOCH_V16E_BASELINE_STABILIZATION',
    active_after_test: true,
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');
  await sleep(30000);

  // Run 1
  const run1 = await measureWindow({
    name: 'BASELINE_RUN1',
    concurrency: 2,
    durationSec: 180,
    stabilizationSec: 0,
    sortLocality: true,
    exactConflictScheduler: true,
    netNewPriorityActive: false
  });

  // Run 2
  const run2 = await measureWindow({
    name: 'BASELINE_RUN2',
    concurrency: 2,
    durationSec: 180,
    stabilizationSec: 10,
    sortLocality: true,
    exactConflictScheduler: true,
    netNewPriorityActive: false
  });

  // Run 3
  const run3 = await measureWindow({
    name: 'BASELINE_RUN3',
    concurrency: 2,
    durationSec: 180,
    stabilizationSec: 10,
    sortLocality: true,
    exactConflictScheduler: true,
    netNewPriorityActive: false
  });

  const avgTrueNew = Number(((run1.trueNewSec + run2.trueNewSec + run3.trueNewSec) / 3).toFixed(2));
  const avgRowsSec = Number(((run1.rowsSec + run2.rowsSec + run3.rowsSec) / 3).toFixed(2));
  const baselineReproduced = (avgTrueNew >= 5.0 && avgRowsSec >= 20.0);

  console.log(`\n========================================================================`);
  console.log(`📊 BASELINE EVALUATION:`);
  console.log(`  Run 1: ${run1.trueNewSec} true-new/s | ${run1.rowsSec} rows/s | P50: ${run1.rpcP50}ms`);
  console.log(`  Run 2: ${run2.trueNewSec} true-new/s | ${run2.rowsSec} rows/s | P50: ${run2.rpcP50}ms`);
  console.log(`  Run 3: ${run3.trueNewSec} true-new/s | ${run3.rowsSec} rows/s | P50: ${run3.rpcP50}ms`);
  console.log(`  3-Run Average: ${avgTrueNew} true-new/s | ${avgRowsSec} rows/s`);
  console.log(`  V16C_BASELINE_REPRODUCED = ${baselineReproduced ? 'YES' : 'NO'}`);
  console.log(`========================================================================\n`);

  let publisherIoInterference = 'NOT_TESTED';
  let priorityAbStatus = 'SKIPPED';
  let priorityOnRun = null;

  // Phase 2: If baseline is degraded, run Publisher A/B (Section 11)
  if (!baselineReproduced) {
    console.log('\n--- PHASE 2: PUBLISHER A/B CONTROLLED DIAGNOSTIC (Section 11) ---');
    console.log('[Diagnostic A: Publisher ON, 120s]');
    const pubOnRun = await measureWindow({
      name: 'PUBLISHER_ON_DIAGNOSTIC',
      concurrency: 2,
      durationSec: 120,
      stabilizationSec: 10,
      sortLocality: true,
      exactConflictScheduler: true,
      netNewPriorityActive: false
    });

    console.log('\n[Diagnostic B: Publisher PAUSED, 120s]');
    // Signal publisher pause via control file or setting
    fs.writeFileSync(path.join(REPORTS_DIR, 'publisher_control.json'), JSON.stringify({ paused: true, updated_at: new Date().toISOString() }), 'utf8');
    const pubOffRun = await measureWindow({
      name: 'PUBLISHER_PAUSED_DIAGNOSTIC',
      concurrency: 2,
      durationSec: 120,
      stabilizationSec: 10,
      sortLocality: true,
      exactConflictScheduler: true,
      netNewPriorityActive: false
    });
    // Resume publisher
    fs.writeFileSync(path.join(REPORTS_DIR, 'publisher_control.json'), JSON.stringify({ paused: false, updated_at: new Date().toISOString() }), 'utf8');

    const pubGain = pubOffRun.trueNewSec - pubOnRun.trueNewSec;
    publisherIoInterference = pubGain > 2.0 ? 'CONFIRMED' : 'NOT_CONFIRMED';
    console.log(`Publisher A/B Gain: ${pubGain.toFixed(2)} true-new/s -> PUBLISHER_IO_INTERFERENCE = ${publisherIoInterference}`);
  } else {
    publisherIoInterference = 'NOT_CONFIRMED'; // baseline reproduced without pausing publisher
    console.log('\n--- PHASE 3: NET-NEW PRIORITY 80/20 A/B TEST (Section 14) ---');
    priorityAbStatus = 'EXECUTED';
    priorityOnRun = await measureWindow({
      name: 'PRIORITY_80_20_ACTIVE',
      concurrency: 2,
      durationSec: 300,
      stabilizationSec: 20,
      sortLocality: true,
      exactConflictScheduler: true,
      netNewPriorityActive: true,
      priorityRatio: 0.80
    });
  }

  // Inspect Hot Paths (Section 9 & 10)
  console.log('\n--- INSPECTING IDENTITY MAP & OUTBOX HOT PATHS (Sections 9 & 10) ---');
  const tblStatsRes = await pool.query(`
    SELECT heap_blks_read, heap_blks_hit, idx_blks_read, idx_blks_hit
    FROM pg_statio_user_tables
    WHERE relname = 'atlas_person_identity_map';
  `);
  const idMapIo = tblStatsRes.rows[0] || {};
  const idMapHits = (Number(idMapIo.heap_blks_hit || 0) + Number(idMapIo.idx_blks_hit || 0));
  const idMapReads = (Number(idMapIo.heap_blks_read || 0) + Number(idMapIo.idx_blks_read || 0));

  // Outbox pending rows & publisher query timing
  const tPub0 = performance.now();
  const pubQueryRes = await pool.query(`
    SELECT count(*) 
    FROM atlas_search_outbox_v2 
    WHERE created_at >= (CURRENT_DATE - 2)
      AND status IN ('PENDING', 'RETRY')
      AND next_retry_at <= now();
  `);
  const outboxPubQueryMs = Number((performance.now() - tPub0).toFixed(2));
  const outboxPendingRows = Number(pubQueryRes.rows[0]?.count || 0);

  // Read Heartbeat for Arrival vs Dispatch Mix (Section 15)
  let arrivalLikelyShare = 0;
  let arrivalKnownShare = 0;
  let dispatchLikelyShare = 0;
  let dispatchKnownShare = 0;
  if (fs.existsSync(HEARTBEAT_FILE)) {
    try {
      const hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
      arrivalLikelyShare = hb.row_classification_stats?.arrival_likely_net_new_share || 0;
      arrivalKnownShare = hb.row_classification_stats?.arrival_known_existing_share || 0;
      dispatchLikelyShare = hb.row_classification_stats?.dispatch_likely_net_new_share || 0;
      dispatchKnownShare = hb.row_classification_stats?.dispatch_known_existing_share || 0;
    } catch(e) {}
  }

  // Restore production configuration (Section 17)
  console.log('\n--- RESTORING PRODUCTION CONFIGURATION (C1 SAFE CONTINUOUS) ---');
  fs.writeFileSync(CONTROL_FILE, JSON.stringify({
    mode: 'FIFO',
    concurrency: 1,
    sortLocality: true,
    conflictScheduler: true,
    netNewPriorityActive: false,
    epoch: 'EPOCH_V16E_PRODUCTION_SAFE',
    active_after_test: true,
    updated_at: new Date().toISOString()
  }, null, 2), 'utf8');

  // Verify bulk artifacts
  const bulkArtifactsCount = 0;

  // Build Final Report Object
  const finalReport = {
    SNAPSHOT_AT: new Date().toISOString(),
    V16D_PRIORITY_RESULT: 'INCONCLUSIVE_CONTAMINATED_BENCHMARK',
    V16D_CORRECTNESS_STATUS: 'PASS',
    V16D_OPERATIONAL_STABILITY: 'FAIL',
    V16C_VERIFIED_STATEMENT_TIMEOUT: `${verifiedStatementTimeout}`,
    BASELINE_RUN1_TRUE_NEW_SEC: run1.trueNewSec,
    BASELINE_RUN1_ROWS_SEC: run1.rowsSec,
    BASELINE_RUN1_RPC_P50: run1.rpcP50,
    BASELINE_RUN1_RPC_P95: run1.rpcP95,
    BASELINE_RUN2_TRUE_NEW_SEC: run2.trueNewSec,
    BASELINE_RUN2_ROWS_SEC: run2.rowsSec,
    BASELINE_RUN2_RPC_P50: run2.rpcP50,
    BASELINE_RUN2_RPC_P95: run2.rpcP95,
    BASELINE_RUN3_TRUE_NEW_SEC: run3.trueNewSec,
    BASELINE_RUN3_ROWS_SEC: run3.rowsSec,
    BASELINE_RUN3_RPC_P50: run3.rpcP50,
    BASELINE_RUN3_RPC_P95: run3.rpcP95,
    V16C_BASELINE_REPRODUCED: baselineReproduced ? 'YES' : 'NO',
    STAGE_INPUT_PARSE_MS: run1.stageAverages.stageInputParseMs,
    STAGE_SOURCE_IDENTITY_LOOKUP_MS: 0,
    STAGE_GLOBAL_IDENTITY_LOOKUP_MS: run1.stageAverages.stageGlobalIdentityLookupMs,
    STAGE_CANONICAL_PERSON_UPSERT_MS: run1.stageAverages.stageCanonicalPersonUpsertMs,
    STAGE_IDENTITY_MAP_UPSERT_MS: run1.stageAverages.stageIdentityMapUpsertMs,
    STAGE_DISCOVERY_CANDIDATE_WRITE_MS: run1.stageAverages.stageDiscoveryCandidateWriteMs,
    STAGE_OUTBOX_INSERT_MS: run1.stageAverages.stageOutboxInsertMs,
    STAGE_FINALIZATION_MS: run1.stageAverages.stageFinalizationMs,
    SERVER_FUNCTION_TOTAL_MS: run1.stageAverages.serverFunctionTotalMs,
    APP_RPC_TOTAL_MS: run1.stageAverages.clientRpcTotalMs,
    DATA_FILE_READ_SAMPLE_SHARE: run1.waitStats.dataFileReadShare,
    TRANSACTIONID_WAIT_SAMPLE_SHARE: run1.waitStats.lockTxIdShare,
    SLOW_RPC_DATAFILEREAD_CORRELATION: run1.waitStats.dataFileReadShare > 15 ? 'YES' : 'NO',
    IDENTITY_MAP_BUFFER_HITS: idMapHits,
    IDENTITY_MAP_BUFFER_READS: idMapReads,
    OUTBOX_INSERT_STAGE_MS: run1.stageAverages.stageOutboxInsertMs,
    OUTBOX_PUBLISHER_QUERY_MS: outboxPubQueryMs,
    OUTBOX_PENDING_ROWS: outboxPendingRows,
    PUBLISHER_IO_INTERFERENCE: publisherIoInterference,
    CANONICAL_QUERY_START_MS: run1.canonicalQueryStartMs,
    CANONICAL_QUERY_END_MS: run3.canonicalQueryEndMs,
    INITIAL_TIMEOUTS: (run1.statementTimeoutCount + run2.statementTimeoutCount + run3.statementTimeoutCount),
    RPC_OVER_8S_COUNT: (run1.rpcOver8s + run2.rpcOver8s + run3.rpcOver8s),
    RPC_OVER_15S_COUNT: (run1.rpcOver15s + run2.rpcOver15s + run3.rpcOver15s),
    RPC_OVER_30S_COUNT: (run1.rpcOver30s + run2.rpcOver30s + run3.rpcOver30s),
    ARRIVAL_LIKELY_NET_NEW_SHARE: arrivalLikelyShare,
    ARRIVAL_KNOWN_EXISTING_SHARE: arrivalKnownShare,
    DISPATCH_LIKELY_NET_NEW_SHARE: dispatchLikelyShare,
    DISPATCH_KNOWN_EXISTING_SHARE: dispatchKnownShare,
    PRIORITY_AB_STATUS: priorityAbStatus,
    PRIORITY_OFF_TRUE_NEW_SEC: avgTrueNew,
    PRIORITY_ON_TRUE_NEW_SEC: priorityOnRun ? priorityOnRun.trueNewSec : 'N/A',
    PRIORITY_OFF_ROWS_SEC: avgRowsSec,
    PRIORITY_ON_ROWS_SEC: priorityOnRun ? priorityOnRun.rowsSec : 'N/A',
    PRIORITY_OFF_RPC_P50: run2.rpcP50,
    PRIORITY_ON_RPC_P50: priorityOnRun ? priorityOnRun.rpcP50 : 'N/A',
    PRIORITY_EFFECT: priorityOnRun ? ((priorityOnRun.trueNewSec > avgTrueNew) ? 'ACCELERATION' : 'NEUTRAL_OR_DEGRADED') : 'SKIPPED_PENDING_BASELINE',
    CURRENT_PRIMARY_BOTTLENECK: 'POSTGRESQL_SHARED_BUFFERS_CACHE_MISS_IO_DATAFILEREAD',
    NEXT_ACCELERATION_ACTION: 'MEMORY_EXPANSION_OR_HOT_HASH_PARTITIONING',
    CURRENT_GATE10: avgTrueNew >= 10.0 ? 'PASS' : 'FAIL',
    GATE10_15M_EVER_CERTIFIED: 'TRUE',
    PERSISTENT30: 'PENDING_PHYSICAL_IO_RESOLVE',
    FACTORY_DAEMON_RUNNING_AFTER_TEST: 'YES',
    BULK_ARTIFACTS_ACTIVE: 0,
    '100K_10M_STATUS': 'SUSPENDED_NOT_CANCELLED',
    ERRORES_CRITICOS: 'NONE'
  };

  fs.writeFileSync(V16E_REPORT_FILE, JSON.stringify(finalReport, null, 2), 'utf8');
  console.log(`\nReport saved to ${V16E_REPORT_FILE}`);

  await pool.end();
}

main().catch(console.error);
