import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
const durationSeconds = parseInt(process.argv[2] || '150', 10);

const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const PUBLISHER_CONTROL_FILE = path.join(REPORTS_DIR, 'publisher_control.json');
const FACTORY_METRICS_FILE = path.join(REPORTS_DIR, 'commit_fabric_metrics.json');
const PUBLISHER_HB_FILE = path.join(REPORTS_DIR, 'search_publisher_heartbeat.json');

function setPublisherControl(throttleSleepMs, batchSize) {
  const ctrl = {
    paused: false,
    throttle_sleep_ms: throttleSleepMs,
    batch_size: batchSize,
    updated_at: new Date().toISOString()
  };
  fs.writeFileSync(PUBLISHER_CONTROL_FILE, JSON.stringify(ctrl, null, 2), 'utf8');
}

async function measureWindow(windowName, throttleSleepMs, batchSize, durSec) {
  console.log(`\n======================================================`);
  console.log(`  STARTING ${windowName}: sleep=${throttleSleepMs}ms, batch=${batchSize}, duration=${durSec}s`);
  console.log(`======================================================`);

  setPublisherControl(throttleSleepMs, batchSize);
  console.log(`Waiting 5s for publisher to settle at new rate...`);
  await new Promise(r => setTimeout(r, 5000));

  // Snapshot initial stats
  const db0 = await pool.query(`
    SELECT blks_read, blks_hit, xact_commit, pg_current_wal_lsn() as lsn
    FROM pg_stat_database WHERE datname = current_database();
  `);

  const tbl0 = await pool.query(`
    SELECT relname, heap_blks_read, heap_blks_hit, idx_blks_read, idx_blks_hit
    FROM pg_statio_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map');
  `);

  const gin0 = await pool.query(`
    SELECT i.relname as index_name, io.idx_blks_read, io.idx_blks_hit
    FROM pg_class c
    JOIN pg_index x ON c.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    LEFT JOIN pg_statio_user_indexes io ON io.indexrelid = i.oid
    WHERE c.relname = 'atlas_people_discovery_candidates' AND am.amname = 'gin';
  `);

  let fm0 = JSON.parse(fs.readFileSync(FACTORY_METRICS_FILE, 'utf8'));
  let pub0 = fs.existsSync(PUBLISHER_HB_FILE) ? JSON.parse(fs.readFileSync(PUBLISHER_HB_FILE, 'utf8')) : { published_total: 0, outbox_depth: 0 };

  const startV4Batches = fm0.CTE_V4?.batches || 0;
  const startV4Rows = fm0.CTE_V4?.rows || 0;
  const startV4Target = fm0.CTE_V4?.target_new || 0;
  const startPubTotal = pub0.published_total || 0;
  const startOutboxDepth = pub0.outbox_depth || 0;

  const tStart = Date.now();
  const waitSamples = [];
  const pollInterval = setInterval(async () => {
    try {
      const res = await pool.query(`
        SELECT wait_event_type, wait_event, count(*) as cnt
        FROM pg_stat_activity
        WHERE state = 'active' AND pid <> pg_backend_pid()
        GROUP BY wait_event_type, wait_event;
      `);
      let dfrCnt = 0;
      let dfwCnt = 0;
      let totalActive = 0;
      for (const row of res.rows) {
        const c = parseInt(row.cnt, 10);
        totalActive += c;
        if (row.wait_event === 'DataFileRead') dfrCnt += c;
        if (row.wait_event === 'DataFileWrite') dfwCnt += c;
      }
      waitSamples.push({ totalActive, dfrCnt, dfwCnt });
    } catch {}
  }, 2500);

  // Wait for measurement duration
  let elapsed = 0;
  while (elapsed < durSec) {
    await new Promise(r => setTimeout(r, 5000));
    elapsed = Math.floor((Date.now() - tStart) / 1000);
    process.stdout.write(`\rProgress: ${elapsed}/${durSec}s...`);
  }
  console.log('');
  clearInterval(pollInterval);

  const tEnd = Date.now();
  const actualDurSec = (tEnd - tStart) / 1000;

  // Snapshot final stats
  const db1 = await pool.query(`
    SELECT blks_read, blks_hit, xact_commit, pg_current_wal_lsn() as lsn,
           pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as wal_bytes
    FROM pg_stat_database WHERE datname = current_database();
  `, [db0.rows[0].lsn]);

  const tbl1 = await pool.query(`
    SELECT relname, heap_blks_read, heap_blks_hit, idx_blks_read, idx_blks_hit
    FROM pg_statio_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map');
  `);

  const gin1 = await pool.query(`
    SELECT i.relname as index_name, io.idx_blks_read, io.idx_blks_hit
    FROM pg_class c
    JOIN pg_index x ON c.oid = x.indrelid
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    LEFT JOIN pg_statio_user_indexes io ON io.indexrelid = i.oid
    WHERE c.relname = 'atlas_people_discovery_candidates' AND am.amname = 'gin';
  `);

  let fm1 = JSON.parse(fs.readFileSync(FACTORY_METRICS_FILE, 'utf8'));
  let pub1 = fs.existsSync(PUBLISHER_HB_FILE) ? JSON.parse(fs.readFileSync(PUBLISHER_HB_FILE, 'utf8')) : { published_total: 0, outbox_depth: 0 };

  const deltaBatches = (fm1.CTE_V4?.batches || 0) - startV4Batches;
  const deltaRows = (fm1.CTE_V4?.rows || 0) - startV4Rows;
  const deltaTarget = (fm1.CTE_V4?.target_new || 0) - startV4Target;
  const targetPerSec = Number((deltaTarget / actualDurSec).toFixed(2));
  const factoryCommitsPerSec = Number((deltaBatches / actualDurSec).toFixed(2));

  const deltaPubRows = (pub1.published_total || 0) - startPubTotal;
  const pubRowsPerSec = Number((deltaPubRows / actualDurSec).toFixed(2));
  const outboxGrowth = (pub1.outbox_depth || 0) - startOutboxDepth;

  let totalDfr = 0, totalDfw = 0, totalActive = 0;
  for (const s of waitSamples) {
    totalDfr += s.dfrCnt;
    totalDfw += s.dfwCnt;
    totalActive += s.totalActive;
  }
  const dfrSharePct = totalActive > 0 ? Number(((totalDfr / totalActive) * 100).toFixed(2)) : 0;

  const walBytes = Number(db1.rows[0].wal_bytes || 0);
  const walPerSec = Math.round(walBytes / actualDurSec);
  const deltaRead = Number(db1.rows[0].blks_read) - Number(db0.rows[0].blks_read);
  const deltaHit = Number(db1.rows[0].blks_hit) - Number(db0.rows[0].blks_hit);
  const hitRatio = (deltaHit + deltaRead) > 0 ? Number(((deltaHit / (deltaHit + deltaRead)) * 100).toFixed(2)) : 100;

  // GIN deltas
  let ginBlksRead = 0;
  for (const g1 of gin1.rows) {
    const g0 = gin0.rows.find(r => r.index_name === g1.index_name) || { idx_blks_read: 0 };
    ginBlksRead += (Number(g1.idx_blks_read || 0) - Number(g0.idx_blks_read || 0));
  }

  // Candidate table deltas
  const cand0 = tbl0.rows.find(r => r.relname === 'atlas_people_discovery_candidates') || {};
  const cand1 = tbl1.rows.find(r => r.relname === 'atlas_people_discovery_candidates') || {};
  const candHeapRead = Number(cand1.heap_blks_read || 0) - Number(cand0.heap_blks_read || 0);
  const candIdxRead = Number(cand1.idx_blks_read || 0) - Number(cand0.idx_blks_read || 0);

  const windowResult = {
    window_name: windowName,
    duration_sec: actualDurSec,
    factory_commits_sec: factoryCommitsPerSec,
    factory_target_new_sec: targetPerSec,
    factory_rows_sec: Number((deltaRows / actualDurSec).toFixed(2)),
    rpc_p50_ms: fm1.CTE_V4?.p50_ms || 0,
    rpc_p95_ms: fm1.CTE_V4?.p95_ms || 0,
    publisher_rows_sec: pubRowsPerSec,
    publisher_published_total: deltaPubRows,
    search_outbox_backlog_growth: outboxGrowth,
    datafileread_share_pct: dfrSharePct,
    buffer_cache_hit_ratio_pct: hitRatio,
    wal_bytes_per_sec: walPerSec,
    wal_mb_per_sec: Number((walPerSec / (1024 * 1024)).toFixed(2)),
    gin_pages_read: ginBlksRead,
    candidate_heap_reads: candHeapRead,
    candidate_idx_reads: candIdxRead,
    total_db_blks_read: deltaRead,
    total_db_blks_hit: deltaHit
  };

  console.log(`\n--- ${windowName} RESULTS ---`);
  console.log(JSON.stringify(windowResult, null, 2));
  return windowResult;
}

