import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const res = await pool.query(`
    SELECT prosrc 
    FROM pg_proc 
    WHERE proname = 'commit_canonical_with_search_outbox'
    LIMIT 1;
  `);
  console.log(res.rows[0]?.prosrc);
  await pool.end();
}

run();
