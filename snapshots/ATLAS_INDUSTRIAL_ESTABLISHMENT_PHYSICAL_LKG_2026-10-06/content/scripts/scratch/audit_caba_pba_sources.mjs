import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== 1. MOTOR REGISTRY & SOURCE INVENTORY ===\n');
  const motors = await c.query(`
    SELECT motor_id, source_name, source_family, source_universe, protocol, enabled, status
    FROM atlas_discovery_source_motors
    ORDER BY motor_id
  `);
  console.table(motors.rows);

  console.log('\n=== 2. PROJECTION / DISCOVERY CANDIDATES LOCATION SUMMARY ===');
  // Sample discovery candidates to see geography values
  const sampleCand = await c.query(`
    SELECT geography_id, location_relation_type, count(*)
    FROM atlas_people_discovery_candidates
    WHERE geography_id IS NOT NULL
    GROUP BY geography_id, location_relation_type
    LIMIT 30
  `);
  console.table(sampleCand.rows);

  console.log('\n=== 3. LIVE METRICS RECORD ===');
  const lm = await c.query(`SELECT * FROM atlas_people_live_metrics WHERE id = 'current'`);
  console.log(lm.rows[0]);

  await c.end();
}

main().catch(console.error);
