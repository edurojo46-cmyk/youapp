import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7701';
const INDEX_UID = 'atlas_people_discovery_gate32_delta';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  const recRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      AND created_at >= '2026-09-20T21:40:00Z'
    ORDER BY atlas_person_id ASC
    LIMIT 8000;
  `);

  const expected8k = recRes.rows.map(r => r.atlas_person_id);
  const missing = [];

  for (const id of expected8k) {
    const res = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents/${id}`);
    if (!res.ok) {
      missing.push(id);
    }
  }

  console.log(`Found ${missing.length} missing IDs in Meilisearch.`);
  console.log('Sample missing IDs:', missing.slice(0, 5));

  // Check their outbox status and payloads
  const outboxRes = await client.query(`
    SELECT atlas_person_id, source_id, status, payload
    FROM public.atlas_search_outbox
    WHERE atlas_person_id = ANY($1)
  `, [missing]);

  console.log(`Found ${outboxRes.rows.length} rows in outbox for the missing IDs.`);
  console.log('Sample outbox row:', outboxRes.rows[0]);

  // Why are they missing from Meilisearch? Push them to Meilisearch!
  const payloads = outboxRes.rows.map(r => r.payload);
  console.log(`Pushing all ${payloads.length} missing payloads to Meilisearch...`);
  const pRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloads)
  });
  const pJson = await pRes.json();
  console.log('Meili task:', pJson);

  // Wait for task
  while (true) {
    const tRes = await fetch(`${MEILI_URL}/tasks/${pJson.taskUid}`);
    const tJson = await tRes.json();
    if (tJson.status === 'succeeded') {
      console.log('Indexing succeeded!');
      break;
    }
    if (tJson.status === 'failed') {
      console.error('Indexing failed:', tJson.error);
      break;
    }
    await new Promise(r => setTimeout(r, 100));
  }

  client.release();
  await pool.end();
}

main().catch(console.error);
