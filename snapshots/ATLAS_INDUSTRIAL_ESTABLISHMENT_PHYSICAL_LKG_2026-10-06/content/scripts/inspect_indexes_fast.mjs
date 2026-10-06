import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const outboxIndexes = await client.query(`
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename = 'atlas_search_outbox';
`);
console.log('--- ATLAS_SEARCH_OUTBOX INDEXES ---');
console.log(outboxIndexes.rows);

const candidatesIndexes = await client.query(`
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename = 'atlas_people_discovery_candidates';
`);
console.log('--- ATLAS_PEOPLE_DISCOVERY_CANDIDATES INDEXES ---');
console.log(candidatesIndexes.rows);

await client.end();
