import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const testIds = [
    '75865af3-f102-4719-8c25-ebca47fc2d5b',
    '0783ed67-f0f8-475b-8906-45cddbb38582',
    'geo_caba_capital',
    'caba',
    'CABA',
    'e43d8c8a-9211-4562-88c5-5a523169c6b6',
    'pba',
    'PBA',
    'arg_nacional'
  ];

  console.log('Testing indexed counts:');
  for (const id of testIds) {
    const t0 = performance.now();
    const res = await c.query(
      'SELECT count(*) FROM atlas_people_discovery_candidates WHERE geography_id = $1',
      [id]
    );
    const ms = performance.now() - t0;
    console.log(`geography_id: "${id}" -> count: ${res.rows[0].count} (${ms.toFixed(1)}ms)`);
  }

  // Also test sample of distinct non-null geography_ids using a quick distinct query
  const sampleGeo = await c.query('SELECT DISTINCT geography_id FROM atlas_people_discovery_candidates WHERE geography_id IS NOT NULL LIMIT 25');
  console.log('Distinct geography_id sample:', sampleGeo.rows);

  await c.end();
}

main().catch(console.error);
