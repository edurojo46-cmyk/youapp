import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- 5. TABLE BLOAT & DEAD TUPLES ---');
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
    st.last_autovacuum,
    pg_size_pretty(
      CASE WHEN (st.n_live_tup + st.n_dead_tup) > 0 
           THEN (pg_relation_size(c.oid) * (st.n_dead_tup::numeric / (st.n_live_tup + st.n_dead_tup)::numeric))::bigint
           ELSE 0 END
    ) AS estimated_reclaimable,
    CASE WHEN (st.n_live_tup + st.n_dead_tup) > 0 
         THEN (pg_relation_size(c.oid) * (st.n_dead_tup::numeric / (st.n_live_tup + st.n_dead_tup)::numeric))::bigint
         ELSE 0 END AS reclaimable_bytes
  FROM pg_stat_user_tables st
  JOIN pg_class c ON c.oid = st.relid
  WHERE st.n_dead_tup > 1000
  ORDER BY st.n_dead_tup DESC
  LIMIT 20;
`);
console.table(bloatRes.rows.map(r => ({
  table: r.table_name,
  live: Number(r.n_live_tup).toLocaleString(),
  dead: Number(r.n_dead_tup).toLocaleString(),
  dead_pct: r.dead_pct + '%',
  reclaimable: r.estimated_reclaimable,
  autovacuum: r.last_autovacuum ? new Date(r.last_autovacuum).toISOString() : 'never'
})));

const totalReclaimableBytes = bloatRes.rows.reduce((sum, r) => sum + Number(r.reclaimable_bytes), 0);
console.log('Total Estimated Reclaimable Table Bloat:', (totalReclaimableBytes / (1024*1024*1024)).toFixed(2) + ' GB');

console.log('\n--- 6. TOP 20 INDEXES BY SIZE & USAGE ---');
const indexRes = await client.query(`
  SELECT 
    schemaname || '.' || relname AS table_name,
    indexrelname AS index_name,
    idx_scan AS number_of_scans,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    pg_relation_size(indexrelid) AS size_bytes
  FROM pg_stat_user_indexes
  ORDER BY pg_relation_size(indexrelid) DESC
  LIMIT 25;
`);
console.table(indexRes.rows.map(r => ({
  table: r.table_name,
  index: r.index_name,
  size: r.index_size,
  scans: Number(r.number_of_scans).toLocaleString(),
  unused_candidate: Number(r.number_of_scans) <= 10 ? 'YES' : 'NO'
})));

await client.end();
