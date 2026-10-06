import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
const pool = new pg.Pool(parseDbUrl());
const client = await pool.connect();

const hmacs = [];
for (let i = 0; i < 150; i++) {
  const dni = String(20000000 + i * 100);
  hmacs.push(crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex'));
}

const res = await client.query(`
  EXPLAIN (ANALYZE, BUFFERS)
  SELECT identifier_value, atlas_person_id
  FROM public.atlas_person_identity_map
  WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
  AND identifier_value = ANY($1::text[])
`, [hmacs]);

console.log(res.rows.map(r => r['QUERY PLAN']).join('\n'));

client.release();
await pool.end();
