import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function check() {
  const pool = new pg.Pool(parseDbUrl());
  const idxRes = await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'atlas_search_outbox'");
  console.log('Indexes on atlas_search_outbox:');
  for (const r of idxRes.rows) console.log(r.indexname, ':', r.indexdef);
  await pool.end();
}
check();
