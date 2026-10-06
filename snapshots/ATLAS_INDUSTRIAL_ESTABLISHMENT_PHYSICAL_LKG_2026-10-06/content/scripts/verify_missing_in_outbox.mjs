import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  const sampleIds = [
    'atlas_arg_per_0001155a96f1342e',
    'atlas_arg_per_00011b69ebf6ec5b',
    'atlas_arg_per_000205270bbe3d41',
    'atlas_arg_per_00026761dfceb26c',
    'atlas_arg_per_00075349c2b00604'
  ];

  const res = await client.query(`
    SELECT atlas_person_id, source_id, status, payload
    FROM public.atlas_search_outbox
    WHERE atlas_person_id = ANY($1)
  `, [sampleIds]);

  console.log(`Found ${res.rows.length} rows in outbox for sample IDs:`);
  for (const r of res.rows) {
    console.log(`ID: ${r.atlas_person_id}, Source: ${r.source_id}, Status: ${r.status}, Payload person_id: ${r.payload.atlas_person_id}`);
  }

  client.release();
  await pool.end();
}

main().catch(console.error);
