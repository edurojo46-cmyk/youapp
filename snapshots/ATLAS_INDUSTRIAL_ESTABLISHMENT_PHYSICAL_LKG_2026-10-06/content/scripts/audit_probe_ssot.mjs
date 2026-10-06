import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const config = parseDbUrl();
const pool = new pg.Pool({ ...config });
async function run() {
  const c = await pool.connect();
  const res = await c.query("SELECT source_id, canonical_url, source_family, current_status, protocol FROM public.atlas_source_knowledge_map WHERE canonical_url IS NOT NULL ORDER BY current_status, source_family LIMIT 100");
  console.log('Sample sources from SSOT:');
  console.table(res.rows.slice(0, 30));
  c.release();
  await pool.end();
}
run().catch(console.error);
