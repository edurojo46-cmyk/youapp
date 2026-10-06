import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== 1. TOP 30 INDEXES AUDIT ===');
const topIndexes = await client.query(`
  SELECT 
    ui.relname AS table_name,
    ui.indexrelname AS index_name,
    pg_size_pretty(pg_relation_size(ui.indexrelid)) AS size_pretty,
    pg_relation_size(ui.indexrelid) AS size_bytes,
    ui.idx_scan,
    ui.idx_tup_read,
    ui.idx_tup_fetch,
    idx.indisunique AS is_unique,
    idx.indisprimary AS is_primary,
    con.conname AS constraint_name,
    con.contype AS constraint_type
  FROM pg_stat_user_indexes ui
  JOIN pg_index idx ON idx.indexrelid = ui.indexrelid
  LEFT JOIN pg_constraint con ON con.conindid = ui.indexrelid
  ORDER BY pg_relation_size(ui.indexrelid) DESC
  LIMIT 30;
`);
console.table(topIndexes.rows.map(r => ({
  table: r.table_name,
  index: r.index_name,
  size: r.size_pretty,
  scans: r.idx_scan,
  read: r.idx_tup_read,
  fetch: r.idx_tup_fetch,
  uniq: r.is_unique,
  pk: r.is_primary,
  constraint: r.constraint_name || 'NONE'
})));

console.log('\n=== 2. OUTBOX INDEX USAGE ===');
const outboxIndexes = await client.query(`
  SELECT 
    indexrelname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
  FROM pg_stat_user_indexes
  WHERE relname = 'atlas_search_outbox'
  ORDER BY pg_relation_size(indexrelid) DESC;
`);
console.table(outboxIndexes.rows);

console.log('\n=== 3. CANDIDATES INDEXED SAMPLE (USING LAST_SEEN_AT INDEX) ===');
const candSample = await client.query(`
  SELECT discovery_id, current_activity_state, last_seen_at, source_id, atlas_person_id 
  FROM atlas_people_discovery_candidates 
  ORDER BY last_seen_at DESC 
  LIMIT 10;
`);
console.table(candSample.rows);

console.log('\n=== 4. TOTAL DB & TABLE SIZES ===');
const dbTotals = await client.query(`
  SELECT 
    pg_size_pretty(pg_database_size(current_database())) as db_total,
    pg_size_pretty(sum(pg_relation_size(c.oid))) as tables_data_total,
    pg_size_pretty(sum(pg_indexes_size(c.oid))) as indexes_total,
    pg_size_pretty(sum(COALESCE(pg_total_relation_size(c.reltoastrelid), 0))) as toast_total
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';
`);
console.table(dbTotals.rows);

await client.end();
