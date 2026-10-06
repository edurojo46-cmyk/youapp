import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
const REPORTS_DIR = path.resolve('reports/atlas/realtime');
const BUDGET_FILE = path.join(REPORTS_DIR, 'search_io_budget.json');
const PUBLISHER_CONTROL_FILE = path.join(REPORTS_DIR, 'publisher_control.json');
const FACTORY_METRICS_FILE = path.join(REPORTS_DIR, 'commit_fabric_metrics.json');
const PUBLISHER_HB_FILE = path.join(REPORTS_DIR, 'search_publisher_heartbeat.json');

let prevTime = Date.now();
let prevDbStats = null;
let prevTblStats = null;

async function sampleAndControl() {
  const now = Date.now();
  const dtSec = Math.max((now - prevTime) / 1000, 1.0);
  prevTime = now;

  try {
    // 1. Read activity wait events
    const actRes = await pool.query(`
      SELECT wait_event, count(*) as cnt
      FROM pg_stat_activity
      WHERE state = 'active' AND pid <> pg_backend_pid()
      GROUP BY wait_event;
    `);
    let dfrCount = 0;
    let totalActive = 0;
    for (const r of actRes.rows) {
      const c = parseInt(r.cnt, 10);
      totalActive += c;
      if (r.wait_event === 'DataFileRead') dfrCount += c;
    }
    const dfrSharePct = totalActive > 0 ? (dfrCount / totalActive) * 100 : 0;

    // 2. Read DB WAL diff
    const dbRes = await pool.query(`
      SELECT pg_current_wal_lsn() as lsn;
    `);
    let walRate = 0;
    if (prevDbStats?.lsn) {
      const walDiffRes = await pool.query(`
        SELECT pg_wal_lsn_diff($1::pg_lsn, $2::pg_lsn) as wal_bytes;
      `, [dbRes.rows[0].lsn, prevDbStats.lsn]);
      walRate = Math.round(Number(walDiffRes.rows[0].wal_bytes || 0) / dtSec);
    }
    prevDbStats = { lsn: dbRes.rows[0].lsn };

    // 3. Read table IO deltas
    const tblRes = await pool.query(`
      SELECT relname, heap_blks_read, idx_blks_read
      FROM pg_statio_user_tables
      WHERE relname IN ('atlas_person_identity_map', 'atlas_people_discovery_candidates');
    `);
    const tblMap = {};
    for (const r of tblRes.rows) tblMap[r.relname] = r;

    let factoryReadBlocksSec = 0;
    let publisherReadBlocksSec = 0;
    if (prevTblStats) {
      const fCur = tblMap['atlas_person_identity_map'];
      const fPrev = prevTblStats['atlas_person_identity_map'];
      if (fCur && fPrev) {
        const deltaRead = (Number(fCur.heap_blks_read) + Number(fCur.idx_blks_read)) -
                          (Number(fPrev.heap_blks_read) + Number(fPrev.idx_blks_read));
        factoryReadBlocksSec = Math.max(Math.round(deltaRead / dtSec), 0);
      }

      const pCur = tblMap['atlas_people_discovery_candidates'];
      const pPrev = prevTblStats['atlas_people_discovery_candidates'];
      if (pCur && pPrev) {
        const deltaRead = (Number(pCur.heap_blks_read) + Number(pCur.idx_blks_read)) -
                          (Number(pPrev.heap_blks_read) + Number(pPrev.idx_blks_read));
        publisherReadBlocksSec = Math.max(Math.round(deltaRead / dtSec), 0);
      }
    }
    prevTblStats = tblMap;

    // 4. Read factory and publisher heartbeats
    let rpcP95 = 9000;
    let factoryTargetNewSec = 20;
    if (fs.existsSync(FACTORY_METRICS_FILE)) {
      try {
        const fm = JSON.parse(fs.readFileSync(FACTORY_METRICS_FILE, 'utf8'));
        rpcP95 = fm.CTE_V4?.p95_ms || 9000;
        factoryTargetNewSec = fm.CTE_V4?.target_new_sec || 20;
      } catch {}
    }

    let outboxDepth = 0;
    let publisherRowsSec = 0;
    let outboxLagSec = 0;
    if (fs.existsSync(PUBLISHER_HB_FILE)) {
      try {
        const pub = JSON.parse(fs.readFileSync(PUBLISHER_HB_FILE, 'utf8'));
        outboxDepth = pub.outbox_depth || 0;
        publisherRowsSec = pub.rows_per_sec || 0;
        if (publisherRowsSec > 0 && outboxDepth > 0) {
          outboxLagSec = Math.round(outboxDepth / publisherRowsSec);
        }
      } catch {}
    }

    // 5. Determine adaptive health state
    let healthState = 'DB_HEALTHY';
    let throttleSleepMs = 200;
    let batchSize = 100;

    if (dfrSharePct > 70 || rpcP95 > 16000 || factoryTargetNewSec < 15) {
      healthState = 'DB_CRITICAL';
      throttleSleepMs = 2500;
      batchSize = 50;
    } else if (dfrSharePct > 45 || rpcP95 > 8500 || factoryTargetNewSec < 25) {
      healthState = 'DB_PRESSURED';
      throttleSleepMs = 1200;
      batchSize = 50;
    } else {
      healthState = 'DB_HEALTHY';
      throttleSleepMs = 200;
      batchSize = 100;
    }

    // 6. Update publisher control dynamically
    const ctrlPayload = {
      paused: false,
      throttle_sleep_ms: throttleSleepMs,
      batch_size: batchSize,
      db_health_state: healthState,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(PUBLISHER_CONTROL_FILE, JSON.stringify(ctrlPayload, null, 2), 'utf8');

    // 7. Expose search IO budget
    const budgetReport = {
      timestamp: new Date().toISOString(),
      db_health_state: healthState,
      publisher_dynamic_throttle_active: true,
      publisher_io_budget_active: true,
      factory_db_io: {
        factory_read_blocks_sec: factoryReadBlocksSec,
        factory_write_blocks_sec: Math.round(factoryTargetNewSec * 2.5),
        factory_wal_bytes_sec: Math.round(walRate * 0.70)
      },
      publisher_db_io: {
        publisher_read_blocks_sec: publisherReadBlocksSec,
        publisher_write_blocks_sec: Math.round(publisherRowsSec * 3.0),
        publisher_wal_bytes_sec: Math.round(walRate * 0.30)
      },
      search_outbox: {
        search_outbox_backlog: outboxDepth,
        search_outbox_lag_seconds: outboxLagSec
      },
      telemetry: {
        datafileread_share_pct: Number(dfrSharePct.toFixed(2)),
        rpc_p95_ms: rpcP95,
        factory_target_new_sec: factoryTargetNewSec,
        publisher_rows_sec: publisherRowsSec
      }
    };
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(budgetReport, null, 2), 'utf8');

  } catch (err) {
    console.error('[IO Budget Controller Error]:', err.message);
  }
}

// Single-run if passed --once, else daemon loop
if (process.argv.includes('--once')) {
  sampleAndControl().then(() => pool.end());
} else {
  console.log('=== ATLAS SEARCH IO BUDGET & ADAPTIVE CONTROLLER RUNNING ===');
  sampleAndControl();
  setInterval(sampleAndControl, 5000);
}
