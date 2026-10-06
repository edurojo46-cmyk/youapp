import pg from 'pg';
import crypto from 'crypto';
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
      WHERE atlas_person_id = ANY($1::text[]);
    `, [pids]);

    console.log(`Found ${res.rows.length} rows in atlas_person_identity_map for the 9 pids:`);
    for (const r of res.rows) {
      console.log({
        atlas_person_id: r.atlas_person_id,
        source_id: r.source_id,
        source_person_id: r.source_person_id,
        identifier_type: r.identifier_type,
        identifier_value: r.identifier_value,
        observed_at: r.observed_at
      });
    }

    // Now let's check outbox rows for these 9 pids
    const outRes = await client.query(`
      SELECT 
        outbox_id, atlas_person_id, source_id, source_record_id,
        status, attempt_count, created_at, published_at
      FROM public.atlas_search_outbox
      WHERE atlas_person_id = ANY($1::text[]);
    `, [pids]);

    console.log(`\nFound ${outRes.rows.length} outbox rows for the 9 pids:`);
    for (const r of outRes.rows) {
      console.log(r);
    }

    // Let's check how many total ARCA rows were created at 10:49 vs 10:50 in atlas_person_identity_map!
    const timeRes = await client.query(`
      SELECT date_trunc('minute', observed_at) as m, count(*)
      FROM public.atlas_person_identity_map
      WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      GROUP BY date_trunc('minute', observed_at)
      ORDER BY m DESC;
    `);
    console.log('\n--- IDENTITY MAP ARCA ROWS BY MINUTE ---');
    console.table(timeRes.rows);

  } finally {
    await client.end();
  }
}

main().catch(console.error);
