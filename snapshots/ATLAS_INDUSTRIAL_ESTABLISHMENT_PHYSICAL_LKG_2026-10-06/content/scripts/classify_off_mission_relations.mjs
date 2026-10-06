import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  console.log('========================================================================');
  console.log('🛡️ ATLAS INTELLIGENCE CONSTITUTION: OFF-MISSION CLEANUP & CLASSIFICATION');
  console.log('========================================================================\n');

  // 1. Audit current counts
  console.log('>>> [1/3] Auditing initial product universe in public.atlas_products...');
  const initRes = await client.query(`
    SELECT 
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE status = 'ACTIVE') AS active_count,
      COUNT(*) FILTER (WHERE status = 'REJECTED_OFF_MISSION') AS rejected_count,
      COUNT(*) FILTER (
        WHERE attributes_json->>'source' ILIKE '%DNDA%' 
           OR attributes_json->>'source' ILIKE '%DERECHO_AUTOR%'
           OR attributes_json->'evidence'->>'file' ILIKE '%derecho-autor%'
      ) AS dnda_count
    FROM public.atlas_products;
  `);
  console.log('Initial stats:', initRes.rows[0]);

  // 2. Classify off-mission records as REJECTED_OFF_MISSION
  console.log('\n>>> [2/3] Updating status of off-mission relations to REJECTED_OFF_MISSION...');
  const updateRes = await client.query(`
    UPDATE public.atlas_products
    SET status = 'REJECTED_OFF_MISSION'
    WHERE (
      attributes_json->>'source' ILIKE '%DNDA%' 
      OR attributes_json->>'source' ILIKE '%DERECHO_AUTOR%'
      OR attributes_json->'evidence'->>'file' ILIKE '%derecho-autor%'
    )
    AND status != 'REJECTED_OFF_MISSION';
  `);
  console.log(`Updated ${updateRes.rowCount} records to REJECTED_OFF_MISSION.`);

  // 3. Final classification report
  console.log('\n>>> [3/3] Final Semantic Classification Breakdown:');
  const finalRes = await client.query(`
    SELECT 
      COUNT(*) AS total_records,
      COUNT(*) FILTER (
        WHERE status = 'ACTIVE' 
          AND (
            attributes_json->>'source' ILIKE '%CHAS%'
            OR attributes_json->>'source' ILIKE '%ANMAT%'
          )
      ) AS constitutionally_certified,
      COUNT(*) FILTER (
        WHERE status = 'ACTIVE' 
          AND attributes_json->>'source' NOT ILIKE '%CHAS%'
          AND attributes_json->>'source' NOT ILIKE '%ANMAT%'
      ) AS legacy_pending,
      COUNT(*) FILTER (WHERE status = 'REJECTED_OFF_MISSION') AS rejected_off_mission
    FROM public.atlas_products;
  `);

  const r = finalRes.rows[0];
  console.log('------------------------------------------------------------------------');
  console.log('TOTAL_RECORDS_PRESERVED =', r.total_records);
  console.log('CONSTITUTIONALLY_CERTIFIED =', r.constitutionally_certified);
  console.log('LEGACY_PENDING =', r.legacy_pending);
  console.log('REJECTED_OFF_MISSION =', r.rejected_off_mission);
  console.log('------------------------------------------------------------------------');

  await client.end();
}

main().catch(err => {
  console.error('Classification error:', err);
  process.exit(1);
});
