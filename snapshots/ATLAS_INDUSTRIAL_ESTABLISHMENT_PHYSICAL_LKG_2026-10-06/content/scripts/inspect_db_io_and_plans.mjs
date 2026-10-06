import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function run() {
  console.log('=== DATABASE IO BASELINE & SCHEMA INSPECTION ===');

  // 1. Database wait events & connections
  const waitEvents = await pool.query(`
    SELECT wait_event_type, wait_event, count(*) as count
    FROM pg_stat_activity
    WHERE pid <> pg_backend_pid()
    GROUP BY wait_event_type, wait_event
    ORDER BY count DESC;
  `);
  console.log('\n--- ACTIVE WAIT EVENTS ---');
  console.table(waitEvents.rows);

  const conns = await pool.query(`
    SELECT 
      count(*) FILTER (WHERE state = 'active') as active_connections,
      count(*) FILTER (WHERE wait_event IS NOT NULL AND state = 'active') as waiting_connections,
      count(*) as total_connections
    FROM pg_stat_activity;
  `);
  console.log('\n--- CONNECTIONS ---');
  console.table(conns.rows);

  // 2. Table IO stats
  const tableIo = await pool.query(`
    SELECT 
      relname,
      heap_blks_read,
      heap_blks_hit,
      idx_blks_read,
      idx_blks_hit,
      toast_blks_read,
      toast_blks_hit,
      ROUND((heap_blks_hit::numeric / NULLIF(heap_blks_hit + heap_blks_read, 0)) * 100, 2) AS heap_hit_ratio,
      ROUND((idx_blks_hit::numeric / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) AS idx_hit_ratio
    FROM pg_statio_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map', 'atlas_search_outbox_v2', 'atlas_search_delivery_keys')
    ORDER BY (heap_blks_read + idx_blks_read) DESC;
  `);
  console.log('\n--- TABLE IO STATS ---');
  console.table(tableIo.rows);

  // 3. Index IO stats
  const indexIo = await pool.query(`
    SELECT 
      relname,
      indexrelname,
      idx_blks_read,
      idx_blks_hit,
      ROUND((idx_blks_hit::numeric / NULLIF(idx_blks_hit + idx_blks_read, 0)) * 100, 2) AS hit_ratio
    FROM pg_statio_user_indexes
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map', 'atlas_search_outbox_v2', 'atlas_search_delivery_keys')
    ORDER BY idx_blks_read DESC;
  `);
  console.log('\n--- INDEX IO STATS ---');
  console.table(indexIo.rows);

  // 4. Index definitions & sizes
  const indexDefs = await pool.query(`
    SELECT 
      t.relname AS table_name,
      i.relname AS index_name,
      pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
      pg_relation_size(i.oid) AS index_size_bytes,
      s.idx_scan,
      s.idx_tup_read,
      s.idx_tup_fetch,
      pg_get_indexdef(i.oid) AS index_def
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
    WHERE t.relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map')
    ORDER BY t.relname, pg_relation_size(i.oid) DESC;
  `);
  console.log('\n--- INDEX DEFINITIONS & USAGE ---');
  for (const row of indexDefs.rows) {
    console.log(`[${row.table_name}] ${row.index_name} (${row.index_size}) | scans: ${row.idx_scan}, tup_read: ${row.idx_tup_read}, tup_fetch: ${row.idx_tup_fetch}`);
    console.log(`   DEF: ${row.index_def}`);
  }

  // 5. Table bloat & tuple stats
  const tableStats = await pool.query(`
    SELECT 
      relname,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_size_pretty(pg_relation_size(relid)) AS table_size,
      pg_size_pretty(pg_indexes_size(relid)) AS indexes_size,
      n_live_tup,
      n_dead_tup,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    FROM pg_stat_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map', 'atlas_search_outbox_v2', 'atlas_search_delivery_keys')
    ORDER BY pg_total_relation_size(relid) DESC;
  `);
  console.log('\n--- TABLE TUPLE & BLOAT STATS ---');
  console.table(tableStats.rows);

  // 6. Inspect triggers on both tables
  const triggers = await pool.query(`
    SELECT 
      event_object_table,
      trigger_name,
      event_manipulation,
      action_timing,
      action_statement
    FROM information_schema.triggers
    WHERE event_object_table IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map', 'atlas_search_outbox_v2', 'atlas_search_delivery_keys')
    ORDER BY event_object_table, trigger_name;
  `);
  console.log('\n--- TRIGGERS ---');
  console.table(triggers.rows);

  // 7. Check process_search_outbox_batch source code
  const proc = await pool.query(`
    SELECT proname, prosrc
    FROM pg_proc
    WHERE proname = 'process_search_outbox_batch';
  `);
  if (proc.rows.length > 0) {
    console.log('\n--- process_search_outbox_batch SOURCE ---');
    console.log(proc.rows[0].prosrc);
  }

  await pool.end();
}

run().catch(console.error);
