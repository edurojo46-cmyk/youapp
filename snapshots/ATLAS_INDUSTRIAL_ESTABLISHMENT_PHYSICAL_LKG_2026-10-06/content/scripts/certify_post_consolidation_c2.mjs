import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
const durationSeconds = parseInt(process.argv[2] || '300', 10);

async function run() {
  console.log(`=== SECTION 10: POST-CONSOLIDATION C2 CERTIFICATION (300 SECONDS) ===`);
  console.log(`Configuration: B100 / C2 / CTE_V4`);

  // Initial DB stats
  const db0 = await pool.query(`
    SELECT blks_read, blks_hit, xact_commit, pg_current_wal_lsn() as lsn
    FROM pg_stat_database WHERE datname = current_database();
  `);

  // Initial table stats
  const tbl0 = await pool.query(`
    SELECT relname, heap_blks_read, heap_blks_hit, idx_blks_read, idx_blks_hit
    FROM pg_statio_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map');
  `);

  // Initial commit metrics
  const metricsFile = path.resolve('reports/atlas/realtime/commit_fabric_metrics.json');
  let m0 = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
  const startTarget = m0.CTE_V4.target_new;
  const startBatches = m0.CTE_V4.batches;
  const startRows = m0.CTE_V4.rows;

  const tStart = Date.now();
  const waitSamples = [];
  const searchLatencies = [];
  const outboxLags = [];
  let pollCount = 0;

  const searchTerms = ['GONZALEZ', 'HOSPITAL', 'ABOGADO', 'DIRECTOR', 'SALUD'];

  const interval = setInterval(async () => {
    try {
      // 1. Wait events sampling
      const res = await pool.query(`
        SELECT wait_event_type, wait_event, count(*) as cnt
        FROM pg_stat_activity
        WHERE state = 'active' AND pid <> pg_backend_pid()
        GROUP BY wait_event_type, wait_event;
      `);
      let dfrCnt = 0;
      let totalActive = 0;
      for (const row of res.rows) {
        const c = parseInt(row.cnt, 10);
        totalActive += c;
        if (row.wait_event === 'DataFileRead') dfrCnt += c;
      }
      waitSamples.push({ totalActive, dfrCnt });

      // 2. Periodic search query latency check (V3)
      const q = searchTerms[pollCount % searchTerms.length];
      const s0 = Date.now();
      await pool.query(`SELECT count(*) FROM atlas_search_people_unified_v3(p_query := $1, p_limit := 20);`, [q]);
      searchLatencies.push(Date.now() - s0);

      // 3. Outbox lag check
      const obRes = await pool.query(`
        SELECT 
          count(*) as pending_count,
          coalesce(extract(epoch from (now() - min(created_at))), 0) as lag_seconds
        FROM atlas_search_outbox_v2
        WHERE status = 'PENDING';
      `).catch(() => ({ rows: [{ pending_count: 0, lag_seconds: 0 }] }));
      outboxLags.push({
        pending: Number(obRes.rows[0].pending_count || 0),
        lagSec: Number(obRes.rows[0].lag_seconds || 0)
      });

      pollCount++;
    } catch (e) {}
  }, 5000);

  console.log(`Measurement active for ${durationSeconds} seconds...`);
  await new Promise(r => setTimeout(r, durationSeconds * 1000));
  clearInterval(interval);

  const tEnd = Date.now();
  const elapsedSec = (tEnd - tStart) / 1000;

  // Final DB stats
  const db1 = await pool.query(`
    SELECT blks_read, blks_hit, xact_commit, pg_current_wal_lsn() as lsn,
           pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as wal_bytes
    FROM pg_stat_database WHERE datname = current_database();
  `, [db0.rows[0].lsn]);

  // Final table stats
  const tbl1 = await pool.query(`
    SELECT relname, heap_blks_read, heap_blks_hit, idx_blks_read, idx_blks_hit
    FROM pg_statio_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map');
  `);

  let m1 = JSON.parse(fs.readFileSync(metricsFile, 'utf8'));
  const deltaTarget = m1.CTE_V4.target_new - startTarget;
  const deltaBatches = m1.CTE_V4.batches - startBatches;
  const deltaRows = m1.CTE_V4.rows - startRows;
  const targetPerSec = Number((deltaTarget / elapsedSec).toFixed(2));

  // Compute DataFileRead Share
  let totalDfr = 0;
  let totalActiveAll = 0;
  for (const s of waitSamples) {
    totalDfr += s.dfrCnt;
    totalActiveAll += s.totalActive;
  }
  const dfrShare = totalActiveAll > 0 ? Number(((totalDfr / totalActiveAll) * 100).toFixed(2)) : 0;

  // WAL rate
  const walBytes = Number(db1.rows[0].wal_bytes || 0);
  const walPerSec = Math.round(walBytes / elapsedSec);

  // Buffer cache hit ratio
  const deltaRead = Number(db1.rows[0].blks_read) - Number(db0.rows[0].blks_read);
  const deltaHit = Number(db1.rows[0].blks_hit) - Number(db0.rows[0].blks_hit);
  const winHitRatio = (deltaHit + deltaRead) > 0 ? Number(((deltaHit / (deltaHit + deltaRead)) * 100).toFixed(2)) : 100;

  // Search Latency Percentiles
  searchLatencies.sort((a, b) => a - b);
  const searchP50 = searchLatencies.length ? searchLatencies[Math.floor(searchLatencies.length * 0.5)] : 0;
  const searchP95 = searchLatencies.length ? searchLatencies[Math.floor(searchLatencies.length * 0.95)] : 0;

  // Outbox Lag
  const avgOutboxPending = outboxLags.length ? Math.round(outboxLags.reduce((a, b) => a + b.pending, 0) / outboxLags.length) : 0;
  const maxOutboxLagSec = outboxLags.length ? Math.max(...outboxLags.map(o => o.lagSec)) : 0;

  const results = {
    timestamp: new Date().toISOString(),
    benchmark_duration_sec: elapsedSec,
    target_true_new_committed: deltaTarget,
    target_true_new_per_sec: targetPerSec,
    batches_committed: deltaBatches,
    rows_committed: deltaRows,
    rpc_p50_ms: m1.CTE_V4.p50_ms,
    rpc_p95_ms: m1.CTE_V4.p95_ms,
    rpc_p99_ms: m1.CTE_V4.p99_ms,
    datafileread_share_pct: dfrShare,
    buffer_cache_hit_ratio_pct: winHitRatio,
    wal_bytes_per_sec: walPerSec,
    wal_mb_per_sec: Number((walPerSec / (1024 * 1024)).toFixed(2)),
    search_latency_p50_ms: searchP50,
    search_latency_p95_ms: searchP95,
    search_outbox_backlog: avgOutboxPending,
    search_outbox_lag_sec: maxOutboxLagSec,
    historical_20_00_exceeded: targetPerSec > 20.00,
    historical_29_68_recovered: targetPerSec >= 29.68
  };

  console.log('\n=== SECTION 10 CERTIFICATION RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  fs.writeFileSync('reports/atlas/realtime/post_consolidation_c2_certification.json', JSON.stringify(results, null, 2), 'utf8');
  console.log('Saved report to reports/atlas/realtime/post_consolidation_c2_certification.json');

  await pool.end();
}

run().catch(console.error);
