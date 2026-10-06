import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function check() {
  const c = await pool.connect();
  const qNull = await c.query('SELECT count(*) FROM public.atlas_people_discovery_candidates WHERE atlas_person_id IS NULL;');
  console.log('Candidates with atlas_person_id IS NULL:', qNull.rows[0].count);

  const qNotNull = await c.query('SELECT count(*) FROM public.atlas_people_discovery_candidates WHERE atlas_person_id IS NOT NULL;');
  console.log('Candidates with atlas_person_id IS NOT NULL:', qNotNull.rows[0].count);

  const qDistNull = await c.query('SELECT count(DISTINCT source_record_id) FROM public.atlas_people_discovery_candidates WHERE atlas_person_id IS NULL;');
  console.log('Distinct source_record_id with atlas_person_id IS NULL:', qDistNull.rows[0].count);

  c.release();
  await pool.end();
}

check().catch(console.error);
