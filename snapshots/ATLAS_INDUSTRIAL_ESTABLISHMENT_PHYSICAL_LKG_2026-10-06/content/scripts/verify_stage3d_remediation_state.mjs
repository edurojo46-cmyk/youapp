import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const tables = await client.query(`
    SELECT table_schema, table_name, table_type 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Public tables/views:', tables.rows);

  const testCheck = await client.query(`
    SELECT 
      (SELECT count(*) FROM public.atlas_person_identity_map WHERE atlas_person_id LIKE '%test%' OR source_person_id LIKE '%test%') as test_map_rows,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE atlas_person_id LIKE '%test%' OR source_record_id LIKE '%test%') as test_outbox_rows
  `);
  console.log('Test rows check:', testCheck.rows[0]);

  const specificCheck = await client.query(`
    SELECT 
      (SELECT count(*) FROM public.atlas_person_identity_map WHERE atlas_person_id = 'atlas_arg_per_test123' OR source_person_id = '20123456789') as exact_test_map,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE atlas_person_id = 'atlas_arg_per_test123') as exact_test_outbox
  `);
  console.log('Exact mock person check:', specificCheck.rows[0]);

  const counts = await client.query(`
    SELECT 
      count(DISTINCT atlas_person_id) as canonical_distinct,
      count(*) as identity_map_rows
    FROM public.atlas_person_identity_map
  `);
  const outboxCounts = await client.query(`
    SELECT 
      count(*) as search_outbox_total,
      count(*) FILTER (WHERE status = 'PENDING') as pending,
      count(*) FILTER (WHERE status = 'PROCESSING') as processing,
      count(*) FILTER (WHERE status = 'PUBLISHED') as published,
      count(*) FILTER (WHERE status = 'QUARANTINED') as quarantined
    FROM public.atlas_search_outbox
  `);
  console.log('Current SSOT counts:', {
    ...counts.rows[0],
    ...outboxCounts.rows[0]
  });

  // Check Meilisearch
  const MEILI_URL = 'http://127.0.0.1:7700';
  const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';
  const meiliRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/atlas_arg_per_test123`);
  console.log('Meilisearch test doc status:', meiliRes.status); // 404 expected

  const meiliStatsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/stats`);
  const stats = await meiliStatsRes.json();
  console.log('Meilisearch delta stats:', stats);

  await client.end();
}

main().catch(console.error);
