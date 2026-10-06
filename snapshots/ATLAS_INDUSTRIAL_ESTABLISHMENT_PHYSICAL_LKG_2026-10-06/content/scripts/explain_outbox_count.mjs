import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { performance } from 'node:perf_hooks';

dotenv.config();
const pool = new pg.Pool(parseDbUrl());
const client = await pool.connect();

const t0 = performance.now();
const res = await client.query(`
  EXPLAIN ANALYZE
  SELECT count(1) FROM public.atlas_search_outbox
  WHERE status = 'PENDING'
`);
const ms = performance.now() - t0;
console.log('Query plan (took', ms.toFixed(1), 'ms):');
console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));

client.release();
await pool.end();
