import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function check() {
  const c = await pool.connect();
  const qDistinctCand = await c.query(`
    SELECT count(DISTINCT source_record_id) 
    FROM public.atlas_people_discovery_candidates;
  `);
  console.log('Distinct source_record_id in candidates:', qDistinctCand.rows[0].count);

  const qDistinctDiscId = await c.query(`
    SELECT count(DISTINCT discovery_id) 
    FROM public.atlas_people_discovery_candidates;
  `);
  console.log('Distinct discovery_id in candidates:', qDistinctDiscId.rows[0].count);

  c.release();
  await pool.end();
}

check().catch(console.error);
