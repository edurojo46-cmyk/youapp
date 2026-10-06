import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7701';
const INDEX_UID = 'atlas_people_discovery_gate32_delta';

async function waitForTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const data = await res.json();
    if (data.status === 'succeeded') return data;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Meilisearch task ${taskUid} failed: ${JSON.stringify(data.error)}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

async function main() {
  console.log('================================================================');
  console.log('⚡ NARROWLY SCOPED SEARCH REPAIR FOR PERSISTENT PRODUCTION DELTA');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  console.log('1. Loading 1,000,000 net-new IDs from PostgreSQL...');
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

  const expectedSet = new Set(newIdsRes.rows.map(r => r.atlas_person_id));
  console.log(`Expected Net-New Person IDs: ${expectedSet.size}`);

  console.log('2. Loading existing IDs from persistent Meilisearch (port 7701)...');
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
  }
  console.log(`Currently in persistent Meilisearch: ${meiliIds.size} total IDs.`);

  const missingIds = [];
  for (const id of expectedSet) {
    if (!meiliIds.has(id)) {
      missingIds.push(id);
    }
  }
  console.log(`Identified ${missingIds.length} missing net-new IDs in persistent Meilisearch.`);

  if (missingIds.length > 0) {
    console.log('\n3. Pushing missing document payloads from atlas_search_outbox in batches...');
    const batchSize = 5000;
    let pushed = 0;

    for (let i = 0; i < missingIds.length; i += batchSize) {
      const slice = missingIds.slice(i, i + batchSize);
      const outboxRes = await client.query(`
        SELECT payload FROM public.atlas_search_outbox
        WHERE atlas_person_id = ANY($1)
      `, [slice]);

      // Deduplicate payload by atlas_person_id if multiple rows exist
      const uniqueDocs = [];
      const seen = new Set();
      for (const r of outboxRes.rows) {
        if (!seen.has(r.payload.atlas_person_id)) {
          uniqueDocs.push(r.payload);
          seen.add(r.payload.atlas_person_id);
        }
      }

      const pRes = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uniqueDocs)
      });
      const pJson = await pRes.json();
      if (!pRes.ok) throw new Error(`POST failed: ${JSON.stringify(pJson)}`);

      await waitForTask(pJson.taskUid);
      pushed += uniqueDocs.length;
      console.log(`  Pushed & indexed batch: ${pushed} / ${missingIds.length} documents...`);
    }
  }

  console.log('\n4. Running 100% full post-repair reconciliation on port 7701...');
  const verifyMeiliIds = new Set();
  offset = 0;
  while (true) {
    const res = await fetch(`${MEILI_URL}/indexes/${INDEX_UID}/documents?fields=atlas_person_id&offset=${offset}&limit=${limit}`);
    const data = await res.json();
    if (!data.results || data.results.length === 0) break;
    for (const doc of data.results) {
      verifyMeiliIds.add(doc.atlas_person_id);
    }
    offset += data.results.length;
  }

  let finalFound = 0;
  let finalMissing = 0;
  for (const id of expectedSet) {
    if (verifyMeiliIds.has(id)) {
      finalFound++;
    } else {
      finalMissing++;
    }
  }

  console.log('\n================================================================');
  console.log(`FINAL RECONCILIATION RESULT:`);
  console.log(`EXPECTED_FINAL_SEARCH_IDS = ${expectedSet.size}`);
  console.log(`FOUND_FINAL_SEARCH_IDS    = ${finalFound}`);
  console.log(`MISSING_FINAL_SEARCH_IDS  = ${finalMissing}`);
  console.log('================================================================\n');

  client.release();
  await pool.end();
}

main().catch(console.error);
