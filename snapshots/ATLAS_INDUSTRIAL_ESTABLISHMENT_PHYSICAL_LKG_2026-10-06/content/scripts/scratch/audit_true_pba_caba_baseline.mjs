import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== FAST INDEXED AUDIT: CABA & PBA BASELINE IN SSOT ===\n');

  // Check columns of atlas_geographies
  const colsRes = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_geographies'
  `);
  console.log('Columns in atlas_geographies:');
  console.table(colsRes.rows);

  const sampleGeos = await c.query(`SELECT * FROM atlas_geographies LIMIT 5`);
  console.log('Sample atlas_geographies rows:');
  console.table(sampleGeos.rows);

  // 1. Get exact PBA geography_ids from atlas_geographies
  const pbaGeosRes = await c.query(`
    SELECT geography_id, name, georef_id
    FROM atlas_geographies
    WHERE georef_id LIKE '06%' OR name ILIKE '%Buenos Aires%'
  `);
  const pbaGeoIds = pbaGeosRes.rows.map(r => r.geography_id);
  console.log(`Found ${pbaGeoIds.length} PBA geography_ids in atlas_geographies.`);

  // 2. Count candidates by exact PBA geography_ids (using index idx_discovery_candidates_geography_id)
  const candPbaGeoRes = await c.query(`
    SELECT geography_id, count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE geography_id = ANY($1)
    GROUP BY geography_id
    ORDER BY count DESC
  `, [pbaGeoIds]);
  console.log('Candidates matching PBA geography_ids:');
  console.table(candPbaGeoRes.rows);

  // 3. Inspect sources in atlas_person_identity_map (fast distinct/aggregation)
  const sourceRes = await c.query(`
    SELECT source_id, count(*) as map_rows, count(DISTINCT atlas_person_id) as unique_people
    FROM atlas_person_identity_map
    GROUP BY source_id
    ORDER BY map_rows DESC
  `);
  console.log('\nAll sources in atlas_person_identity_map (SSOT):');
  console.table(sourceRes.rows);

  // 4. In discovery candidates, check by source_id (indexed idx_discovery_candidates_source_id)
  const candSources = await c.query(`
    SELECT source_id, count(*) as count
    FROM atlas_people_discovery_candidates
    GROUP BY source_id
    ORDER BY count DESC
  `);
  console.log('\nCandidate counts by source_id:');
  console.table(candSources.rows);

  await c.end();
}

main().catch(console.error);
