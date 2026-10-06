import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  // Check OpenAlex
  const openalexOutbox = await client.query(`SELECT count(DISTINCT atlas_person_id) FROM public.atlas_search_outbox WHERE source_id = 'OPENALEX_ROR_UBA' AND status = 'PUBLISHED'`);
  // Check Wikidata
  const wikidataOutbox = await client.query(`SELECT count(DISTINCT atlas_person_id) FROM public.atlas_search_outbox WHERE source_id = 'WIKIDATA_SPARQL_CABA' AND status = 'PUBLISHED'`);
  // Check IGJ
  const igjOutbox = await client.query(`SELECT count(DISTINCT atlas_person_id) FROM public.atlas_search_outbox WHERE source_id = 'IGJ_AUTORIDADES_GENERO_2026' AND status = 'PUBLISHED'`);

  console.log('PostgreSQL outbox distinct counts:');
  console.log('OPENALEX_ROR_UBA:', openalexOutbox.rows[0].count);
  console.log('WIKIDATA_SPARQL_CABA:', wikidataOutbox.rows[0].count);
  console.log('IGJ_AUTORIDADES_GENERO_2026:', igjOutbox.rows[0].count);

  await client.end();
}

main().catch(console.error);
