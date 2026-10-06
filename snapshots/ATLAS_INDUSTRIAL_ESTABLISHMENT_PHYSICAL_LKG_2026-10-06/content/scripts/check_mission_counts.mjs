import dotenv from 'dotenv';
dotenv.config();
import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
async function check() {
  const c = await pool.connect();
  const qAll = await c.query('SELECT count(*) FROM public.atlas_global_email_authority;');
  const qPre = await c.query('SELECT count(*) FROM public.atlas_global_email_authority WHERE is_preexisting = true;');
  const qNetNew = await c.query('SELECT count(*) FROM public.atlas_global_email_authority WHERE is_preexisting = false;');
  console.log('TOTAL:', qAll.rows[0].count);
  console.log('PREEXISTING (HISTORICAL):', qPre.rows[0].count);
  console.log('TRUE_NET_NEW (THIS MISSION):', qNetNew.rows[0].count);
  c.release();
  await pool.end();
}
check();
