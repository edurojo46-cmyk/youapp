import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== OUTBOX COLUMNS & SAMPLES ===');
const cols = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'atlas_search_outbox'
  ORDER BY ordinal_position;
`);
console.table(cols.rows);

const latest = await client.query(`
  SELECT outbox_id, status, created_at, published_at 
  FROM atlas_search_outbox 
  ORDER BY created_at DESC 
  LIMIT 3;
`);
console.log('Latest 3 outbox:', latest.rows);

const oldest = await client.query(`
  SELECT outbox_id, status, created_at, published_at 
  FROM atlas_search_outbox 
  ORDER BY created_at ASC 
  LIMIT 3;
`);
console.log('Oldest 3 outbox:', oldest.rows);

// Check pending, retry, processing, quarantined with fast index
const pendingCount = await client.query(`
  SELECT count(*) FROM atlas_search_outbox WHERE status = 'PENDING';
`);
const retryCount = await client.query(`
  SELECT count(*) FROM atlas_search_outbox WHERE status = 'RETRY';
`);
const procCount = await client.query(`
  SELECT count(*) FROM atlas_search_outbox WHERE status = 'PROCESSING';
`);
const quarCount = await client.query(`
  SELECT count(*) FROM atlas_search_outbox WHERE status = 'QUARANTINED';
`);
console.log('Fast Outbox Non-Published Status Counts:', {
  pending: pendingCount.rows[0].count,
  retry: retryCount.rows[0].count,
  processing: procCount.rows[0].count,
  quarantined: quarCount.rows[0].count
});

console.log('\n=== CANDIDATES COLUMNS & SAMPLES ===');
const candCols = await client.query(`
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'atlas_people_discovery_candidates'
  ORDER BY ordinal_position;
`);
console.table(candCols.rows);

const candLatest = await client.query(`
  SELECT discovery_id, source_id, status, created_at, last_seen_at 
  FROM atlas_people_discovery_candidates 
  ORDER BY discovery_id DESC 
  LIMIT 3;
`);
console.log('Latest 3 candidates:', candLatest.rows);

const candOldest = await client.query(`
  SELECT discovery_id, source_id, status, created_at, last_seen_at 
  FROM atlas_people_discovery_candidates 
  ORDER BY discovery_id ASC 
  LIMIT 3;
`);
console.log('Oldest 3 candidates:', candOldest.rows);

await client.end();
