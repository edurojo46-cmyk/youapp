import fs from 'fs';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT routine_definition 
      FROM information_schema.routines 
      WHERE routine_name = 'resolve_and_commit_candidate_batch_v2'
    `);
    if (res.rows.length > 0) {
      fs.writeFileSync('scripts/scratch_v2_definition.sql', res.rows[0].routine_definition);
      console.log('Saved routine definition to scripts/scratch_v2_definition.sql, length:', res.rows[0].routine_definition.length);
    } else {
      console.log('Routine not found!');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
