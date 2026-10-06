import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

await client.query(`
  CREATE OR REPLACE FUNCTION public.get_exact_identity_count()
  RETURNS bigint
  LANGUAGE sql
  STABLE SECURITY DEFINER
  AS $$
    SELECT COALESCE(unique_people, qualified_unique_real_people, 0)::bigint 
    FROM public.atlas_people_live_metrics 
    WHERE id = 'current';
  $$;
`);

console.log('✅ Upgraded get_exact_identity_count to O(1) SSOT lookup.');

const t0 = performance.now();
const test = await client.query('SELECT public.get_exact_identity_count() as cnt;');
const dt = performance.now() - t0;
console.log(`Execution time: ${dt.toFixed(2)}ms | Count: ${test.rows[0].cnt}`);

await client.end();
