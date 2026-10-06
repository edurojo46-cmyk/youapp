import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7701';
const INDEX_UID = 'atlas_people_discovery_gate32_delta';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('Fetching exactly 8,000 ARCA outbox IDs from the recovery period...');
  const recRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      AND created_at >= '2026-09-20T21:40:00Z'
    ORDER BY atlas_person_id ASC
    LIMIT 8000;
  `);

  const expected8k = recRes.rows.map(r => r.atlas_person_id);
  console.log(`Loaded exactly ${expected8k.length} ARCA recovered IDs.`);

  let found = 0;
  let missing = 0;

  const batchSize = 200;
  for (let i = 0; i < expected8k.length; i += batchSize) {
    const chunk = expected8k.slice(i, i + batchSize);
    const promises = chunk.map(id => 
      fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents/${id}`)
        .then(r => r.ok ? 1 : 0)
        .catch(() => 0)
    );
    const results = await Promise.all(promises);
    for (const res of results) {
      if (res === 1) found++;
      else missing++;
    }
  }

  console.log('\n================================================================');
  console.log('RECOVERED 8K ARCA RECONCILIATION RESULT:');
  console.log(`RECOVERED_8K_EXPECTED = ${expected8k.length}`);
  console.log(`RECOVERED_8K_FOUND    = ${found}`);
  console.log(`RECOVERED_8K_MISSING  = ${missing}`);
  console.log('================================================================\n');

  client.release();
  await pool.end();
}

main().catch(console.error);
