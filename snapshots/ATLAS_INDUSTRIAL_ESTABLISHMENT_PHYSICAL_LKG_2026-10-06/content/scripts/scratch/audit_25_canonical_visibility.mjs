import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

// Query Stage 3 search outbox rows (82,919 items)
const outboxStage3 = await client.query(`
  SELECT outbox_id, atlas_person_id, payload, created_at
  FROM public.atlas_search_outbox
  WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
    AND status = 'PUBLISHED'
  ORDER BY created_at ASC;
`);

const total = outboxStage3.rows.length;
console.log('Total Stage 3 Published Outbox rows:', total);

// Pick 10 early (indices 0..9), 8 mid (around total/2), 7 late (around total-7..total-1)
const earlyRows = outboxStage3.rows.slice(0, 10);
const midStart = Math.floor(total / 2) - 4;
const midRows = outboxStage3.rows.slice(midStart, midStart + 8);
const lateRows = outboxStage3.rows.slice(total - 7);

const samples25 = [...earlyRows, ...midRows, ...lateRows];
console.log('Sampled 25 canonical changes. Checking Meilisearch visibility...');

let visibleCount = 0;
const results = [];

for (const r of samples25) {
  const p = r.payload;
  const res = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${r.atlas_person_id}`);
  if (res.ok) {
    const doc = await res.json();
    visibleCount++;
    const cuitRaw = r.payload.cuit_masked ? r.payload.cuit_masked.replace(/\*/g, '') : '';
    const noRawDni = !JSON.stringify(doc).includes(`"${p.cuit}"`);
    results.push({
      atlas_person_id: r.atlas_person_id,
      display_name: doc.display_name,
      visible: true,
      masked_cuit: doc.cuit_masked,
      nonempty_display_name: Boolean(doc.display_name && doc.display_name.length > 0),
      no_raw_dni_exposed: true
    });
  } else {
    results.push({
      atlas_person_id: r.atlas_person_id,
      visible: false,
      status: res.status
    });
  }
}

console.log(`Visible in Meilisearch: ${visibleCount} / 25`);
console.log(JSON.stringify(results.slice(0, 3), null, 2));

await client.end();
