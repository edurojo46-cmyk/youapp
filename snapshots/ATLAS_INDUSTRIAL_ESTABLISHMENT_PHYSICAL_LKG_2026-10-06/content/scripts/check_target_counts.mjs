import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const client = new pg.Client(parseDbUrl());
async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT target_region, count(*) 
    FROM atlas_people_discovery_candidates 
    WHERE target_region IS NOT NULL 
    GROUP BY target_region;
  `);
  console.log('Target regions:', res.rows);

  const leftRes = await client.query(`
    SELECT count(*) 
    FROM atlas_people_discovery_candidates 
    WHERE geography_id = 'caba' AND target_region IS NULL;
  `);
  console.log('CABA left without target_region:', leftRes.rows[0].count);

  await client.end();
}
run().catch(console.error);
