import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const pre3c = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as arca_pre_3c
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' 
      AND status = 'PUBLISHED'
      AND created_at < '2026-09-19T15:50:00Z'
  `);
  console.log('ARCA pre-3C distinct PIDs in outbox:', pre3c.rows[0]);

  const canary3c = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as arca_canary
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' 
      AND status = 'PUBLISHED'
      AND created_at >= '2026-09-19T15:50:00Z'
      AND created_at < '2026-09-19T16:00:00Z'
  `);
  console.log('ARCA canary 3C distinct PIDs in outbox:', canary3c.rows[0]);

  const proof3c = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as arca_proof
    FROM public.atlas_search_outbox
    WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' 
      AND status = 'PUBLISHED'
      AND created_at >= '2026-09-19T16:00:00Z'
  `);
  console.log('ARCA proof 3C distinct PIDs in outbox:', proof3c.rows[0]);

  await client.end();
}

main().catch(console.error);
