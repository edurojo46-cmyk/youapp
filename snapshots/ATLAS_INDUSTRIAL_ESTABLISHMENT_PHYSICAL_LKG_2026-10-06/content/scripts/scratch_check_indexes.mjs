import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const countRes = await client.query(`
  SELECT relname, reltuples::bigint AS approx_count
  FROM pg_class
  WHERE relname IN ('atlas_person_identity_map', 'atlas_search_outbox', 'atlas_people_live_metrics')
  ORDER BY relname;
`);
console.table(countRes.rows);

const metricsRes = await client.query(`
  SELECT * FROM atlas_people_live_metrics WHERE id = 'current';
`);
console.log('atlas_people_live_metrics:');
console.table(metricsRes.rows);

await client.end();
