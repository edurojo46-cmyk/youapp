import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  // 1. Fetch all Meili IDs
  const meiliIds = new Set();
  let offset = 0;
  const limit = 50000;
  while (true) {
    const res = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?limit=${limit}&offset=${offset}&fields=atlas_person_id`);
    const data = await res.json();
    const docs = data.results || data;
    if (!docs || docs.length === 0) break;
    for (const d of docs) meiliIds.add(d.atlas_person_id);
    offset += docs.length;
    if (docs.length < limit) break;
  }
  console.log(`LIVE_MEILI_DOCUMENT_COUNT: ${meiliIds.size}`);

  // 2. Query all distinct ARCA published outbox pids
  const arcaRes = await client.query(`
    SELECT DISTINCT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND status = 'PUBLISHED'
  `);
  const arcaPids = new Set(arcaRes.rows.map(r => r.atlas_person_id));
  console.log(`ARCA Published Outbox PIDs in DB: ${arcaPids.size}`);

  // Check how many ARCA outbox PIDs are in Meili
  let arcaInMeili = 0;
  let arcaNotInMeili = 0;
  for (const pid of arcaPids) {
    if (meiliIds.has(pid)) arcaInMeili++;
    else arcaNotInMeili++;
  }
  console.log(`ARCA Outbox in Meili: ${arcaInMeili} / ${arcaPids.size} (Missing in Meili: ${arcaNotInMeili})`);

  // Check other sources in outbox
  const otherRes = await client.query(`
    SELECT DISTINCT atlas_person_id, source_id
    FROM public.atlas_search_outbox
    WHERE source_id != 'ARCA_CONDICION_TRIBUTARIA' AND status = 'PUBLISHED'
  `);
  console.log(`Other published outbox rows: ${otherRes.rows.length}`);

  await client.end();
}

main().catch(console.error);
