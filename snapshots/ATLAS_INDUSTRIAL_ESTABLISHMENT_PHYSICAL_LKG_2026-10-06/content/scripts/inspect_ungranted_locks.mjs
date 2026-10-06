import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const client = new pg.Client(parseDbUrl());
await client.connect();

const res = await client.query(`
  SELECT 
    l.pid,
    l.locktype,
    l.mode,
    l.granted,
    c.relname,
    a.query
  FROM pg_locks l
  LEFT JOIN pg_class c ON c.oid = l.relation
  JOIN pg_stat_activity a ON a.pid = l.pid
  WHERE NOT l.granted;
`);
console.log('UNGRANTED LOCKS:', res.rows);

await client.end();
