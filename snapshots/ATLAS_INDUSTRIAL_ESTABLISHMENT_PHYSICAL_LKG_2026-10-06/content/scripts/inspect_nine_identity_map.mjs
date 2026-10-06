import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

async function main() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const pids = [
      'atlas_arg_per_0cfa189714060038',
      'atlas_arg_per_9dc972465f2e2f66',
      'atlas_arg_per_d9f8f8e9cccf016a',
      'atlas_arg_per_fcd38c176405218e',
      'atlas_arg_per_6aa0e990c835a823',
      'atlas_arg_per_36c996bc847cccce',
      'atlas_arg_per_fb31f5a3401bc749',
      'atlas_arg_per_c83e39e49962dd3a',
      'atlas_arg_per_ed279a4e13534016'
    ];

    const res = await client.query(`
      SELECT 
        atlas_person_id, source_id, source_person_id, identifier_type,
        identifier_value, evidence_id, confidence, resolution_method, observed_at
      FROM public.atlas_person_identity_map
      WHERE atlas_person_id = ANY($1::text[])
      ORDER BY atlas_person_id, observed_at ASC;
    `, [pids]);

    console.log(`Found ${res.rows.length} rows in atlas_person_identity_map for the 9 pids:`);
    for (const r of res.rows) {
      console.log(r);
    }
  } finally {
    await client.end();
  }
}

main().catch(console.error);
