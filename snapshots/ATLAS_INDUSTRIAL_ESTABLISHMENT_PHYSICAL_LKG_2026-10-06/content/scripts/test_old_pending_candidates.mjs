import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const sample = await client.query(`
  SELECT outbox_id, atlas_person_id, source_id, source_record_id, created_at
  FROM public.atlas_search_outbox
  WHERE status = ANY (ARRAY['PENDING'::text, 'RETRY'::text])
  LIMIT 100
`);

let matchedCandidates = 0;
let matchedSSOT = 0;

for (const row of sample.rows) {
  const cRes = await client.query(`
    SELECT discovery_id FROM public.atlas_people_discovery_candidates 
    WHERE source_id = $1 AND source_record_id = $2
    LIMIT 1
  `, [row.source_id, row.source_record_id]);
  if (cRes.rows.length > 0) matchedCandidates++;

  if (row.atlas_person_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.atlas_person_id)) {
    const sRes = await client.query(`
      SELECT person_id FROM public.atlas_people
      WHERE person_id = $1::uuid
      LIMIT 1
    `, [row.atlas_person_id]);
    if (sRes.rows.length > 0) matchedSSOT++;
  }
}

console.log(`Sample checked: ${sample.rows.length}`);
console.log(`Matched in atlas_people_discovery_candidates: ${matchedCandidates} / ${sample.rows.length}`);
console.log(`Matched in atlas_people (SSOT): ${matchedSSOT} / ${sample.rows.length}`);

await client.end();
