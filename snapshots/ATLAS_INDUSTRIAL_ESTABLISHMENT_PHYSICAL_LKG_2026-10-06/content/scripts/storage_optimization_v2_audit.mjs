import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();
await client.query("SET statement_timeout = '60s'");

console.log('=== RUNNING ATLAS STORAGE OPTIMIZATION V2 PHYSICAL AUDIT ===\n');

// 1. Current DB & Disk
const dbSizeRes = await client.query(`
  SELECT 
    pg_database_size(current_database()) AS db_size_bytes,
    pg_size_pretty(pg_database_size(current_database())) AS db_size_pretty
`);
console.log('Database Size:', dbSizeRes.rows[0]);

// 2. Section 1: atlas_person_identity_map
console.log('\n--- SECTION 1: IDENTITY SSOT AUDIT ---');
const identitySsot = await client.query(`
  SELECT 
    c.relname,
    c.reltuples::bigint AS row_estimate,
    pg_relation_size(c.oid) AS heap_bytes,
    pg_size_pretty(pg_relation_size(c.oid)) AS heap_pretty,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_pretty,
    pg_total_relation_size(c.oid) AS total_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'atlas_person_identity_map';
`);
console.table(identitySsot.rows);

const identityIndexes = await client.query(`
  SELECT 
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
  FROM pg_stat_user_indexes
  WHERE relname = 'atlas_person_identity_map';
`);
console.table(identityIndexes.rows);

// 3. Section 2: Hot Maps Audit
console.log('\n--- SECTION 2: HOT MAPS AUDIT ---');
const hotMaps = await client.query(`
  SELECT 
    c.relname,
    c.reltuples::bigint AS row_estimate,
    pg_relation_size(c.oid) AS heap_bytes,
    pg_size_pretty(pg_relation_size(c.oid)) AS heap_pretty,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_pretty,
    pg_total_relation_size(c.oid) AS total_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('atlas_hot_source_key_map', 'atlas_hot_national_identity_map');
`);
console.table(hotMaps.rows);

const hotMapIndexes = await client.query(`
  SELECT 
    relname,
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
  FROM pg_stat_user_indexes
  WHERE relname IN ('atlas_hot_source_key_map', 'atlas_hot_national_identity_map')
  ORDER BY relname, pg_relation_size(indexrelid) DESC;
`);
console.table(hotMapIndexes.rows);

// 4. Section 3: Search Outbox Audit
console.log('\n--- SECTION 3: SEARCH OUTBOX AUDIT ---');
const outboxPhysical = await client.query(`
  SELECT 
    c.relname,
    c.reltuples::bigint AS row_estimate,
    pg_relation_size(c.oid) AS heap_bytes,
    pg_size_pretty(pg_relation_size(c.oid)) AS heap_pretty,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_pretty,
    COALESCE(pg_total_relation_size(c.reltoastrelid), 0) AS toast_bytes,
    pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid), 0)) AS toast_pretty,
    pg_total_relation_size(c.oid) AS total_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'atlas_search_outbox';
`);
console.table(outboxPhysical.rows);

const outboxStatus = await client.query(`
  SELECT 
    status,
    COUNT(*) AS count
  FROM atlas_search_outbox
  GROUP BY status;
`);
console.table(outboxStatus.rows);

// Check if partitioned outbox exists or outbox v2 exists
const outboxV2Tables = await client.query(`
  SELECT relname, relkind 
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname LIKE '%outbox%';
`);
console.log('Outbox-related tables in public:', outboxV2Tables.rows);

// 5. Section 11 & 12: Discovery Candidates Audit
console.log('\n--- SECTION 11 & 12: DISCOVERY CANDIDATES AUDIT ---');
const candidatesPhysical = await client.query(`
  SELECT 
    c.relname,
    c.reltuples::bigint AS row_estimate,
    pg_relation_size(c.oid) AS heap_bytes,
    pg_size_pretty(pg_relation_size(c.oid)) AS heap_pretty,
    pg_indexes_size(c.oid) AS index_bytes,
    pg_size_pretty(pg_indexes_size(c.oid)) AS index_pretty,
    COALESCE(pg_total_relation_size(c.reltoastrelid), 0) AS toast_bytes,
    pg_size_pretty(COALESCE(pg_total_relation_size(c.reltoastrelid), 0)) AS toast_pretty,
    pg_total_relation_size(c.oid) AS total_bytes,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_pretty
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'atlas_people_discovery_candidates';
`);
console.table(candidatesPhysical.rows);

const candidatesStatus = await client.query(`
  SELECT 
    status,
    COUNT(*) AS count
  FROM atlas_people_discovery_candidates
  GROUP BY status;
`);
console.table(candidatesStatus.rows);

// Columns breakdown
const columnsStats = await client.query(`
  SELECT 
    column_name,
    data_type
  FROM information_schema.columns
  WHERE table_name = 'atlas_people_discovery_candidates'
  ORDER BY ordinal_position;
`);
console.log('Candidates Columns:', columnsStats.rows);

// 6. Section 16: Top 30 Indexes
console.log('\n--- SECTION 16: TOP 30 INDEXES AUDIT ---');
const topIndexes = await client.query(`
  SELECT 
    ui.schemaname,
    ui.relname AS table_name,
    ui.indexrelname AS index_name,
    pg_relation_size(ui.indexrelid) AS size_bytes,
    pg_size_pretty(pg_relation_size(ui.indexrelid)) AS size_pretty,
    ui.idx_scan,
    ui.idx_tup_read,
    ui.idx_tup_fetch,
    idx.indisunique AS is_unique,
    idx.indisprimary AS is_primary
  FROM pg_stat_user_indexes ui
  JOIN pg_index idx ON idx.indexrelid = ui.indexrelid
  ORDER BY pg_relation_size(ui.indexrelid) DESC
  LIMIT 30;
`);
console.table(topIndexes.rows);

await client.end();
