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

  console.log(`Identified ${missing.length} missing IDs in Meilisearch.`);

  if (missing.length > 0) {
    const outboxRes = await client.query(`
      SELECT DISTINCT ON (atlas_person_id) payload
      FROM public.atlas_search_outbox
      WHERE atlas_person_id = ANY($1) AND source_id = 'ARCA_CONDICION_TRIBUTARIA'
    `, [missing]);

    console.log(`Found ${outboxRes.rows.length} ARCA payloads for the missing IDs.`);
    const payloads = outboxRes.rows.map(r => r.payload);

    const pRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloads)
    });
    const pJson = await pRes.json();
    console.log('Task enqueued:', pJson);

    while (true) {
      const tRes = await fetch(`${MEILI_URL}/tasks/${pJson.taskUid}`);
      const tJson = await tRes.json();
      if (tJson.status === 'succeeded') {
        console.log('Indexing succeeded for missing ARCA payloads!');
        break;
      }
      if (tJson.status === 'failed') {
        console.error('Indexing failed:', tJson.error);
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Re-verify the 8,000 IDs
  let found = 0;
  let stillMissing = 0;
  for (const id of expected8k) {
    const res = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents/${id}`);
    if (res.ok) found++;
    else stillMissing++;
  }

  console.log('\n================================================================');
  console.log('FINAL 8K VERIFICATION RESULT:');
  console.log(`RECOVERED_8K_EXPECTED = ${expected8k.length}`);
  console.log(`RECOVERED_8K_FOUND    = ${found}`);
  console.log(`RECOVERED_8K_MISSING  = ${stillMissing}`);
  console.log('================================================================\n');

  client.release();
  await pool.end();
}

main().catch(console.error);
