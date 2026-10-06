import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  console.log('=== SECTION 9: SORTED LOOKUP LOCALITY TEST ===');

  // Sample 100 actual atlas_person_ids
  const sampleRes = await pool.query(`
    SELECT atlas_person_id FROM atlas_person_identity_map ORDER BY id DESC LIMIT 100;
  `);
  const unsortedIds = sampleRes.rows.map(r => r.atlas_person_id);
  const sortedIds = [...unsortedIds].sort();

  // Test 1: UNSORTED 100 with NOT EXISTS
  console.log('\n--- 1. UNSORTED 100 (NOT EXISTS) ---');
  const t0 = performance.now();
  const planUnsorted = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    WITH incoming_ids AS (
      SELECT unnest($1::text[]) AS atlas_person_id
    )
    SELECT DISTINCT i.atlas_person_id
    FROM incoming_ids i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atlas_person_identity_map existing
      WHERE existing.atlas_person_id = i.atlas_person_id
    );
  `, [unsortedIds]);
  const durUnsorted = performance.now() - t0;
  console.log(planUnsorted.rows.map(r => r['QUERY PLAN']).join('\n'));
  console.log(`Wall clock time: ${durUnsorted.toFixed(2)}ms`);

  // Test 2: SORTED 100 with NOT EXISTS
  console.log('\n--- 2. SORTED 100 (NOT EXISTS) ---');
  const t1 = performance.now();
  const planSorted = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    WITH incoming_ids AS (
      SELECT unnest($1::text[]) AS atlas_person_id
    )
    SELECT DISTINCT i.atlas_person_id
    FROM incoming_ids i
    WHERE NOT EXISTS (
      SELECT 1 FROM public.atlas_person_identity_map existing
      WHERE existing.atlas_person_id = i.atlas_person_id
    );
  `, [sortedIds]);
  const durSorted = performance.now() - t1;
  console.log(planSorted.rows.map(r => r['QUERY PLAN']).join('\n'));
  console.log(`Wall clock time: ${durSorted.toFixed(2)}ms`);

  // Test 3: Alternative formulation: LEFT JOIN WHERE existing.atlas_person_id IS NULL
  console.log('\n--- 3. SORTED 100 (LEFT JOIN) ---');
  const t2 = performance.now();
  const planJoin = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    WITH incoming_ids AS (
      SELECT unnest($1::text[]) AS atlas_person_id
    )
    SELECT i.atlas_person_id
    FROM incoming_ids i
    LEFT JOIN public.atlas_person_identity_map existing ON existing.atlas_person_id = i.atlas_person_id
    WHERE existing.atlas_person_id IS NULL;
  `, [sortedIds]);
  const durJoin = performance.now() - t2;
  console.log(planJoin.rows.map(r => r['QUERY PLAN']).join('\n'));
  console.log(`Wall clock time: ${durJoin.toFixed(2)}ms`);

  // Test 4: Alternative formulation: EXCEPT
  console.log('\n--- 4. SORTED 100 (EXCEPT) ---');
  const t3 = performance.now();
  const planExcept = await pool.query(`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT unnest($1::text[]) AS atlas_person_id
    EXCEPT
    SELECT existing.atlas_person_id 
    FROM public.atlas_person_identity_map existing 
    WHERE existing.atlas_person_id = ANY($1::text[]);
  `, [sortedIds]);
  const durExcept = performance.now() - t3;
  console.log(planExcept.rows.map(r => r['QUERY PLAN']).join('\n'));
  console.log(`Wall clock time: ${durExcept.toFixed(2)}ms`);

  await pool.end();
}

run().catch(console.error);
