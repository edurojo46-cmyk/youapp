import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- 3. OUTBOX BREAKDOWN (STATUS & AGES) ---');
const statuses = ['PENDING', 'PROCESSING', 'PUBLISHED', 'QUARANTINED', 'RETRY'];
const statusCounts = {};

for (const s of statuses) {
  const r = await client.query(`
    SELECT count(*) as cnt 
    FROM public.atlas_search_outbox 
    WHERE status = $1;
  `, [s]);
  statusCounts[s] = Number(r.rows[0].cnt);
}
console.log('Outbox Status Counts:', statusCounts);

// Sample published rows to get accurate age distribution
const sampleAge = await client.query(`
  SELECT 
    CASE 
      WHEN created_at >= now() - interval '24 hours' THEN '< 24H'
      WHEN created_at >= now() - interval '3 days' THEN '1 - 3 DAYS'
      WHEN created_at >= now() - interval '7 days' THEN '3 - 7 DAYS'
      WHEN created_at >= now() - interval '30 days' THEN '7 - 30 DAYS'
      ELSE '> 30 DAYS'
    END AS age_bucket,
    count(*) AS bucket_count
  FROM (
    SELECT created_at 
    FROM public.atlas_search_outbox 
    WHERE status = 'PUBLISHED' 
    LIMIT 50000
  ) sub
  GROUP BY 1;
`);
console.log('Outbox Published Age Sample (extrapolated):', sampleAge.rows);

// Min and max created_at for published
const minMax = await client.query(`
  SELECT 
    (SELECT min(created_at) FROM (SELECT created_at FROM public.atlas_search_outbox ORDER BY outbox_id ASC LIMIT 1) s1) as oldest,
    (SELECT max(created_at) FROM (SELECT created_at FROM public.atlas_search_outbox ORDER BY outbox_id DESC LIMIT 1) s2) as newest;
`);
console.log('Outbox Timestamps Range:', minMax.rows[0]);

console.log('\n--- 4. DISCOVERY CANDIDATES BREAKDOWN ---');
const discCounts = await client.query(`
  SELECT 
    COALESCE(current_activity_state, 'NULL') as state,
    count(*) as count
  FROM public.atlas_people_discovery_candidates
  GROUP BY current_activity_state;
`);
console.log('Discovery Candidates Statuses:', discCounts.rows);

console.log('\n--- 5. TABLE BLOAT & DEAD TUPLES ---');
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
  WHERE st.n_dead_tup > 5000
  ORDER BY st.n_dead_tup DESC
  LIMIT 15;
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
    schemaname || '.' || tablename AS table_name,
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
