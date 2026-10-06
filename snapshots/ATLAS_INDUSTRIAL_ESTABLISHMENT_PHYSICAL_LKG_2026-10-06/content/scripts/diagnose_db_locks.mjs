import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('--- TABLE SIZES ---');
const sizes = await client.query(`
  SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) as total_size
  FROM pg_stat_user_tables
  WHERE relname IN ('atlas_person_identity_map', 'atlas_search_outbox', 'atlas_people_discovery_candidates', 'atlas_people_live_metrics')
`);
console.table(sizes.rows);

console.log('--- LOCKS / BLOCKED QUERIES ---');
const locks = await client.query(`
  SELECT 
    pid, 
    usename, 
    pg_blocking_pids(pid) as blocked_by, 
    query as current_query,
    now() - query_start as duration,
    state
  FROM pg_stat_activity
  WHERE state != 'idle' AND pid != pg_backend_pid()
  ORDER BY duration DESC
`);
console.table(locks.rows.map(r => ({
  pid: r.pid,
  blocked_by: r.blocked_by,
  duration: r.duration,
  state: r.state,
  query: (r.current_query || '').substring(0, 80)
})));

console.log('--- INDEXES ON atlas_person_identity_map ---');
const idxMap = await client.query(`
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'atlas_person_identity_map'
`);
console.table(idxMap.rows);

console.log('--- INDEXES ON atlas_search_outbox ---');
const idxOutbox = await client.query(`
  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'atlas_search_outbox'
`);
console.table(idxOutbox.rows);

await client.end();
