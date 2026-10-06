import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

let dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.VITE_SUPABASE_DB_URL || process.env.SUPABASE_POSTGRES_URL || '';

if (!dbUrl) {
  try {
    const envLocal = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env.local')));
    dbUrl = envLocal.DATABASE_URL || envLocal.SUPABASE_DB_URL || envLocal.VITE_SUPABASE_DB_URL || envLocal.SUPABASE_POSTGRES_URL || '';
  } catch (e) {}
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('=== CONNECTED TO POSTGRESQL ===\n');

  // 1. pg_stat_activity
  console.log('--- 1. ACTIVE QUERIES & WAIT EVENTS (pg_stat_activity) ---');
  const activityRes = await client.query(`
    SELECT pid, now() - query_start AS duration, state, wait_event_type, wait_event, left(query, 120) AS query_snippet
    FROM pg_stat_activity
    WHERE state != 'idle' AND pid <> pg_backend_pid()
    ORDER BY duration DESC;
  `);
  console.table(activityRes.rows);

  // 2. pg_locks summary
  console.log('\n--- 2. LOCK WAITS & GRANTED LOCKS (pg_locks) ---');
  const locksRes = await client.query(`
    SELECT l.locktype, l.mode, l.granted, count(*) AS lock_count
    FROM pg_locks l
    GROUP BY l.locktype, l.mode, l.granted
    ORDER BY lock_count DESC;
  `);
  console.table(locksRes.rows);

  // 3. User tables stats (live tuples, dead tuples, vacuums, scans)
  console.log('\n--- 3. TABLE BLOAT & STATS (pg_stat_user_tables) ---');
  const tableStatsRes = await client.query(`
    SELECT 
      relname,
      n_live_tup,
      n_dead_tup,
      round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio_pct,
      last_vacuum,
      last_autovacuum,
      vacuum_count,
      autovacuum_count,
      seq_scan,
      idx_scan,
      n_tup_ins,
      n_tup_del,
      n_tup_hot_upd
    FROM pg_stat_user_tables
    WHERE relname IN (
      'benchmark_people_staging_0',
      'benchmark_people_staging_1',
      'atlas_person_identity_map',
      'benchmark_identity_reconcile_outbox',
      'atlas_people_discovery_candidates'
    )
    ORDER BY relname;
  `);
  console.table(tableStatsRes.rows);

  // 4. Physical Table Sizes
  console.log('\n--- 4. PHYSICAL TABLE & INDEX SIZES ---');
  const sizesRes = await client.query(`
    SELECT 
      relname,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_size_pretty(pg_table_size(c.oid)) AS table_size,
      pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (
      'benchmark_people_staging_0',
      'benchmark_people_staging_1',
      'atlas_person_identity_map',
      'benchmark_identity_reconcile_outbox',
      'atlas_people_discovery_candidates'
    )
    ORDER BY relname;
  `);
  console.table(sizesRes.rows);

  // 5. pg_stat_database metrics
  console.log('\n--- 5. DATABASE LEVEL METRICS (pg_stat_database) ---');
  const dbStatsRes = await client.query(`
    SELECT 
      datname,
      xact_commit,
      xact_rollback,
      blks_read,
      blks_hit,
      round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) AS cache_hit_ratio_pct,
      temp_files,
      pg_size_pretty(temp_bytes) AS temp_bytes_pretty,
      deadlocks,
      checksum_failures
    FROM pg_stat_database
    WHERE datname = current_database();
  `);
  console.table(dbStatsRes.rows);

  // 6. pg_stat_statements (if available)
  console.log('\n--- 6. TOP SLOW QUERIES (pg_stat_statements) ---');
  try {
    const statStmtRes = await client.query(`
      SELECT 
        round(total_exec_time::numeric, 2) AS total_time_ms,
        calls,
        round(mean_exec_time::numeric, 2) AS mean_time_ms,
        round(max_exec_time::numeric, 2) AS max_time_ms,
        round(100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0), 2) AS hit_pct,
        left(query, 100) AS query_snippet
      FROM pg_stat_statements
      WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
      ORDER BY total_exec_time DESC
      LIMIT 10;
    `);
    console.table(statStmtRes.rows);
  } catch (e: any) {
    console.log('pg_stat_statements not enabled or accessible:', e.message);
  }

  // 7. Staging and Outbox Counts
  console.log('\n--- 7. LIVE PHYSICAL ROW COUNTS ---');
  const countsRes = await client.query(`
    SELECT 
      (SELECT count(*) FROM benchmark_people_staging_0) AS staging_0_count,
      (SELECT count(*) FROM benchmark_people_staging_1) AS staging_1_count,
      (SELECT count(*) FROM benchmark_identity_reconcile_outbox WHERE status = 'pending') AS outbox_pending_count,
      (SELECT count(*) FROM benchmark_identity_reconcile_outbox WHERE status = 'published') AS outbox_published_count,
      (SELECT count(*) FROM atlas_person_identity_map) AS ssot_count;
  `);
  console.table(countsRes.rows);

  await client.end();
}

run().catch(err => {
  console.error('Error running diagnostics:', err);
  process.exit(1);
});
