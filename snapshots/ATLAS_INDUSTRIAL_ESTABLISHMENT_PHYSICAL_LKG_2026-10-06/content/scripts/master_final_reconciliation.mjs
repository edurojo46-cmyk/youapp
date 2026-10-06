import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const INDEX_UID = 'atlas_people_discovery_gate32_delta';

async function main() {
  console.log('================================================================');
  console.log('⚡ MASTER POST-RUN FORENSIC RECONCILIATION ON LIVE PORT 7700');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  // 1. Exact Database Truth
  console.log('1. Auditing Database Canonical Counts...');
  const rCanonical = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as canonical_count
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL;
  `);
  const FINAL_CANONICAL_UNIQUE = parseInt(rCanonical.rows[0].canonical_count, 10);
  const BASELINE_CANONICAL_UNIQUE = 1782044;
  const NET_NEW_UNIQUE_COMMITTED = FINAL_CANONICAL_UNIQUE - BASELINE_CANONICAL_UNIQUE;

  console.log(`BASELINE_CANONICAL_UNIQUE: ${BASELINE_CANONICAL_UNIQUE}`);
  console.log(`FINAL_CANONICAL_UNIQUE:    ${FINAL_CANONICAL_UNIQUE}`);
  console.log(`NET_NEW_UNIQUE_COMMITTED:  ${NET_NEW_UNIQUE_COMMITTED}`);

  // 2. Load 1,000,000 Expected Final Campaign Person IDs
  console.log('\n2. Loading exact 1,000,000 Net-New Person IDs from PostgreSQL...');
  const baselineTs = '2026-09-20T19:00:00Z';
  const newIdsRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_person_identity_map
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND observed_at >= $1
    EXCEPT
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_person_identity_map
    WHERE observed_at < $1 AND atlas_person_id IS NOT NULL;
  `, [baselineTs]);

  const expected1mSet = new Set(newIdsRes.rows.map(r => r.atlas_person_id));
  console.log(`Expected Net-New Person IDs Count: ${expected1mSet.size}`);

  // 3. Load all document IDs from Meilisearch
  console.log('\n3. Paginating all document IDs from Meilisearch index on port 7700...');
  const meiliIds = new Set();
  const limit = 10000;
  let offset = 0;
  while (true) {
    const res = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents?fields=atlas_person_id&offset=${offset}&limit=${limit}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) break;
    for (const doc of data.results) {
      meiliIds.add(doc.atlas_person_id);
    }
    offset += data.results.length;
    if (offset % 100000 === 0) {
      console.log(`  Fetched ${offset} documents from Meilisearch...`);
    }
  }
  console.log(`Total unique IDs in Meilisearch: ${meiliIds.size}`);

  // 4. Exact 1M Set Reconciliation
  let found1m = 0;
  let missing1m = 0;
  for (const id of expected1mSet) {
    if (meiliIds.has(id)) found1m++;
    else missing1m++;
  }
  console.log(`\n--- EXACT 1M SEARCH RECONCILIATION ---`);
  console.log(`EXPECTED_FINAL_SEARCH_IDS = ${expected1mSet.size}`);
  console.log(`FOUND_FINAL_SEARCH_IDS    = ${found1m}`);
  console.log(`MISSING_FINAL_SEARCH_IDS  = ${missing1m}`);

  // 5. Exact 8K Recovered IDs Check
  console.log('\n5. Auditing exact 8,000 recovered outbox IDs...');
  const recRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'
      AND created_at >= '2026-09-20T21:40:00Z'
    ORDER BY atlas_person_id ASC
    LIMIT 8000;
  `);
  const expected8k = recRes.rows.map(r => r.atlas_person_id);
  let found8k = 0;
  let missing8k = 0;
  for (const id of expected8k) {
    if (meiliIds.has(id)) found8k++;
    else missing8k++;
  }
  console.log(`--- EXACT 8K RECOVERED RECONCILIATION ---`);
  console.log(`RECOVERED_8K_EXPECTED = ${expected8k.length}`);
  console.log(`RECOVERED_8K_FOUND    = ${found8k}`);
  console.log(`RECOVERED_8K_MISSING  = ${missing8k}`);

  // 6. Outbox Status for Campaign Cohort
  console.log('\n6. Auditing Outbox status for Campaign Cohort...');
  const rOutboxStatus = await client.query(`
    SELECT status, count(*) as count
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND created_at >= $1
    GROUP BY status;
  `, [baselineTs]);
  console.log('Campaign Outbox Status Breakdown:', rOutboxStatus.rows);

  // 7. Verify 6-Field Real-Document Search Contract
  console.log('\n7. Verifying 6-Field Search Contract on live port 7700...');
  const fields = [
    'search_text_normalized', 'display_name', 'display_name_normalized',
    'organization', 'role', 'profession'
  ];
  let contractPassed = 0;
  const contractDetails = {};
  for (const f of fields) {
    // Find a doc with this field
    const sRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents?limit=200`);
    const docs = (await sRes.json()).results;
    let targetDoc = docs.find(d => d[f] && typeof d[f] === 'string' && d[f].trim().length > 2);
    if (!targetDoc) {
      // search for one
      const sr = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'Sociedad', limit: 10 })
      });
      const hits = (await sr.json()).hits;
      targetDoc = hits.find(d => d[f] && typeof d[f] === 'string' && d[f].trim().length > 2);
    }

    const words = targetDoc[f].split(/\s+/).filter(w => w.length >= 4);
    const qTerm = words[0] || targetDoc[f].substring(0, 5);

    const qRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: qTerm, limit: 10 })
    });
    const qHits = (await qRes.json()).hits;
    const isFound = qHits.some(h => h.atlas_person_id === targetDoc.atlas_person_id);
    if (isFound) contractPassed++;
    contractDetails[f] = { term: qTerm, found: isFound };
  }
  console.log(`SEARCH_FIELD_COVERAGE:  ${contractPassed}/6`);
  console.log(`SEARCH_CONTRACT_PARITY: ${contractPassed === 6 ? '100%' : 'FAIL'}`);

  // 8. Search Settings Parity Check
  const idxData = await (await fetch(`${MEILI_URL}/indexes/${INDEX_UID}`)).json();
  const setRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/settings`);
  const settings = await setRes.json();
  const primaryKeyOk = idxData.primaryKey === 'atlas_person_id';
  const expectedSearchable = [
    'display_name', 'display_name_normalized', 'organization', 'role', 'profession', 'search_text_normalized'
  ];
  const searchableOk = JSON.stringify(settings.searchableAttributes) === JSON.stringify(expectedSearchable);
  const settingsParityOk = primaryKeyOk && searchableOk;
  console.log(`CURRENT_SEARCH_SETTINGS_PARITY: ${settingsParityOk ? '100%' : 'FAIL'}`);

  client.release();
  await pool.end();
}

main().catch(console.error);
