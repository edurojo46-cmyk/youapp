import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('--- Sources in atlas_people_discovery_candidates ---');
  const candSources = await c.query(`
    SELECT source_id, count(*) as count
    FROM atlas_people_discovery_candidates
    GROUP BY source_id
    ORDER BY count DESC
    LIMIT 30;
  `);
  console.table(candSources.rows);

  console.log('\n--- Location relation types in discovery_candidates ---');
  const locTypes = await c.query(`
    SELECT location_relation_type, count(*) as count
    FROM atlas_people_discovery_candidates
    GROUP BY location_relation_type
    ORDER BY count DESC;
  `);
  console.table(locTypes.rows);

  console.log('\n--- Geography IDs in discovery_candidates ---');
  const geoIds = await c.query(`
    SELECT geography_id, count(*) as count
    FROM atlas_people_discovery_candidates
    GROUP BY geography_id
    ORDER BY count DESC
    LIMIT 20;
  `);
  console.table(geoIds.rows);

  await c.end();
}

main().catch(console.error);
