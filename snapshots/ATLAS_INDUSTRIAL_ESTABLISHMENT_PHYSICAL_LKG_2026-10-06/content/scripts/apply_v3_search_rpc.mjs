import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client({ ...parseDbUrl() });

async function run() {
  await client.connect();
  console.log('=== DEPLOYING VERSIONED RPC: atlas_search_people_unified_v3 ===');

  const sql = fs.readFileSync('supabase/migrations/20260924_atlas_search_people_unified_v3.sql', 'utf8');
  await client.query(sql);

  // Verify function exists
  const res = await client.query(`
    SELECT proname, proargnames
    FROM pg_proc
    WHERE proname = 'atlas_search_people_unified_v3';
  `);
  console.log('Function successfully registered:', res.rows);

  await client.end();
}

run().catch(async (err) => {
  console.error('Error applying v3 RPC:', err.message);
  await client.end();
  process.exit(1);
});
