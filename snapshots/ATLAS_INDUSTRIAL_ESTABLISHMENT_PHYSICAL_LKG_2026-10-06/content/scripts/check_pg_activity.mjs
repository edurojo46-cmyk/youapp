import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT pid, wait_event_type, wait_event, state, ROUND(EXTRACT(EPOCH FROM (NOW() - query_start)) * 1000) AS duration_ms, query 
  FROM pg_stat_activity 
  WHERE state = 'active' AND pid <> pg_backend_pid()
`);

console.log(res.rows);
await client.end();
