import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    console.log('Testing unlogged table creation speed...');
    const t0 = performance.now();
    await client.query(`DROP TABLE IF EXISTS public.test_unlogged_speed CASCADE`);
    await client.query(`
      CREATE UNLOGGED TABLE public.test_unlogged_speed AS
      SELECT id, atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, evidence_id, confidence, resolution_method, observed_at, created_at
      FROM public.atlas_person_identity_map
      LIMIT 250000
    `);
    const durTable = performance.now() - t0;
    console.log(`Created 250K unlogged table in ${durTable.toFixed(1)} ms`);

    const tIdx = performance.now();
    await client.query(`
      CREATE UNIQUE INDEX uq_test_unlogged_source ON public.test_unlogged_speed (source_id, source_person_id)
    `);
    await client.query(`
      CREATE INDEX idx_test_unlogged_ident ON public.test_unlogged_speed (identifier_type, identifier_value)
    `);
    const durIdx = performance.now() - tIdx;
    console.log(`Created indexes in ${durIdx.toFixed(1)} ms`);

    const sz = await client.query(`
      SELECT 
        pg_size_pretty(pg_total_relation_size('public.test_unlogged_speed')) as total_size,
        pg_size_pretty(pg_indexes_size('public.test_unlogged_speed')) as indexes_size
    `);
    console.log('Size of 250K unlogged table:', sz.rows[0]);

    await client.query(`DROP TABLE public.test_unlogged_speed CASCADE`);
    console.log('Dropped test unlogged table.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
