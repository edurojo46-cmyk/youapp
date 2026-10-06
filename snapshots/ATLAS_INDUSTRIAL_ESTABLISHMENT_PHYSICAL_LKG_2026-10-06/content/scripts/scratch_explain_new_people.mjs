import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();
  try {
    const sampleIds = ['atlas_arg_per_001', 'atlas_arg_per_002', 'atlas_arg_per_003'];
    const res = await client.query(`
      EXPLAIN ANALYZE
      SELECT DISTINCT i.id
      FROM unnest($1::text[]) AS i(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.atlas_person_identity_map existing
        WHERE existing.atlas_person_id = i.id
      );
    `, [sampleIds]);
    console.log('EXPLAIN ANALYZE:');
    for (const r of res.rows) {
      console.log(r['QUERY PLAN']);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
