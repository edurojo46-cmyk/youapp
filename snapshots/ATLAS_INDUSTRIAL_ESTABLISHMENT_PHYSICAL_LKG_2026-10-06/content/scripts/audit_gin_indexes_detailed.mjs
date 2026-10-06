import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  console.log('=== SECTION 4: AUDIT THE FIVE GIN INDEXES ===');

  const ginIndexes = await pool.query(`
    SELECT 
      i.relname AS index_name,
      pg_get_indexdef(i.oid) AS index_def,
      ROUND((pg_relation_size(i.oid)::numeric / (1024*1024)), 2) AS index_size_mb,
      s.idx_scan,
      s.idx_tup_read,
      s.idx_tup_fetch,
      s.last_idx_scan
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_am am ON i.relam = am.oid
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
    WHERE t.relname = 'atlas_people_discovery_candidates'
      AND am.amname = 'gin'
    ORDER BY pg_relation_size(i.oid) DESC;
  `);

  console.log(`Found ${ginIndexes.rows.length} GIN indexes on atlas_people_discovery_candidates:`);
  console.table(ginIndexes.rows.map(r => ({
    index_name: r.index_name,
    size_mb: r.index_size_mb,
    idx_scan: r.idx_scan,
    tup_read: r.idx_tup_read,
    tup_fetch: r.idx_tup_fetch,
    last_scan: r.last_idx_scan
  })));

  for (const row of ginIndexes.rows) {
    console.log(`\n[${row.index_name}] Size: ${row.index_size_mb} MB | Scans: ${row.idx_scan}`);
    console.log(`  Definition: ${row.index_def}`);
  }

  // Check normalization function in PostgreSQL
  const normFunc = await pool.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'normalize_search_document';
  `);
  if (normFunc.rows.length > 0) {
    console.log('\n--- normalize_search_document Function ---');
    console.log(normFunc.rows[0].prosrc);
  }

  await pool.end();
}

run().catch(console.error);
