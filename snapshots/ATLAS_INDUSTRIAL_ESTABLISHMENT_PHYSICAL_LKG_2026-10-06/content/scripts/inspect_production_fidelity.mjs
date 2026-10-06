import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const idxRes = await pool.query(`
    SELECT tablename, indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename IN ('atlas_person_identity_map', 'atlas_search_outbox')
    ORDER BY tablename, indexname;
  `);
  console.log('Production indexes:', idxRes.rows);

  const szRes = await pool.query(`
    SELECT 
      relname,
      pg_size_pretty(pg_relation_size(c.oid)) as table_size,
      pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
      pg_relation_size(c.oid) as table_bytes,
      pg_indexes_size(c.oid) as index_bytes,
      pg_total_relation_size(c.oid) as total_bytes,
      reltuples as row_estimate,
      relpersistence
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND relname IN ('atlas_person_identity_map', 'atlas_search_outbox');
  `);
  console.log('Production sizes:', szRes.rows);

  await pool.end();
}

main().catch(console.error);
