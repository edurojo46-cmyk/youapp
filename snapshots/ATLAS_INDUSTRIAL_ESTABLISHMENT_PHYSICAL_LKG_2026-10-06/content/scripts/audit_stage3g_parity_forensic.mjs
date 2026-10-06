import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Client } = pg;

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

async function main() {
  console.log('--- FORENSIC AUDIT: STAGE 3G 10K CANARY SEARCH PARITY ---');
  const client = new Client(parseDbUrl());
  await client.connect();

  try {
    // 1. Fetch all outbox rows from the canary (last 30 minutes)
    const res = await client.query(`
      SELECT outbox_id, atlas_person_id, status
      FROM public.atlas_search_outbox
      WHERE created_at >= now() - interval '30 minutes'
      ORDER BY created_at ASC;
    `);

    console.log(`Total canary outbox records: ${res.rows.length}`);
    const outboxIds = res.rows.map(r => r.atlas_person_id);

    // Check all outbox IDs against Meilisearch
    let meiliFound = 0;
    let meiliMissing = 0;
    const missingIds = [];

    // Batch query Meilisearch
    for (let i = 0; i < outboxIds.length; i += 100) {
      const chunk = outboxIds.slice(i, i + 100);
      await Promise.all(chunk.map(async pid => {
        const mRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${pid}`);
        if (mRes.ok) {
          meiliFound++;
        } else {
          meiliMissing++;
          missingIds.push(pid);
        }
      }));
    }

    console.log(`Meilisearch Check Results:`);
    console.log(`  Expected Canary Outbox People: ${outboxIds.length}`);
    console.log(`  Present in Meilisearch:         ${meiliFound}`);
    console.log(`  Missing in Meilisearch:         ${meiliMissing}`);

    // Check current Meilisearch total count
    const statsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/stats`);
    const stats = await statsRes.json();
    console.log(`  Total Meilisearch Delta Docs:   ${stats.numberOfDocuments}`);

  } finally {
    await client.end();
  }
}

main().catch(console.error);
