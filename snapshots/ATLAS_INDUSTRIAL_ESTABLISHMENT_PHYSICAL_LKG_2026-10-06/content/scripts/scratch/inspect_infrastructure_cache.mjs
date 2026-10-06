import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    const sizeRes = await client.query(`
      SELECT 
        pg_size_pretty(pg_total_relation_size('atlas_person_identity_map')) AS identity_map_total,
        pg_size_pretty(pg_relation_size('atlas_person_identity_map')) AS identity_map_table,
        pg_size_pretty(pg_indexes_size('atlas_person_identity_map')) AS identity_map_indexes,
        pg_total_relation_size('atlas_person_identity_map') AS identity_map_total_bytes,
        pg_indexes_size('atlas_person_identity_map') AS identity_map_indexes_bytes,
        pg_size_pretty(pg_total_relation_size('atlas_search_outbox')) AS outbox_total,
        pg_size_pretty(pg_indexes_size('atlas_search_outbox')) AS outbox_indexes,
        pg_total_relation_size('atlas_search_outbox') AS outbox_total_bytes,
        pg_indexes_size('atlas_search_outbox') AS outbox_indexes_bytes,
        pg_size_pretty(pg_database_size(current_database())) AS total_db_size
    `);
    console.log('--- RELATION SIZES ---');
    console.log(sizeRes.rows[0]);

    const statRes = await client.query(`
      SELECT 
        relname,
        heap_blks_read,
        heap_blks_hit,
        idx_blks_read,
        idx_blks_hit
      FROM pg_statio_user_tables
      WHERE relname IN ('atlas_person_identity_map', 'atlas_search_outbox')
    `);
    console.log('\n--- I/O HIT / READ STATS ---');
    console.log(statRes.rows);

    const settingRes = await client.query(`
      SELECT name, setting, unit, context
      FROM pg_settings
      WHERE name IN ('shared_buffers', 'work_mem', 'maintenance_work_mem', 'effective_cache_size')
    `);
    console.log('\n--- BUFFER SETTINGS ---');
    console.log(settingRes.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
