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
    const res = await client.query(`
      SELECT 
        outbox_id, atlas_person_id, source_id, source_record_id,
        status, attempt_count, created_at, published_at,
        payload
      FROM public.atlas_search_outbox
      WHERE created_at >= '2026-09-19T10:50:00Z'
      ORDER BY created_at ASC;
    `);

    console.log(`Found ${res.rows.length} rows created at 10:50:`);
    for (const r of res.rows) {
      const payloadHash = crypto.createHash('sha256').update(JSON.stringify(r.payload)).digest('hex');
      console.log('---');
      console.log('outbox_id:', r.outbox_id);
      console.log('atlas_person_id:', r.atlas_person_id);
      console.log('source_id:', r.source_id);
      console.log('source_record_id:', r.source_record_id);
      console.log('status:', r.status);
      console.log('created_at:', r.created_at);
      console.log('published_at:', r.published_at);
      console.log('payload_hash:', payloadHash);
      console.log('payload_keys:', Object.keys(r.payload));
      console.log('payload_display_name:', r.payload.display_name);
      console.log('payload_role:', r.payload.role);
    }

    // Now let's check identity_map for these 9 atlas_person_id!
    const pids = res.rows.map(r => `'${r.atlas_person_id}'`).join(',');
    if (pids) {
      const idMapRes = await client.query(`
        SELECT atlas_person_id, source_id, source_record_id, created_at
        FROM public.atlas_person_identity_map
        WHERE atlas_person_id IN (${pids});
      `);
      console.log('\n--- IDENTITY MAP ENTRIES FOR THESE 9 PIDS ---');
      console.table(idMapRes.rows);
    }

  } finally {
    await client.end();
  }
}

main().catch(console.error);
