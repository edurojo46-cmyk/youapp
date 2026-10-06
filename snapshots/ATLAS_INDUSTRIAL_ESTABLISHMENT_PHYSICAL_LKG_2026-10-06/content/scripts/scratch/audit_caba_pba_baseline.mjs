import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== AUDITING CABA / PBA PHYSICAL BASELINE ===\n');

  // 1. Inspect atlas_geographies
  try {
    const geoRes = await c.query(`
      SELECT geography_id, name, geography_type, georef_id
      FROM atlas_geographies
      LIMIT 20
    `);
    console.log('atlas_geographies sample:');
    console.table(geoRes.rows);
  } catch (err) {
    console.log('Error reading atlas_geographies:', err.message);
  }

  // 2. Inspect atlas_people_discovery_candidates geography breakdown
  try {
    const candGeo = await c.query(`
      SELECT 
        geography_id, 
        location_relation_type,
        count(*) as count
      FROM atlas_people_discovery_candidates
      GROUP BY geography_id, location_relation_type
      ORDER BY count DESC
      LIMIT 25
    `);
    console.log('\natlas_people_discovery_candidates geography_id breakdown:');
    console.table(candGeo.rows);
  } catch (err) {
    console.log('Error in candidates:', err.message);
  }

  // 3. Inspect sources in atlas_person_identity_map and see their volume
  try {
    const topSources = await c.query(`
      SELECT source_id, count(*) as count
      FROM atlas_person_identity_map
      GROUP BY source_id
      ORDER BY count DESC
      LIMIT 30
    `);
    console.log('\nTop 30 Sources in atlas_person_identity_map:');
    console.table(topSources.rows);
  } catch (err) {
    console.log('Error top sources:', err.message);
  }

  await c.end();
}

main().catch(console.error);
