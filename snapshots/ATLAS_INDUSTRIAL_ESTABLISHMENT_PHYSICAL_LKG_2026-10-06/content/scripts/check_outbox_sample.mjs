import 'dotenv/config';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function test() {
  const dbConfig = parseDbUrl();
  const pool = new pg.Pool(dbConfig);
  const { rows } = await pool.query('SELECT outbox_id, atlas_person_id, payload, status, published_at FROM public.atlas_search_outbox ORDER BY published_at DESC NULLS LAST LIMIT 50');
  console.log(`Found ${rows.length} rows`);
  let ok = 0;
  for (const r of rows) {
    const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload;
    const pid = payload.atlas_person_id || payload.id || r.atlas_person_id;
    const res = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/documents/' + pid);
    if (res.ok) ok++;
  }
  console.log(`Meili visibility: ${ok} / ${rows.length}`);
  await pool.end();
  if (ok !== rows.length) throw new Error('Visibility mismatch');
}
test();
