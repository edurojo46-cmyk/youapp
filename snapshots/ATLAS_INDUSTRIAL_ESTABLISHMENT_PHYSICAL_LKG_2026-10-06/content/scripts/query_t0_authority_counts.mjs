import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const r = await client.query(`
  SELECT 
    qualified_unique_real_people,
    caba_pba_qualified_unique_real_people,
    identity_map_rows,
    last_verified_change_at,
    updated_at
  FROM public.atlas_people_live_metrics WHERE id='current';
`);
console.log('LIVE METRICS AT T0 AUDIT:', r.rows[0]);

await client.end();
