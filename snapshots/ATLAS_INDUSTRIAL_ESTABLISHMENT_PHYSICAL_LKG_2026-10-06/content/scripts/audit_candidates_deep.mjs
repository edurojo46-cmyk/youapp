import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- 1. CANDIDATES COLUMNS ---');
const cols = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'atlas_people_discovery_candidates'
  ORDER BY ordinal_position;
`);
console.table(cols.rows);

console.log('\n--- 2. CANDIDATES DATES ---');
const candDates = await client.query(`
  SELECT 
    min(created_at) as min_created, 
    max(created_at) as max_created,
    min(last_seen_at) as min_last_seen,
    max(last_seen_at) as max_last_seen
  FROM atlas_people_discovery_candidates;
`);
console.table(candDates.rows);

console.log('\n--- 3. CANDIDATES AGES (APPROXIMATE/ACCURATE) ---');
const candAges = await client.query(`
  SELECT 
    CASE 
      WHEN created_at >= now() - interval '24 hours' THEN '<24H'
      WHEN created_at >= now() - interval '48 hours' THEN '24-48H'
      WHEN created_at >= now() - interval '7 days' THEN '48H-7D'
      WHEN created_at >= now() - interval '30 days' THEN '7D-30D'
      ELSE '>30D'
    END as age_bucket,
    count(*) as row_count
  FROM atlas_people_discovery_candidates
  GROUP BY 1
  ORDER BY 1;
`);
console.table(candAges.rows);

console.log('\n--- 4. CANDIDATES COLUMN SIZES (SAMPLE 5000 ROWS) ---');
const sampleColSizes = await client.query(`
  SELECT 
    avg(pg_column_size(discovery_id)) as avg_discovery_id,
    avg(pg_column_size(display_name)) as avg_display_name,
    avg(pg_column_size(profession)) as avg_profession,
    avg(pg_column_size(role)) as avg_role,
    avg(pg_column_size(organization)) as avg_org,
    avg(pg_column_size(search_text_normalized)) as avg_search_text,
    avg(pg_column_size(location_evidence)) as avg_loc_evidence,
    avg(pg_column_size(social_profiles)) as avg_social_profiles,
    avg(pg_column_size(person_source_url)) as avg_person_url,
    avg(pg_column_size(location_source_url)) as avg_loc_url,
    avg(pg_column_size(atlas_person_id)) as avg_person_id,
    avg(pg_column_size(c.*)) as avg_total_row_bytes
  FROM (
    SELECT * FROM atlas_people_discovery_candidates LIMIT 5000
  ) c;
`);
console.table(sampleColSizes.rows);

await client.end();
