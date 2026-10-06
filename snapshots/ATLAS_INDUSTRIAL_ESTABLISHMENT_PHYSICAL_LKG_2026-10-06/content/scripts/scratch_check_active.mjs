import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT pid, age(now(), query_start) as age, state, wait_event_type, wait_event, substring(query from 1 for 100) as query
  FROM pg_stat_activity
  WHERE state != 'idle' AND pid != pg_backend_pid()
  ORDER BY query_start;
`);
console.table(res.rows);

await client.end();
