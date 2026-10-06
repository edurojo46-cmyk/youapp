import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const l of env.split('\n')) {
  if (l.startsWith('VITE_SUPABASE_URL=')) url = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function querySql(sql, label) {
  console.log(`\n======================================================================`);
  console.log(`🔍 [${label}]`);
  console.log(`======================================================================`);
  const { data, error } = await sb.rpc('exec_sql', { sql });
  if (error) {
    console.error(`Error in [${label}]:`, error);
    return null;
  }
  return data;
}

async function run() {
  console.log('Starting PostgreSQL Live Diagnostic via exec_sql RPC...');

  // 1. pg_stat_activity
  const actSql = `
    SELECT 
      pid,
      now() - query_start AS duration,
      state,
      wait_event_type,
      wait_event,
      left(query, 140) AS query_snippet
    FROM pg_stat_activity
    WHERE state != 'idle' AND pid <> pg_backend_pid()
    ORDER BY duration DESC;
  `;
  const act = await querySql(actSql, '1. pg_stat_activity & wait_events');
  console.log(JSON.stringify(act, null, 2));

  // 2. pg_locks
  const locksSql = `
    SELECT 
      locktype,
      mode,
      granted,
      count(*) AS count
    FROM pg_locks
    GROUP BY locktype, mode, granted
    ORDER BY count DESC;
  `;
  const locks = await querySql(locksSql, '2. pg_locks breakdown');
  console.log(JSON.stringify(locks, null, 2));

  // 3. pg_stat_user_tables (live/dead tuples, vacuums, scans)
  const tablesSql = `
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
      n_tup_upd,
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
  `;
  const tables = await querySql(tablesSql, '3. Table Bloat & Tuple Stats');
  console.log(JSON.stringify(tables, null, 2));

  // 4. Physical Table & Index Sizes
  const sizesSql = `
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
  `;
  const sizes = await querySql(sizesSql, '4. Physical Table & Index Sizes');
  console.log(JSON.stringify(sizes, null, 2));

  // 5. pg_stat_database metrics
  const dbSql = `
    SELECT 
      datname,
      xact_commit,
      xact_rollback,
      blks_read,
      blks_hit,
      round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2) AS cache_hit_ratio_pct,
      temp_files,
      pg_size_pretty(temp_bytes) AS temp_bytes,
      deadlocks,
      checksum_failures
    FROM pg_stat_database
    WHERE datname = current_database();
  `;
  const dbMetrics = await querySql(dbSql, '5. Database Level Metrics & Temp Spills');
  console.log(JSON.stringify(dbMetrics, null, 2));

  // 6. Live Row Counts
  const countsSql = `
    SELECT 
      (SELECT count(*) FROM benchmark_people_staging_0) AS staging_0_count,
      (SELECT count(*) FROM benchmark_people_staging_1) AS staging_1_count,
      (SELECT count(*) FROM benchmark_identity_reconcile_outbox WHERE status = 'pending') AS outbox_pending_count,
      (SELECT count(*) FROM benchmark_identity_reconcile_outbox WHERE status = 'published') AS outbox_published_count,
      (SELECT count(*) FROM atlas_person_identity_map) AS ssot_count;
  `;
  const counts = await querySql(countsSql, '6. Live Physical Table Row Counts');
  console.log(JSON.stringify(counts, null, 2));
}

run().catch(console.error);
