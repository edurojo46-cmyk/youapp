import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();
await client.query("SET statement_timeout = '180s'");

console.log('========================================================================');
console.log('🚨 ATLAS EMERGENCY POSTGRESQL DISK & BLOAT FORENSIC AUDIT');
console.log('========================================================================\n');

// 1. Total Database Size & WAL Size
const dbSizeRes = await client.query(`
  SELECT 
    current_database() AS db_name,
    pg_database_size(current_database()) AS db_size_bytes,
    pg_size_pretty(pg_database_size(current_database())) AS db_size_pretty
`);
console.log('--- 1. DATABASE TOTAL SIZE ---');
console.log(dbSizeRes.rows[0]);

let walSize = { wal_size_bytes: 0, wal_size_pretty: 'UNKNOWN' };
try {
  const walRes = await client.query(`
    SELECT 
      sum(size) AS wal_size_bytes,
      pg_size_pretty(sum(size)) AS wal_size_pretty
    FROM pg_ls_waldir()
  `);
  walSize = walRes.rows[0];
  console.log('WAL Size:', walSize);
} catch (e) {
  console.log('pg_ls_waldir() not accessible or superuser restricted:', e.message);
}

// Check disk stats via pg_stat_database or extensions if available
let diskAllocated = null;
try {
  const diskRes = await client.query(`
    SELECT * FROM pg_stat_database WHERE datname = current_database();
  `);
  console.log('Database Stats:', {
    xact_commit: diskRes.rows[0].xact_commit,
    xact_rollback: diskRes.rows[0].xact_rollback,
    blks_read: diskRes.rows[0].blks_read,
    blks_hit: diskRes.rows[0].blks_hit,
    temp_files: diskRes.rows[0].temp_files,
    temp_bytes: diskRes.rows[0].temp_bytes,
    temp_size_pretty: (Number(diskRes.rows[0].temp_bytes) / (1024*1024*1024)).toFixed(2) + ' GB'
  });
} catch (e) {}

// 2. TOP Tables by Real Size
const topTablesRes = await client.query(`
  SELECT 
    st.schemaname || '.' || st.relname AS table_name,
    st.n_live_tup AS row_estimate,
    pg_relation_size(c.oid) AS data_bytes,
    pg_size_pretty(pg_relation_size(c.oid)) AS data_pretty,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_pretty,
    pg_total_relation_size(c.oid) AS total_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty,
    ROUND((pg_total_relation_size(c.oid)::numeric / pg_database_size(current_database())::numeric) * 100, 2) AS percent_of_db
  FROM pg_stat_user_tables st
  JOIN pg_class c ON c.oid = st.relid
  ORDER BY pg_total_relation_size(c.oid) DESC
  LIMIT 25;
`);
console.log('\n--- 2. TOP 25 TABLES BY TOTAL SIZE ---');
console.table(topTablesRes.rows.map(r => ({
  table: r.table_name,
  rows: Number(r.row_estimate).toLocaleString(),
  data: r.data_pretty,
  index: r.index_pretty,
  total: r.total_pretty,
  pct_db: r.percent_of_db + '%'
})));

// 3. Search Outbox Detailed Breakdown
console.log('\n--- 3. SEARCH OUTBOX AUDIT ---');
const outboxStatusRes = await client.query(`
  SELECT 
    status,
    count(*) AS row_count,
    count(*) FILTER (WHERE created_at >= now() - interval '24 hours') AS lt_24h,
    count(*) FILTER (WHERE created_at < now() - interval '24 hours' AND created_at >= now() - interval '3 days') AS d1_3,
    count(*) FILTER (WHERE created_at < now() - interval '3 days' AND created_at >= now() - interval '7 days') AS d3_7,
    count(*) FILTER (WHERE created_at < now() - interval '7 days' AND created_at >= now() - interval '30 days') AS d7_30,
    count(*) FILTER (WHERE created_at < now() - interval '30 days') AS gt_30d,
    min(created_at) AS oldest,
    max(created_at) AS newest
  FROM public.atlas_search_outbox
  GROUP BY status;
`);
console.table(outboxStatusRes.rows);

