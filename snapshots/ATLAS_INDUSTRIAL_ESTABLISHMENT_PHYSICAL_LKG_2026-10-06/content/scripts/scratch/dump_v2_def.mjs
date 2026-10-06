import pg from 'pg';
import fs from 'fs';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT pg_get_functiondef(p.oid) as def
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'resolve_and_commit_candidate_batch_v2';
    `);
    fs.writeFileSync('scripts/scratch/v2_function_full.sql', res.rows[0].def);
    console.log('Saved V2 definition to scripts/scratch/v2_function_full.sql (' + res.rows[0].def.length + ' bytes)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
