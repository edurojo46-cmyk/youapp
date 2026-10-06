import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();
const client = new pg.Client({ ...dbConfig });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT count(*) as total, 
           count(CASE WHEN entity_capabilities ? 'PERSON' THEN 1 END) as person_sources,
           count(CASE WHEN geography_scope IN ('CABA', 'PBA', 'ARGENTINA') THEN 1 END) as caba_pba_sources
    FROM public.atlas_source_knowledge_map
  `);
  console.log('SOURCE_MAP_STATS:', res.rows[0]);

  const res2 = await client.query("SELECT count(source_record_id) as count FROM public.atlas_people_discovery_candidates WHERE source_id LIKE 'SRC_OPENALEX%'");
  console.log('PROD_OPENALEX_CANDIDATES_COUNT:', res2.rows[0].count);
  await client.end();
}

run().catch(console.error);
