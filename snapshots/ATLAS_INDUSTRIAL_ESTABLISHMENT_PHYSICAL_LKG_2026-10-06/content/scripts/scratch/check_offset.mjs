import pg from 'pg';
import crypto from 'node:crypto';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

const c = new pg.Client(parseDbUrl());
await c.connect();
const hmacKey = '1e7b93df021b3394a11f95304b0dfb925b4ec91428a2a5df0db036af6b88950d';
const dni = '4448937';
const hmac = crypto.createHmac('sha256', hmacKey).update('ARG:DNI:' + dni).digest('hex');
const res = await c.query('SELECT * FROM public.atlas_person_identity_map WHERE identifier_value = $1', [hmac]);
console.log('Result for CUIT 20044489377:', res.rows);
await c.end();
