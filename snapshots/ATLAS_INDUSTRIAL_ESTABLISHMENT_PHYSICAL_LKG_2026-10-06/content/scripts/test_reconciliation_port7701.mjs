import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('Loading 1,000,000 NET-NEW atlas_person_ids from PostgreSQL...');
  // Baseline canonical people were those created before 2026-09-20T19:00:03.794Z
  // Main campaign started at 2026-09-20T19:00:03.794Z
  const baselineTs = '2026-09-20T19:00:00Z';
  
  // Fast query to get all distinct atlas_person_id in the final campaign that are new:
  const newIdsRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND observed_at >= $1
    EXCEPT
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_person_identity_map
    WHERE observed_at < $1 AND atlas_person_id IS NOT NULL;
  `, [baselineTs]);

  console.log(`Loaded ${newIdsRes.rows.length} NET-NEW atlas_person_ids from Postgres.`);
  const expectedSet = new Set(newIdsRes.rows.map(r => r.atlas_person_id));

  // Also check 8k recovered IDs
  console.log('Loading recovered 8k IDs...');
  const rec8kRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      AND created_at >= '2026-09-20T18:57:00Z'
    LIMIT 8000;
  `);
  console.log(`Loaded ${rec8kRes.rows.length} sample outbox IDs for 8k check.`);

  client.release();
  await pool.end();

  console.log('\nFetching all document IDs from Meilisearch on port 7701 (data_discovery_delta.ms)...');
  const meiliIds = new Set();
  const limit = 10000;
  let offset = 0;
  const total = 1030179;

  while (offset < total) {
    const res = await fetch(`http://127.0.0.1:7701/indexes/atlas_people_discovery_gate32_delta/documents?fields=atlas_person_id&offset=${offset}&limit=${limit}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) break;
    for (const doc of data.results) {
      meiliIds.add(doc.atlas_person_id);
    }
    offset += data.results.length;
    if (offset % 100000 === 0 || offset >= total) {
      console.log(`  Fetched ${offset} / ${total} documents from Meilisearch...`);
    }
  }

  console.log(`\nTotal unique IDs in Meilisearch: ${meiliIds.size}`);

  let foundCount = 0;
  const missingFromMeili = [];
  for (const id of expectedSet) {
    if (meiliIds.has(id)) {
      foundCount++;
    } else {
      missingFromMeili.push(id);
    }
  }

  console.log('--- RECONCILIATION RESULT (PORT 7701) ---');
  console.log(`EXPECTED_FINAL_SEARCH_IDS: ${expectedSet.size}`);
  console.log(`FOUND_FINAL_SEARCH_IDS:    ${foundCount}`);
  console.log(`MISSING_FINAL_SEARCH_IDS:  ${missingFromMeili.length}`);

  if (missingFromMeili.length > 0) {
    console.log(`Missing count: ${missingFromMeili.length}. Sample:`, missingFromMeili.slice(0, 5));
  }
}

main().catch(console.error);
