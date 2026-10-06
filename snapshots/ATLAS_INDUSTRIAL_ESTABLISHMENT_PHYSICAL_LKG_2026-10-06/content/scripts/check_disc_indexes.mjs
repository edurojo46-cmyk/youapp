import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const client = new pg.Client(parseDbUrl());
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'atlas_people_discovery_candidates';
  `);
  console.log(res.rows);
  await client.end();
}
run().catch(console.error);
