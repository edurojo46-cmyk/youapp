import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const t0 = performance.now();
const res = await client.query(`
  SELECT atlas_person_id, display_name, organization, role 
  FROM public.atlas_search_people_unified_v2('GONZALEZ', NULL, NULL, NULL, NULL, NULL, 'ALL_ARGENTINA', 5, 0);
`);
const elapsed = performance.now() - t0;
console.log('SEARCH V2 RESULTS (took ' + elapsed.toFixed(1) + 'ms):', res.rows);

await client.end();
