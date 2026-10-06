import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

async function main() {
  console.log('=== FULL POPULATION BREAKDOWN OF MEILISEARCH DELTA INDEX ===\n');

  let offset = 0;
  const limit = 50000;
  const sourceBreakdown = {};
  const allMeiliPids = new Set();
  const duplicateIds = new Set();

  while (true) {
    const res = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?limit=${limit}&offset=${offset}&fields=atlas_person_id,source_id,created_at`);
    const data = await res.json();
    const docs = data.results || data;
    if (!docs || docs.length === 0) break;
    for (const d of docs) {
      if (allMeiliPids.has(d.atlas_person_id)) {
        duplicateIds.add(d.atlas_person_id);
      } else {
        allMeiliPids.add(d.atlas_person_id);
      }
      sourceBreakdown[d.source_id] = (sourceBreakdown[d.source_id] || 0) + 1;
    }
    offset += docs.length;
    console.log(`Fetched ${offset}...`);
    if (docs.length < limit) break;
  }

  console.log('\nMeilisearch Delta Source Breakdown:');
  console.table(sourceBreakdown);
  console.log(`Total documents: ${allMeiliPids.size}`);
  console.log(`Duplicate IDs: ${duplicateIds.size}`);

  // Now check how many of each source match PostgreSQL atlas_search_outbox
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const outboxPublished = await client.query(`
    SELECT source_id, count(DISTINCT atlas_person_id) as distinct_pids, count(*) as total_events
    FROM public.atlas_search_outbox
    WHERE status = 'PUBLISHED'
    GROUP BY source_id
  `);
  console.log('\nPostgreSQL Published Outbox Breakdown by source_id:');
  console.table(outboxPublished.rows);

  await client.end();
}

main().catch(console.error);