async function run() {
  console.log('=== ATLAS: SEARCH PUBLISHER IO ISOLATION & THROTTLE A/B EXPERIMENT ===');
  console.log(`Window duration: ${durationSeconds} seconds per phase`);

  // Window A: Full Unthrottled Publisher (sleep=200ms, batch=100)
  const windowA = await measureWindow('WINDOW_A_UNTHROTTLED', 200, 100, durationSeconds);

  // Window B: Throttled Publisher (sleep=2500ms, batch=50 -> approx 25%-35% rate)
  const windowB = await measureWindow('WINDOW_B_THROTTLED', 2500, 50, durationSeconds);

  // Reset publisher control to normal
  setPublisherControl(200, 100);
  console.log('\nPublisher control restored to default (throttle_sleep_ms=200, batch_size=100).');

  // Compute A/B deltas and comparison
  const throughputGainPct = Number((((windowB.factory_target_new_sec - windowA.factory_target_new_sec) / windowA.factory_target_new_sec) * 100).toFixed(2));
  const rpcP50DeltaPct = Number((((windowB.rpc_p50_ms - windowA.rpc_p50_ms) / windowA.rpc_p50_ms) * 100).toFixed(2));
  const rpcP95DeltaPct = Number((((windowB.rpc_p95_ms - windowA.rpc_p95_ms) / windowA.rpc_p95_ms) * 100).toFixed(2));
  const dfrDeltaPct = Number((windowB.datafileread_share_pct - windowA.datafileread_share_pct).toFixed(2));
  const walDeltaPct = Number((((windowB.wal_bytes_per_sec - windowA.wal_bytes_per_sec) / windowA.wal_bytes_per_sec) * 100).toFixed(2));
  const publisherThrottledRatioPct = Number(((windowB.publisher_rows_sec / (windowA.publisher_rows_sec || 1)) * 100).toFixed(1));

  const ioContentionConfirmed = (throughputGainPct > 5 || rpcP50DeltaPct < -5 || windowB.datafileread_share_pct < windowA.datafileread_share_pct);

  const report = {
    test_timestamp: new Date().toISOString(),
    window_duration_seconds: durationSeconds,
    window_a_unthrottled: windowA,
    window_b_throttled: windowB,
    comparison: {
      factory_target_new_sec_window_a: windowA.factory_target_new_sec,
      factory_target_new_sec_window_b: windowB.factory_target_new_sec,
      factory_throughput_gain_pct: throughputGainPct,
      publisher_rate_window_a: windowA.publisher_rows_sec,
      publisher_rate_window_b: windowB.publisher_rows_sec,
      publisher_throttled_to_pct: publisherThrottledRatioPct,
      rpc_p50_ms_window_a: windowA.rpc_p50_ms,
      rpc_p50_ms_window_b: windowB.rpc_p50_ms,
      rpc_p50_delta_pct: rpcP50DeltaPct,
      rpc_p95_ms_window_a: windowA.rpc_p95_ms,
      rpc_p95_ms_window_b: windowB.rpc_p95_ms,
      rpc_p95_delta_pct: rpcP95DeltaPct,
      datafileread_share_window_a_pct: windowA.datafileread_share_pct,
      datafileread_share_window_b_pct: windowB.datafileread_share_pct,
      wal_bytes_per_sec_window_a: windowA.wal_bytes_per_sec,
      wal_bytes_per_sec_window_b: windowB.wal_bytes_per_sec,
      search_outbox_backlog_growth_window_a: windowA.search_outbox_backlog_growth,
      search_outbox_backlog_growth_window_b: windowB.search_outbox_backlog_growth,
      search_publisher_io_contention: ioContentionConfirmed ? 'CONFIRMED' : 'REJECTED'
    }
  };

  console.log('\n======================================================');
  console.log('  FINAL A/B EXPERIMENT VERDICT');
  console.log('======================================================');
  console.log(JSON.stringify(report.comparison, null, 2));

  fs.writeFileSync('reports/atlas/realtime/publisher_throttle_ab_result.json', JSON.stringify(report, null, 2), 'utf8');
  await pool.end();
}

run().catch(console.error);
