import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const res = await pool.query(`
    SELECT i.relname, ix.indisvalid, ix.indisready
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    WHERE i.relname = 'idx_candidates_active_target_partial';
  `);
  console.table(res.rows);
  if (res.rows.length > 0 && !res.rows[0].indisvalid) {
    console.log('Dropping invalid index concurrently...');
    await pool.query('DROP INDEX CONCURRENTLY IF EXISTS idx_candidates_active_target_partial;');
    console.log('Invalid index dropped cleanly.');
  }
  await pool.end();
}

run().catch(console.error);
