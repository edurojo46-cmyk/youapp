import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const c = new pg.Client(parseDbUrl());
await c.connect();

const sample = await c.query("SELECT outbox_id, atlas_person_id FROM public.atlas_search_outbox WHERE status = 'PUBLISHED' ORDER BY outbox_id DESC LIMIT 10;");
console.log('Sample rows count:', sample.rows.length);

for (const r of sample.rows) {
  const res = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/documents/' + r.atlas_person_id);
  const text = await res.text();
  console.log(r.atlas_person_id, 'Status:', res.status, text.slice(0, 100));
}

await c.end();
