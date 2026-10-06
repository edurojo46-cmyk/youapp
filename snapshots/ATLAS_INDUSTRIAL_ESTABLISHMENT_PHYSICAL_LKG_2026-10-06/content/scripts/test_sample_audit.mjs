import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const dbConfig = parseDbUrl();

async function run() {
  const p = new pg.Pool({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false },
    max: 1
  });
  const c = await p.connect();
  const t0 = Date.now();
  console.log('Fetching 10,000 canonical persons...');
  const res = await c.query('SELECT atlas_person_id, display_name, geography_id, evidence_summary FROM atlas_shadow.atlas_canonical_persons_v2 LIMIT 10000');
  console.log('Fetched', res.rows.length, 'rows in', Date.now() - t0, 'ms');
  
  // Test 100 batch on search
  const sample100 = res.rows.slice(0, 100).map(r => 'doc_' + r.atlas_person_id);
  const t1 = Date.now();
  const sRes = await c.query('SELECT document_id, full_name FROM atlas_shadow.atlas_argentina_people_search_v1 WHERE document_id = ANY($1::text[])', [sample100]);
  console.log('Found', sRes.rows.length, '/ 100 search docs in', Date.now() - t1, 'ms');

  c.release();
  await p.end();
}
run().catch(console.error);
