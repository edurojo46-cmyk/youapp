import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== FAST INDEXED GEOGRAPHY AUDIT ===\n');

  // 1. Get CABA geography IDs
  const geoCabaRes = await c.query(`
    SELECT geography_id, name, geography_type, georef_id
    FROM atlas_geographies
    WHERE georef_id = '02' OR name ILIKE '%Buenos Aires%' OR geography_type = 'AUTONOMOUS_CITY'
  `);
  console.log('CABA Geographies in atlas_geographies:');
  console.table(geoCabaRes.rows);

  // 2. Get PBA geography IDs
  const geoPbaRes = await c.query(`
    SELECT count(*) as pba_geos_count
    FROM atlas_geographies
    WHERE georef_id LIKE '06%' OR geography_type = 'PARTIDO'
  `);
  console.log('PBA Partidos in atlas_geographies:', geoPbaRes.rows[0].pba_geos_count);

  // 3. Count candidates by geography_id using index
  const candByGeo = await c.query(`
    SELECT geography_id, count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE geography_id IS NOT NULL
    GROUP BY geography_id
    ORDER BY count DESC
    LIMIT 20
  `);
  console.log('\nTop geography_id in atlas_people_discovery_candidates:');
  console.table(candByGeo.rows);

  // 4. Count by location_relation_type using index
  const candByRel = await c.query(`
    SELECT location_relation_type, count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE location_relation_type IS NOT NULL
    GROUP BY location_relation_type
    ORDER BY count DESC
    LIMIT 20
  `);
  console.log('\nTop location_relation_type in atlas_people_discovery_candidates:');
  console.table(candByRel.rows);

  // 5. Count by source_id using index
  const candBySource = await c.query(`
    SELECT source_id, count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE source_id IS NOT NULL
    GROUP BY source_id
    ORDER BY count DESC
    LIMIT 20
  `);
  console.log('\nTop source_id in atlas_people_discovery_candidates:');
  console.table(candBySource.rows);

  await c.end();
}

main().catch(console.error);
