import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl() });

async function checkM3() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT count(*) as total,
             count(*) FILTER (WHERE primary_unit = 'PRODUCT') as products,
             count(*) FILTER (WHERE primary_unit = 'PERSON') as persons,
             count(*) FILTER (WHERE mandatory_criteria_status->>'ENTITY_EXISTENCE_PROOF_PRODUCT' = 'PASS') as product_criteria_pass
      FROM public.atlas_autonomous_mission_records
      WHERE mission_id = 'MISSION_3_PRODUCTOS_MEDICOS_ANMAT';
    `);
    console.log('M3 Counts:', res.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

checkM3().catch(console.error);
