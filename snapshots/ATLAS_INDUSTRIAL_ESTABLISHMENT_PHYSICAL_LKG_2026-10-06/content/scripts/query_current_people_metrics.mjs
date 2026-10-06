import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const r = await client.query(`
  SELECT unique_people, qualified_unique_real_people, caba_pba_qualified_unique_real_people, last_verified_change_at
  FROM public.atlas_people_live_metrics WHERE id='current';
`);
console.log('CURRENT METRICS:', r.rows[0]);

await client.end();
