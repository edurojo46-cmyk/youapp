import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

async function show() {
  const pool = new pg.Pool(parseDbUrl());
  const res = await pool.query(`
    SELECT 
      source_origin,
      count(*) as count,
      min(first_seen_at) as min_seen,
      max(first_seen_at) as max_seen
    FROM public.atlas_global_email_authority
    WHERE is_preexisting = false
    GROUP BY source_origin
    ORDER BY min(first_seen_at) ASC;
  `);
  console.table(res.rows);
  await pool.end();
}
show();
