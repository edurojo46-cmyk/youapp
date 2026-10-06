import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  console.log('=== SECTION 6 & 11: CREATING PARTIAL TARGET INDEX CONCURRENTLY ===');

  const checkRes = await pool.query(`
    SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) as size
    FROM pg_stat_user_indexes
    WHERE indexrelname = 'idx_candidates_active_target_partial';
  `);

  if (checkRes.rows.length === 0) {
    console.log('Creating idx_candidates_active_target_partial CONCURRENTLY...');
    const t0 = Date.now();
    await pool.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_candidates_active_target_partial
      ON public.atlas_people_discovery_candidates (target_region, atlas_person_id)
      WHERE (current_activity_state = 'ACTIVE' AND geo_confidence >= 0.80 AND target_region IN ('CABA', 'PBA'));
    `);
    console.log(`Index created in ${Date.now() - t0}ms!`);
  } else {
    console.log('Index already exists with size:', checkRes.rows[0].size);
  }

  console.log('Running ANALYZE public.atlas_people_discovery_candidates...');
  const t1 = Date.now();
  await pool.query('ANALYZE public.atlas_people_discovery_candidates;');
  console.log(`ANALYZE completed in ${Date.now() - t1}ms!`);

  // Verify index size and status
  const indexInfo = await pool.query(`
    SELECT 
      i.relname as index_name,
      pg_size_pretty(pg_relation_size(i.oid)) as index_size,
      ix.indisvalid,
      ix.indisready
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE i.relname = 'idx_candidates_active_target_partial';
  `);
  console.table(indexInfo.rows);

  // Test Canonical Denominator Query Plan
  console.log('\n--- VERIFYING CANONICAL DENOMINATOR QUERY PLAN ---');
  const t2 = performance.now();
  const explainPlan = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT 
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region IN ('CABA', 'PBA')) AS canonical_total,
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region = 'CABA') AS canonical_caba,
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region = 'PBA') AS canonical_pba
    FROM atlas_people_discovery_candidates c 
    JOIN atlas_person_identity_map m ON c.atlas_person_id = m.atlas_person_id 
    WHERE c.target_region IN ('CABA', 'PBA') 
      AND c.current_activity_state = 'ACTIVE' 
      AND c.geo_confidence >= 0.80;
  `);
  const dur = performance.now() - t2;
  console.log(explainPlan.rows.map(r => r['QUERY PLAN']).join('\n'));
  console.log(`Total execution time: ${dur.toFixed(2)}ms`);

  await pool.end();
}

run().catch(console.error);
