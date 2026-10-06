import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  // Let's sample 100 IDs from different ranges (simulating realistic batch)
  const sampleRes = await pool.query(`
    SELECT atlas_person_id FROM atlas_person_identity_map 
    WHERE id IN (
      SELECT id FROM atlas_person_identity_map TABLESAMPLE SYSTEM (0.1) LIMIT 100
    );
  `);
  const unsortedIds = sampleRes.rows.map(r => r.atlas_person_id);
  const sortedIds = [...unsortedIds].sort();

  console.log('Testing Unsorted vs Sorted with random sample of 100 IDs...');

  // Unsorted
  const t0 = performance.now();
  const resUnsorted = await pool.query(`
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
  const msUnsorted = performance.now() - t0;

  // Sorted
  const t1 = performance.now();
  const resSorted = await pool.query(`
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
  const msSorted = performance.now() - t1;

  console.log(`\nUNSORTED: Wall=${msUnsorted.toFixed(1)}ms`);
  console.log(resUnsorted.rows.map(r => r['QUERY PLAN']).filter(l => l.includes('Execution Time') || l.includes('Buffers')).join('\n'));

  console.log(`\nSORTED: Wall=${msSorted.toFixed(1)}ms`);
  console.log(resSorted.rows.map(r => r['QUERY PLAN']).filter(l => l.includes('Execution Time') || l.includes('Buffers')).join('\n'));

  await pool.end();
}

run().catch(console.error);
