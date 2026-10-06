import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const c = new pg.Client(parseDbUrl());
await c.connect();

const r = await c.query("SELECT * FROM public.atlas_search_outbox WHERE atlas_person_id = 'atlas_arg_per_f67cf7502db8aec5';");
console.log('Outbox row:', r.rows[0]);
await c.end();

const search = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ q: r.rows[0]?.payload?.display_name || 'f67cf7502db8aec5' })
});
console.log('Search by display name:', await search.json());
