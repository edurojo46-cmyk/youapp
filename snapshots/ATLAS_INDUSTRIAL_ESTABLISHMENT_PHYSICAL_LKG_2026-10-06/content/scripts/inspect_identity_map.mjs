import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();
  const t0 = Date.now();
  const res = await c.query("SELECT discovery_id, source_id, source_record_id, display_name, organization FROM atlas_people_discovery_candidates WHERE source_id = 'IGJ_AUTORIDADES_GENERO_2026' LIMIT 15");
  console.log('IGJ query took:', Date.now() - t0, 'ms. Rows:', res.rows.length);
  console.log('Sample row:', res.rows[0]);
  await c.end();
}

main().catch(console.error);
