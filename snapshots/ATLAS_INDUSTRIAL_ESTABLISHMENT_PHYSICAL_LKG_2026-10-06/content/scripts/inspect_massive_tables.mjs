import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- INSPECTING SUSPICIOUS MASSIVE TABLES ---');
const hotTables = ['atlas_hot_source_key_map', 'atlas_hot_national_identity_map', 'atlas_search_outbox_v2', 'atlas_search_outbox_minimal'];

for (const t of hotTables) {
  try {
    const size = await client.query(`
      SELECT 
        pg_size_pretty(pg_relation_size('public.${t}')) AS data_size,
        pg_size_pretty(pg_indexes_size('public.${t}')) AS index_size,
        pg_size_pretty(pg_total_relation_size('public.${t}')) AS total_size
    `);
    const stat = await client.query(`
      SELECT n_live_tup, n_dead_tup, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
      FROM pg_stat_user_tables WHERE relname = '${t}'
    `);
    const idx = await client.query(`
      SELECT indexrelname, idx_scan
      FROM pg_stat_user_indexes WHERE relname = '${t}'
    `);
    const sample = await client.query(`
      SELECT * FROM public.${t} LIMIT 1
    `);
    console.log(`\nTable: public.${t}`);
    console.log('  Size:', size.rows[0]);
    console.log('  Stats:', stat.rows[0]);
    console.log('  Index scans:', idx.rows);
    console.log('  Sample keys:', sample.rows[0] ? Object.keys(sample.rows[0]) : 'empty');
  } catch (e) {
    console.log(`Error inspecting ${t}:`, e.message);
  }
}

await client.end();
