import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  const recRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      AND created_at >= '2026-09-20T21:40:00Z'
    ORDER BY atlas_person_id ASC
    LIMIT 8000;
  `);

  const ids = recRes.rows.map(r => r.atlas_person_id);
  const missing = [];
  for (const id of ids) {
    const res = await fetch('http://127.0.0.1:7701/indexes/atlas_people_discovery_gate32_delta/documents/' + id);
    if (!res.ok) missing.push(id);
    if (missing.length >= 5) break;
  }

  console.log('Sample missing:', missing);
  for (const m of missing) {
    const r = await client.query('SELECT outbox_id, atlas_person_id, source_id, status, payload FROM public.atlas_search_outbox WHERE atlas_person_id = $1', [m]);
    console.log('Outbox row for', m, ':', r.rows.map(x => ({ source_id: x.source_id, status: x.status, id: x.payload.atlas_person_id, display_name: x.payload.display_name })));
  }

  client.release();
  await pool.end();
}

main().catch(console.error);
