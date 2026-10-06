import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const MEILI_URL = 'http://127.0.0.1:7700';
  const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

  const statsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/stats`);
  const stats = await statsRes.json();
  console.log('Meili stats:', stats);

  // Check if test person exists
  const testCheck = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/atlas_arg_per_test123`);
  console.log('Test person in Meili status:', testCheck.status); // Expect 404

  // Check tasks in Meili
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const outboxDistinct = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as total_distinct_pids,
           count(DISTINCT atlas_person_id) FILTER (WHERE status = 'PUBLISHED') as published_distinct_pids
    FROM public.atlas_search_outbox
  `);
  console.log('Outbox distinct PIDs:', outboxDistinct.rows[0]);

  await client.end();
}

main().catch(console.error);
