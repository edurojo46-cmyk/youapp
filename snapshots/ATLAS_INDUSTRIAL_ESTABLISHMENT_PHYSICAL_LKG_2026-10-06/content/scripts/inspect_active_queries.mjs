import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const activity = await client.query(`
  SELECT pid, now() - query_start AS duration, state, wait_event_type, wait_event, query 
  FROM pg_stat_activity 
  WHERE state != 'idle' AND pid != pg_backend_pid()
  ORDER BY duration DESC;
`);
console.log('Active queries in Postgres:');
console.table(activity.rows.map(r => ({
  pid: r.pid,
  duration: r.duration,
  state: r.state,
  wait_type: r.wait_event_type,
  wait_event: r.wait_event,
  query: (r.query || '').slice(0, 80)
})));

await client.end();