const outboxSizeRes = await client.query(`
  SELECT 
    pg_size_pretty(pg_relation_size('public.atlas_search_outbox')) AS data_size,
    pg_size_pretty(pg_indexes_size('public.atlas_search_outbox')) AS index_size,
    pg_size_pretty(pg_total_relation_size('public.atlas_search_outbox')) AS total_size,
    pg_total_relation_size('public.atlas_search_outbox') AS total_bytes
`);
console.log('Outbox Physical Size:', outboxSizeRes.rows[0]);

// 4. Discovery Candidates Detailed Breakdown
console.log('\n--- 4. DISCOVERY CANDIDATES AUDIT ---');
const discSizeRes = await client.query(`
  SELECT 
    pg_size_pretty(pg_relation_size('public.atlas_people_discovery_candidates')) AS data_size,
    pg_size_pretty(pg_indexes_size('public.atlas_people_discovery_candidates')) AS index_size,
    pg_size_pretty(pg_total_relation_size('public.atlas_people_discovery_candidates')) AS total_size,
    pg_total_relation_size('public.atlas_people_discovery_candidates') AS total_bytes
`);
console.log('Discovery Candidates Size:', discSizeRes.rows[0]);

const discStatusRes = await client.query(`
  SELECT 
    current_activity_state,
    count(*) AS row_count
  FROM public.atlas_people_discovery_candidates
  GROUP BY current_activity_state;
`);
console.table(discStatusRes.rows);

// 5. Bloat & Dead Tuples
console.log('\n--- 5. TABLE BLOAT & DEAD TUPLES AUDIT ---');
const bloatRes = await client.query(`
  SELECT 
    st.schemaname || '.' || st.relname AS table_name,
    st.n_live_tup,
    st.n_dead_tup,
    ROUND(
      CASE WHEN (st.n_live_tup + st.n_dead_tup) > 0 
           THEN (st.n_dead_tup::numeric / (st.n_live_tup + st.n_dead_tup)::numeric) * 100 
           ELSE 0 END, 2
    ) AS dead_pct,
    st.last_vacuum,
    st.last_autovacuum,
    st.last_analyze,
    st.last_autoanalyze,
    pg_size_pretty(
      CASE WHEN (st.n_live_tup + st.n_dead_tup) > 0 
           THEN (pg_relation_size(c.oid) * (st.n_dead_tup::numeric / (st.n_live_tup + st.n_dead_tup)::numeric))::bigint
           ELSE 0 END
    ) AS estimated_reclaimable
  FROM pg_stat_user_tables st
  JOIN pg_class c ON c.oid = st.relid
  WHERE (st.n_live_tup + st.n_dead_tup) > 1000
  ORDER BY st.n_dead_tup DESC
  LIMIT 20;
`);
console.table(bloatRes.rows.map(r => ({
  table: r.table_name,
  live: Number(r.n_live_tup).toLocaleString(),
  dead: Number(r.n_dead_tup).toLocaleString(),
  dead_pct: r.dead_pct + '%',
  reclaimable: r.estimated_reclaimable,
  last_autovacuum: r.last_autovacuum ? new Date(r.last_autovacuum).toISOString() : 'never'
})));

// 6. Top 20 Indexes by Size & Usage
console.log('\n--- 6. TOP 20 INDEXES BY SIZE & USAGE AUDIT ---');
const indexRes = await client.query(`
  SELECT 
    schemaname || '.' || tablename AS table_name,
    indexname,
    idx_scan AS number_of_scans,
    pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname)::regclass)) AS index_size,
    pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname)::regclass) AS size_bytes
  FROM pg_stat_user_indexes
  ORDER BY pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname)::regclass) DESC
  LIMIT 25;
`);
console.table(indexRes.rows.map(r => ({
  table: r.table_name,
  index: r.indexname,
  size: r.index_size,
  scans: Number(r.number_of_scans).toLocaleString()
})));

await client.end();
