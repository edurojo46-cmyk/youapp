import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== AUDITING DEAD LETTER ROWS (atlas_search_delivery_dead_letter) ===');

const dlRes = await client.query(`
  SELECT 
    source_id,
    reason,
    COUNT(*) as count,
    MIN(created_at) as earliest_created,
    MAX(created_at) as latest_created,
    bool_or(logical_event_id LIKE 'CANARY_%' OR source_id LIKE 'CANARY_%' OR source_id = 'canary_v2_test') as is_canary
  FROM public.atlas_search_delivery_dead_letter
  GROUP BY source_id, reason
  ORDER BY count DESC;
`);

console.table(dlRes.rows);

// Total breakdown
const totalRes = await client.query(`
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE source_id LIKE 'CANARY_%' OR source_id = 'canary_v2_test' OR logical_event_id LIKE 'CANARY_%') as canary_test,
    COUNT(*) FILTER (WHERE NOT (source_id LIKE 'CANARY_%' OR source_id = 'canary_v2_test' OR logical_event_id LIKE 'CANARY_%')) as production
  FROM public.atlas_search_delivery_dead_letter;
`);
console.log('Dead Letter Summary:', totalRes.rows[0]);

// Detailed sample of non-canary if any
const prodSample = await client.query(`
  SELECT dead_letter_id, logical_event_id, source_id, source_record_id, reason, created_at, metadata
  FROM public.atlas_search_delivery_dead_letter
  WHERE NOT (source_id LIKE 'CANARY_%' OR source_id = 'canary_v2_test' OR logical_event_id LIKE 'CANARY_%')
  LIMIT 5;
`);
console.log('Production Dead Letter Sample:', prodSample.rows);

// Audit Test Contamination across Production Tables
console.log('\n=== AUDITING TEST CONTAMINATION ACROSS PRODUCTION TABLES ===');

const checkPeople = await client.query(`
  SELECT count(*) FROM public.atlas_people 
  WHERE full_name ILIKE '%CANARY%' OR origin_source ILIKE '%CANARY%';
`);

const checkIdentity = await client.query(`
  SELECT count(*) FROM public.atlas_person_identity_map 
  WHERE source_id ILIKE '%CANARY%';
`);

const checkCandidates = await client.query(`
  SELECT count(*) FROM public.atlas_people_discovery_candidates 
  WHERE source_id ILIKE '%CANARY%' OR display_name ILIKE '%CANARY%';
`);

const checkOutboxV2 = await client.query(`
  SELECT count(*) FROM public.atlas_search_outbox_v2 
  WHERE source_id ILIKE '%CANARY%' OR logical_event_id ILIKE '%CANARY%';
`);

console.log('Contamination in atlas_people:', checkPeople.rows[0].count);
console.log('Contamination in atlas_person_identity_map:', checkIdentity.rows[0].count);
console.log('Contamination in atlas_people_discovery_candidates:', checkCandidates.rows[0].count);
console.log('Contamination in atlas_search_outbox_v2:', checkOutboxV2.rows[0].count);

await client.end();
