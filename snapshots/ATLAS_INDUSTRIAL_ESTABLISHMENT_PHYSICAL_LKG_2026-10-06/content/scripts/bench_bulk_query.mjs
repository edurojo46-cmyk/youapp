import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { performance } from 'node:perf_hooks';

dotenv.config();
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
const client = await pool.connect();

const hmacs = [];
for (let i = 0; i < 2000; i++) {
  const dni = String(25000000 + i);
  hmacs.push(crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex'));
}

console.log('Testing SELECT ANY($1) with 2000 HMACs...');
for (let run = 0; run < 3; run++) {
  const t0 = performance.now();
  const res = await client.query(`
    SELECT identifier_value, atlas_person_id 
    FROM public.atlas_person_identity_map 
    WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC' 
    AND identifier_value = ANY($1)
  `, [hmacs]);
  const elapsed = performance.now() - t0;
  console.log(`Run ${run + 1}: ${elapsed.toFixed(1)} ms, rows found: ${res.rows.length}`);
}

client.release();
await pool.end();
