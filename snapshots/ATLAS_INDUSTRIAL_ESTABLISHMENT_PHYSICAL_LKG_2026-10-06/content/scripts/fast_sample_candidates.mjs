import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== FAST SAMPLING CANDIDATES TABLE ===');

// 1. Check sample of current_activity_state
const activitySample = await client.query(`
  SELECT current_activity_state, count(*) 
  FROM (
    SELECT current_activity_state 
    FROM atlas_people_discovery_candidates 
    LIMIT 10000
  ) s
  GROUP BY current_activity_state;
`);
console.log('current_activity_state sample (10k rows):', activitySample.rows);

// 2. Check discovery tables in public schema
const discTables = await client.query(`
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_name LIKE '%discovery%';
`);
console.log('Discovery tables in public:', discTables.rows);

// 3. Fast column sizes on 2000 rows sample
const colSizes = await client.query(`
  WITH sample AS (
    SELECT * FROM atlas_people_discovery_candidates LIMIT 2000
  )
  SELECT 
    avg(pg_column_size(discovery_id))::int as avg_discovery_id,
    avg(pg_column_size(display_name))::int as avg_display_name,
    avg(pg_column_size(profession))::int as avg_profession,
    avg(pg_column_size(role))::int as avg_role,
    avg(pg_column_size(organization))::int as avg_organization,
    avg(pg_column_size(search_text_normalized))::int as avg_search_text_normalized,
    avg(pg_column_size(neighborhood))::int as avg_neighborhood,
    avg(pg_column_size(geography_id))::int as avg_geography_id,
    avg(pg_column_size(location_evidence))::int as avg_location_evidence,
    avg(pg_column_size(location_source_url))::int as avg_location_source_url,
    avg(pg_column_size(person_source_url))::int as avg_person_source_url,
    avg(pg_column_size(social_profiles))::int as avg_social_profiles,
    avg(pg_column_size(atlas_person_id))::int as avg_atlas_person_id,
    avg(pg_column_size(s.*))::int as avg_total_row_bytes
  FROM sample s;
`);
console.log('Average column sizes (bytes):', colSizes.rows[0]);

// 4. Check outbox non-published counts using indexes (super fast)
const outboxCounts = await client.query(`
  SELECT 
    (SELECT count(*) FROM atlas_search_outbox WHERE status = 'PENDING') AS pending,
    (SELECT count(*) FROM atlas_search_outbox WHERE status = 'RETRY') AS retry,
    (SELECT count(*) FROM atlas_search_outbox WHERE status = 'PROCESSING') AS processing,
    (SELECT count(*) FROM atlas_search_outbox WHERE status = 'QUARANTINED') AS quarantined;
`);
console.log('Outbox Active Queue Counts:', outboxCounts.rows[0]);

// 5. Total counts from reltuples
const relTuples = await client.query(`
  SELECT 
    relname, 
    reltuples::bigint as est_rows,
    pg_size_pretty(pg_relation_size(oid)) as data_size,
    pg_size_pretty(pg_indexes_size(oid)) as index_size,
    pg_size_pretty(pg_total_relation_size(oid)) as total_size
  FROM pg_class 
  WHERE relname IN ('atlas_search_outbox', 'atlas_people_discovery_candidates', 'atlas_person_identity_map', 'atlas_hot_source_key_map', 'atlas_hot_national_identity_map')
  ORDER BY pg_total_relation_size(oid) DESC;
`);
console.table(relTuples.rows);

await client.end();
