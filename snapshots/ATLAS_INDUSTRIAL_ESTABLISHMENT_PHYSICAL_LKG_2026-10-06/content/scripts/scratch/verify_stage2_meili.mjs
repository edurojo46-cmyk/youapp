import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const c = new pg.Client(parseDbUrl());
await c.connect();

const sample = await c.query(`
  SELECT outbox_id, atlas_person_id, created_at, payload->>'display_name' as display_name
  FROM public.atlas_search_outbox 
  WHERE status = 'PUBLISHED'
    AND source_id = 'ARCA_CONDICION_TRIBUTARIA'
  ORDER BY created_at DESC 
  LIMIT 10;
`);

console.log('Sample Stage 2 ARCA rows:');
let verified = 0;
for (const r of sample.rows) {
  const res = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/documents/' + r.atlas_person_id);
  if (res.ok) {
    const doc = await res.json();
    console.log('  FOUND:', r.atlas_person_id, doc.display_name);
    verified++;
  } else {
    console.log('  NOT FOUND:', r.atlas_person_id, res.status);
  }
}
console.log(`\nVerified in Meilisearch delta: ${verified}/10`);

await c.end();
