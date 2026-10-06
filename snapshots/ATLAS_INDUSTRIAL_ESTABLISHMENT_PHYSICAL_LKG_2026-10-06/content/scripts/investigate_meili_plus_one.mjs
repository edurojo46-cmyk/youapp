import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

async function main() {
  console.log('=== INVESTIGATING EXACT +1 MEILISEARCH DOCUMENT ===\n');

  // Let's search Meilisearch for any document with 'test' or created around 15:52Z
  const qTest = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 'test', limit: 20 })
  });
  const data = await qTest.json();
  console.log('Search for "test" in Meili:', data.hits.map(h => ({ id: h.atlas_person_id, name: h.display_name, source: h.source_id })));

  // Let's check recent documents added to Meili
  const recentDocs = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?limit=20&offset=226954`);
  const rDocs = await recentDocs.json();
  console.log('Last 20 documents in Meili:', (rDocs.results || rDocs).map(d => ({
    id: d.atlas_person_id,
    name: d.display_name,
    cuit: d.cuit_masked,
    created_at: d.created_at
  })));
}

main().catch(console.error);
