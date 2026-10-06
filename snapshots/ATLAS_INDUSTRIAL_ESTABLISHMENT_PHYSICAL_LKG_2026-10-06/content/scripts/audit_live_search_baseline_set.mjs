import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

async function main() {
  console.log('=== SECTION 0: EXACT LIVE SEARCH BASELINE SET AUDIT ===\n');

  const client = new pg.Client(parseDbUrl());
  await client.connect();

  // 1. Get Meili stats
  const statsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/stats`);
  const stats = await statsRes.json();
  const liveMeiliCount = stats.numberOfDocuments;
  console.log(`Live Meili document count: ${liveMeiliCount}`);

  // 2. Fetch all document IDs from Meilisearch delta index
  console.log('Fetching all document IDs from Meilisearch...');
  const meiliIds = new Set();
  let duplicateMeiliIds = 0;
  let offset = 0;
  const limit = 50000;

  while (true) {
    const docsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?limit=${limit}&offset=${offset}&fields=atlas_person_id`);
    const data = await docsRes.json();
    const docs = data.results || data;
    if (!docs || docs.length === 0) break;
    for (const doc of docs) {
      if (meiliIds.has(doc.atlas_person_id)) {
        duplicateMeiliIds++;
      } else {
        meiliIds.add(doc.atlas_person_id);
      }
    }
    offset += docs.length;
    console.log(`  Fetched ${offset} / ${liveMeiliCount}...`);
    if (docs.length < limit) break;
  }
  console.log(`Distinct Meili IDs fetched: ${meiliIds.size} (Duplicates encountered: ${duplicateMeiliIds})`);

  // 3. Query PostgreSQL published outbox distinct person IDs
  console.log('\nQuerying PostgreSQL published outbox distinct person IDs...');
  const outboxRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE status = 'PUBLISHED'
  `);
  const outboxPids = new Set(outboxRes.rows.map(r => r.atlas_person_id));
  console.log(`PostgreSQL published distinct outbox PIDs: ${outboxPids.size}`);

  // Also query total outbox breakdown
  const outboxStatus = await client.query(`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE status = 'PENDING') as pending,
      count(*) FILTER (WHERE status = 'PROCESSING') as processing,
      count(*) FILTER (WHERE status = 'PUBLISHED') as published,
      count(*) FILTER (WHERE status = 'QUARANTINED') as quarantined
    FROM public.atlas_search_outbox
  `);
  console.log('Outbox breakdown:', outboxStatus.rows[0]);

  // Also query canonical distinct
  const canRes = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as canonical_distinct
    FROM public.atlas_person_identity_map
  `);
  console.log(`Canonical distinct in identity map: ${canRes.rows[0].canonical_distinct}`);

  // 4. Set comparison: Meili vs Outbox
  // Note: Is Meili supposed to match outbox published PIDs?
  // Let's check intersection, missing, and extra:
  let missingInOutbox = 0;
  let missingInMeili = 0;
  const extraInMeili = [];
  const extraInOutbox = [];

  for (const id of meiliIds) {
    if (!outboxPids.has(id)) {
      missingInOutbox++;
      if (extraInMeili.length < 10) extraInMeili.push(id);
    }
  }

  for (const id of outboxPids) {
    if (!meiliIds.has(id)) {
      missingInMeili++;
      if (extraInOutbox.length < 10) extraInOutbox.push(id);
    }
  }

  console.log('\n--- SET AUDIT RESULTS ---');
  console.log(`LIVE_MEILI_DOCUMENT_COUNT: ${liveMeiliCount}`);
  console.log(`LIVE_MEILI_DISTINCT_IDS: ${meiliIds.size}`);
  console.log(`LIVE_PUBLISHED_OUTBOX_DISTINCT_PIDS: ${outboxPids.size}`);
  console.log(`MEILI IDs NOT in Outbox Published: ${missingInOutbox} (Sample: ${JSON.stringify(extraInMeili)})`);
  console.log(`Outbox Published IDs NOT in Meili: ${missingInMeili} (Sample: ${JSON.stringify(extraInOutbox)})`);

  // Let's also check what expected delta IDs are:
  // The delta index was created for gate32. In gate32, stages 1 (10k), 2 (50k), 3 (100k), canary (5k), proof (100k) were added.
  // Let's find exactly which stage each document came from or if any ID is extra!
  
  await client.end();
}

main().catch(console.error);
