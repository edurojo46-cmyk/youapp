import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const res = await pool.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'commit_canonical_with_search_outbox';
  `);
  if (res.rows.length > 0) {
    fs.writeFileSync('scratch/legacy_rpc_prosrc.sql', res.rows[0].prosrc, 'utf8');
    console.log('Legacy RPC prosrc written to scratch/legacy_rpc_prosrc.sql (length: ' + res.rows[0].prosrc.length + ')');
  } else {
    console.log('Legacy RPC not found');
  }
  await pool.end();
}

run().catch(console.error);
