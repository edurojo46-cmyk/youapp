import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const r = await client.query('SELECT * FROM public.atlas_people_live_metrics WHERE id=\'current\';');
console.log('LIVE METRICS CURRENT:', JSON.stringify(r.rows[0], null, 2));

await client.end();
