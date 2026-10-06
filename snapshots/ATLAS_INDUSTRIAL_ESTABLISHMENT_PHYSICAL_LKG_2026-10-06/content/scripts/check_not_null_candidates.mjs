import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const cols = await client.query(`
  SELECT column_name, is_nullable, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'atlas_people_discovery_candidates' AND is_nullable = 'NO';
`);
console.table(cols.rows);

await client.end();
