import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT pg_get_functiondef(oid) as def
  FROM pg_proc
  WHERE proname = 'commit_canonical_with_search_outbox_v4';
`);

const def = res.rows[0]?.def || '';
const hasObservedAtUpdate = def.includes('observed_at = EXCLUDED.observed_at') || def.includes('observed_at');
console.log('Function contains observed_at update:', hasObservedAtUpdate);

// Check if any triggers exist on atlas_person_identity_map
const trgRes = await client.query(`
  SELECT trigger_name, action_timing, event_manipulation 
  FROM information_schema.triggers 
  WHERE event_object_table = 'atlas_person_identity_map';
`);
console.log('Triggers on identity map:', trgRes.rows);

await client.end();
