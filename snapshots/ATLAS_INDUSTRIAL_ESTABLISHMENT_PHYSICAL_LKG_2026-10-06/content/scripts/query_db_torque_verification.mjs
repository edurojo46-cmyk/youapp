import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());

async function run() {
  await client.connect();
  console.log('--- CONNECTED TO POSTGRESQL ---');

  // 1. Cardinality & Table Sizes
  console.log('Setting statement_timeout to 180s...');
  await client.query("SET statement_timeout = '180s'");

  console.log('Querying exact count of atlas_person_identity_map...');
  const countRes = await client.query('SELECT count(*) AS total_rows FROM atlas_person_identity_map');
  const totalRows = Number(countRes.rows[0].total_rows);

  const sizeRes = await client.query(`
    SELECT
      pg_size_pretty(pg_relation_size('atlas_person_identity_map')) AS table_size,
      pg_relation_size('atlas_person_identity_map') AS table_bytes,
      pg_size_pretty(pg_indexes_size('atlas_person_identity_map')) AS index_size,
      pg_indexes_size('atlas_person_identity_map') AS index_bytes,
      pg_size_pretty(pg_total_relation_size('atlas_person_identity_map')) AS total_size,
      pg_total_relation_size('atlas_person_identity_map') AS total_bytes
  `);

  // 2. Indexes Inventory
  const indexInventoryRes = await client.query(`
    SELECT
      i.relname AS index_name,
      pg_size_pretty(pg_relation_size(i.oid)) AS index_size,
      pg_relation_size(i.oid) AS index_bytes,
      s.idx_scan,
      s.idx_tup_read,
      s.idx_tup_fetch,
      pg_get_indexdef(i.oid) AS index_definition
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
    WHERE t.relname = 'atlas_person_identity_map'
    ORDER BY pg_relation_size(i.oid) DESC
  `);

  // 3. Cache & I/O Stats
  const cacheRes = await client.query(`
    SELECT
      heap_blks_read,
      heap_blks_hit,
      idx_blks_read,
      idx_blks_hit
    FROM pg_statio_user_tables
    WHERE relname = 'atlas_person_identity_map'
  `);
  const c = cacheRes.rows[0] || {};
  const heapHitRate = (Number(c.heap_blks_hit) / Math.max(Number(c.heap_blks_hit) + Number(c.heap_blks_read), 1)) * 100;
  const idxHitRate = (Number(c.idx_blks_hit) / Math.max(Number(c.idx_blks_hit) + Number(c.idx_blks_read), 1)) * 100;

  // 4. Memory Settings
  const settingsRes = await client.query(`
    SELECT name, setting, unit, current_setting(name) AS formatted
    FROM pg_settings
    WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem', 'max_connections')
  `);

  // 5. Outbox V2 Status
  const outboxRes = await client.query(`
    SELECT
      count(*) AS pending_rows,
      COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))), 0) AS oldest_age_seconds
    FROM atlas_search_outbox_v2
    WHERE status = 'pending'
  `);

  // 6. Database Total Size
  const dbSizeRes = await client.query(`
    SELECT 
      pg_database.datname,
      pg_size_pretty(pg_database_size(pg_database.datname)) AS db_size,
      pg_database_size(pg_database.datname) AS db_bytes
    FROM pg_database
    WHERE datname = current_database()
  `);

  const results = {
    cardinality: {
      total_rows: totalRows,
      table_size: sizeRes.rows[0].table_size,
      table_bytes: Number(sizeRes.rows[0].table_bytes),
      index_size: sizeRes.rows[0].index_size,
      index_bytes: Number(sizeRes.rows[0].index_bytes),
      total_size: sizeRes.rows[0].total_size,
      total_bytes: Number(sizeRes.rows[0].total_bytes)
    },
    indexes: indexInventoryRes.rows,
    cache_io: {
      heap_blks_read: Number(c.heap_blks_read),
      heap_blks_hit: Number(c.heap_blks_hit),
      heap_cache_hit_rate_pct: Number(heapHitRate.toFixed(2)),
      idx_blks_read: Number(c.idx_blks_read),
      idx_blks_hit: Number(c.idx_blks_hit),
      index_cache_hit_rate_pct: Number(idxHitRate.toFixed(2))
    },
    settings: settingsRes.rows,
    outbox_v2: {
      pending_rows: Number(outboxRes.rows[0]?.pending_rows || 0),
      oldest_pending_age_seconds: Number(outboxRes.rows[0]?.oldest_age_seconds || 0)
    },
    database: dbSizeRes.rows[0]
  };

  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync('reports/atlas/realtime/db_torque_verification.json', JSON.stringify(results, null, 2), 'utf8');

  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
