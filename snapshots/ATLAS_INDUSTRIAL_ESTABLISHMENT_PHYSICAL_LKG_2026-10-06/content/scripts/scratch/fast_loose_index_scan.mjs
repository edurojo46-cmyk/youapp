import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== FAST LOOSE INDEX SCAN FOR DISTINCT GEOGRAPHY_ID ===\n');
  const distinctGeos = await c.query(`
    WITH RECURSIVE t AS (
      (SELECT geography_id FROM atlas_people_discovery_candidates WHERE geography_id IS NOT NULL ORDER BY geography_id LIMIT 1)
      UNION ALL
      SELECT (SELECT geography_id FROM atlas_people_discovery_candidates WHERE geography_id > t.geography_id AND geography_id IS NOT NULL ORDER BY geography_id LIMIT 1)
      FROM t WHERE t.geography_id IS NOT NULL
    )
    SELECT geography_id FROM t WHERE geography_id IS NOT NULL;
  `);
  console.log('Distinct geography_id values found:');
  console.table(distinctGeos.rows);

  console.log('\n=== FAST LOOSE INDEX SCAN FOR DISTINCT LOCATION_RELATION_TYPE ===\n');
  const distinctRels = await c.query(`
    WITH RECURSIVE t AS (
      (SELECT location_relation_type FROM atlas_people_discovery_candidates WHERE location_relation_type IS NOT NULL ORDER BY location_relation_type LIMIT 1)
      UNION ALL
      SELECT (SELECT location_relation_type FROM atlas_people_discovery_candidates WHERE location_relation_type > t.location_relation_type AND location_relation_type IS NOT NULL ORDER BY location_relation_type LIMIT 1)
      FROM t WHERE t.location_relation_type IS NOT NULL
    )
    SELECT location_relation_type FROM t WHERE location_relation_type IS NOT NULL;
  `);
  console.log('Distinct location_relation_type values found:');
  console.table(distinctRels.rows);

  console.log('\n=== FAST LOOSE INDEX SCAN FOR DISTINCT SOURCE_ID ===\n');
  const distinctSources = await c.query(`
    WITH RECURSIVE t AS (
      (SELECT source_id FROM atlas_people_discovery_candidates WHERE source_id IS NOT NULL ORDER BY source_id LIMIT 1)
      UNION ALL
      SELECT (SELECT source_id FROM atlas_people_discovery_candidates WHERE source_id > t.source_id AND source_id IS NOT NULL ORDER BY source_id LIMIT 1)
      FROM t WHERE t.source_id IS NOT NULL
    )
    SELECT source_id FROM t WHERE source_id IS NOT NULL;
  `);
  console.log('Distinct source_id values in discovery candidates:');
  console.table(distinctSources.rows);

  await c.end();
}

main().catch(console.error);
