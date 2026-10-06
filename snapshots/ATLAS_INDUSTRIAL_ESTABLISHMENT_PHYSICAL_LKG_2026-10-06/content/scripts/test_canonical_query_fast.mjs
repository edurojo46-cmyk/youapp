import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const sql = `
    SELECT 
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region IN ('CABA', 'PBA')) AS canonical_total,
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region = 'CABA') AS canonical_caba,
      count(DISTINCT c.atlas_person_id) FILTER (WHERE c.target_region = 'PBA') AS canonical_pba
    FROM atlas_people_discovery_candidates c 
    JOIN atlas_person_identity_map m ON c.atlas_person_id = m.atlas_person_id 
    WHERE c.target_region IN ('CABA', 'PBA') 
      AND c.current_activity_state = 'ACTIVE' 
      AND c.geo_confidence >= 0.80;
  `;
  console.log('Executing exact canonical denominator query...');
  const t0 = Date.now();
  try {
    const res = await pool.query(sql);
    console.log(`Executed in ${Date.now() - t0}ms:`, res.rows[0]);
  } catch (e) {
    console.error(`Error after ${Date.now() - t0}ms:`, e.message);
  }
  await pool.end();
}

run();
