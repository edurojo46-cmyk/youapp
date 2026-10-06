import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('Testing count with SET LOCAL statement_timeout = 0...');
const t0 = Date.now();
try {
  await client.query('BEGIN');
  await client.query('SET LOCAL statement_timeout = 0');
  const res = await client.query('SELECT count(*) AS total_rows FROM atlas_person_identity_map');
  await client.query('COMMIT');
  console.log('Success!', res.rows[0], 'Elapsed:', Date.now() - t0, 'ms');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Count error:', err.message, 'Elapsed:', Date.now() - t0, 'ms');
}

// Also get reltuples
const relRes = await client.query(`
  SELECT relname, n_live_tup, reltuples 
  FROM pg_class c 
  JOIN pg_stat_user_tables s ON s.relid = c.oid 
  WHERE relname = 'atlas_person_identity_map'
`);
console.log('Catalog stats:', relRes.rows);

await client.end();
