import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  console.log('=== SECTION 7: CHECK INDEX BLOAT ===');

  // Bloat estimation query for BTree indexes
  const bloatSql = `
    SELECT
      schemaname, 
      relname, 
      indexrelname,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
      pg_size_pretty(pg_relation_size(relid)) as table_size,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch
    FROM pg_stat_user_indexes
    WHERE indexrelname IN (
      'idx_identity_map_atlas_person_id',
      'uq_person_identity_source',
      'idx_identity_map_identifier',
      'atlas_person_identity_map_pkey',
      'idx_discovery_candidates_search_normalized_trgm',
      'uq_discovery_candidate_source',
      'atlas_people_discovery_candidates_pkey',
      'idx_discovery_candidates_person_id'
    )
    ORDER BY pg_relation_size(indexrelid) DESC;
  `;
  const res = await pool.query(bloatSql);
  console.table(res.rows);

  // Check dead tuples and live tuples
  const tupSql = `
    SELECT 
      relname,
      n_live_tup,
      n_dead_tup,
      ROUND((n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0)) * 100, 2) AS dead_tup_ratio,
      last_vacuum,
      last_autovacuum,
      last_analyze,
      last_autoanalyze
    FROM pg_stat_user_tables
    WHERE relname IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map');
  `;
  const tupRes = await pool.query(tupSql);
  console.table(tupRes.rows);

  await pool.end();
}

run().catch(console.error);
