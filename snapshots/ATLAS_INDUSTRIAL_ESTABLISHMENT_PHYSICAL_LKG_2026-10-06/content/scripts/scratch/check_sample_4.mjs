import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const ids = [
  'atlas_arg_per_428409039accb4a0',
  'atlas_arg_per_eada40343404b7cb',
  'atlas_arg_per_97184d9289cdf0a8',
  'atlas_arg_per_37dc0357d2d2acc0'
];

for (const id of ids) {
  const mapRes = await client.query('SELECT atlas_person_id, source_person_id, resolution_method FROM public.atlas_person_identity_map WHERE atlas_person_id = $1 LIMIT 5', [id]);
  const outRes = await client.query('SELECT outbox_id, atlas_person_id, status, created_at FROM public.atlas_search_outbox WHERE atlas_person_id = $1', [id]);
  const meiliRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/documents/' + id);
  console.log(id, 'MAP rows:', mapRes.rows.length, 'OUTBOX rows:', outRes.rows.length, 'MEILI:', meiliRes.status);
  if (mapRes.rows.length > 0) {
    console.log('  Map sample:', mapRes.rows[0]);
  }
}

await client.end();
