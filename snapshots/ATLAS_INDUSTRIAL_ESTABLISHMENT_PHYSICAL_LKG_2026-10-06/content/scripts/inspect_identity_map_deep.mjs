import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL for Deep Identity Map Inspection.');

  // 1. Instant Table, Index, and Total Relation Sizes from Catalog
  const sizeRes = await client.query(`
    SELECT 
      c.reltuples::bigint AS estimated_rows,
      pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
      pg_relation_size(c.oid) AS table_bytes,
      pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
      pg_indexes_size(c.oid) AS index_bytes,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
      pg_total_relation_size(c.oid) AS total_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'atlas_person_identity_map'
  `);
  console.log('=== CATALOG SIZES & ESTIMATED ROWS ===');
  console.log(JSON.stringify(sizeRes.rows[0], null, 2));

  // 2. Inventory all identity map indexes
  const indexRes = await client.query(`
    SELECT 
      i.indexrelname AS index_name,
      pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
      pg_relation_size(i.indexrelid) AS index_bytes,
      i.idx_scan,
      i.idx_tup_read,
      i.idx_tup_fetch,
      pg_get_indexdef(i.indexrelid) AS index_definition
    FROM pg_stat_user_indexes i
    WHERE i.relname = 'atlas_person_identity_map'
    ORDER BY pg_relation_size(i.indexrelid) DESC
  `);
  console.log('\n=== IDENTITY MAP INDEXES ===');
  console.log(JSON.stringify(indexRes.rows, null, 2));

  // 3. Cache hit rate for table and indexes
  const statioRes = await client.query(`
    SELECT 
      relname,
      heap_blks_read,
      heap_blks_hit,
      ROUND(100.0 * heap_blks_hit / GREATEST(1, heap_blks_hit + heap_blks_read), 2) AS heap_cache_hit_rate,
      idx_blks_read,
      idx_blks_hit,
      ROUND(100.0 * idx_blks_hit / GREATEST(1, idx_blks_hit + idx_blks_read), 2) AS idx_cache_hit_rate
    FROM pg_statio_user_tables
    WHERE relname = 'atlas_person_identity_map'
  `);
  console.log('\n=== CACHE HIT RATES ===');
  console.log(JSON.stringify(statioRes.rows[0], null, 2));

  // 4. Database engine settings
  const settingsRes = await client.query(`
    SELECT name, setting, unit 
    FROM pg_settings 
    WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem', 'max_connections')
  `);
  console.log('\n=== PG SETTINGS ===');
  console.log(JSON.stringify(settingsRes.rows, null, 2));

  // 5. Disk space / database size
  const dbSizeRes = await client.query(`
    SELECT 
      datname,
      pg_size_pretty(pg_database_size(datname)) AS db_size,
      pg_database_size(datname) AS db_bytes
    FROM pg_database 
    WHERE datname = current_database()
  `);
  console.log('\n=== DATABASE SIZE ===', dbSizeRes.rows[0]);

  // 6. Check Outbox V2 row counts and oldest age
  const outboxRes = await client.query(`
    SELECT 
      c.reltuples::bigint AS outbox_v2_estimated_rows,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS outbox_v2_total_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'atlas_search_outbox_v2'
  `);
  console.log('\n=== OUTBOX V2 CATALOG ===', outboxRes.rows[0]);

  // 7. Exact count of identity map with 60s timeout
  console.log('\nFetching exact count of atlas_person_identity_map with 60s timeout...');
  await client.query('SET statement_timeout = 60000');
  const countRes = await client.query('SELECT count(*) AS total_rows FROM public.atlas_person_identity_map');
  console.log(`IDENTITY_MAP_ROWS = ${countRes.rows[0].total_rows}`);

  await client.end();
}

main().catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
