import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function run() {
  console.log('=== SECTION 1: DETAILED IO BASELINE CAPTURE ===');

  // 1. Buffer cache hit ratio
  const bg = await pool.query(`
    SELECT 
      datname,
      blks_read,
      blks_hit,
      ROUND((blks_hit::numeric / NULLIF(blks_hit + blks_read, 0)) * 100, 2) AS buffer_cache_hit_ratio,
      xact_commit,
      xact_rollback
    FROM pg_stat_database
    WHERE datname = current_database();
  `);
  console.log('\n--- PG_STAT_DATABASE ---');
  console.table(bg.rows);

  // 2. Wait events & DataFileRead share
  const waits = await pool.query(`
    SELECT 
      COALESCE(wait_event, 'CPU/Active') as wait_event,
      COALESCE(wait_event_type, 'CPU') as wait_event_type,
      count(*) as session_count,
      ROUND(count(*)::numeric / SUM(count(*)) OVER () * 100, 2) as pct_share
    FROM pg_stat_activity
    WHERE state = 'active' AND pid <> pg_backend_pid()
    GROUP BY wait_event, wait_event_type
    ORDER BY session_count DESC;
  `);
  console.log('\n--- ACTIVE WAIT EVENT SHARES ---');
  console.table(waits.rows);

  // 3. Per relation IO blocks read & hit
  const rels = await pool.query(`
    SELECT 
      relname,
      heap_blks_read,
      heap_blks_hit,
      idx_blks_read,
      idx_blks_hit,
      toast_blks_read,
      toast_blks_hit,
      (heap_blks_read + idx_blks_read + toast_blks_read) as total_blks_read,
      ROUND((heap_blks_hit::numeric / NULLIF(heap_blks_hit + heap_blks_read, 0)) * 100, 2) AS heap_hit_ratio,
      ROUND((idx_blks_hit::numeric / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) AS idx_hit_ratio
    FROM pg_statio_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map', 'atlas_search_delivery_keys', 'atlas_search_outbox_v2')
    ORDER BY total_blks_read DESC;
  `);
  console.log('\n--- PER-RELATION IO STATS ---');
  console.table(rels.rows);

  // 4. Per index IO blocks read & hit
  const idxs = await pool.query(`
    SELECT 
      relname,
      indexrelname,
      idx_blks_read,
      idx_blks_hit,
      (idx_blks_read + idx_blks_hit) as total_accesses,
      ROUND((idx_blks_hit::numeric / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) AS hit_ratio
    FROM pg_statio_user_indexes
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map', 'atlas_search_delivery_keys', 'atlas_search_outbox_v2')
    ORDER BY idx_blks_read DESC;
  `);
  console.log('\n--- PER-INDEX IO STATS ---');
  console.table(idxs.rows);

  // 5. Check WAL generation rate (over 5 seconds)
  const wal1 = await pool.query(`SELECT pg_current_wal_lsn() as lsn;`);
  const t1 = Date.now();
  await new Promise(r => setTimeout(r, 5000));
  const wal2 = await pool.query(`SELECT pg_current_wal_lsn() as lsn, pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as diff_bytes;`, [wal1.rows[0].lsn]);
  const elapsedSec = (Date.now() - t1) / 1000;
  const walBytesPerSec = Math.round(Number(wal2.rows[0].diff_bytes) / elapsedSec);
  console.log(`\n--- WAL GENERATION ---`);
  console.log(`WAL diff: ${wal2.rows[0].diff_bytes} bytes in ${elapsedSec}s -> ${walBytesPerSec} bytes/sec (${(walBytesPerSec / (1024*1024)).toFixed(2)} MB/s)`);

  // 6. Check Postgres memory config
  const memConfig = await pool.query(`
    SELECT name, setting, unit, current_setting(name) as val
    FROM pg_settings
    WHERE name IN ('shared_buffers', 'work_mem', 'maintenance_work_mem', 'effective_cache_size', 'random_page_cost', 'seq_page_cost');
  `);
  console.log('\n--- MEMORY & PLANNER SETTINGS ---');
  console.table(memConfig.rows);

  await pool.end();
}

run().catch(console.error);
