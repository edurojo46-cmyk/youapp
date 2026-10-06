import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function check() {
  const c = await pool.connect();
  const qSearch = await c.query('SELECT count(*) FROM public.atlas_argentina_people_search_v1;');
  console.log('Search index count:', qSearch.rows[0].count);

  const shadowPool = new pg.Pool({ ...parseDbUrl(), database: 'atlas_shadow_cold_gate', max: 2 });
  const sc = await shadowPool.connect();
  const qKeys = await sc.query('SELECT count(*) FROM atlas_shadow.atlas_identity_keys_v2;');
  console.log('atlas_identity_keys_v2 count in shadow:', qKeys.rows[0].count);

  const qLedger = await sc.query('SELECT count(*) FROM atlas_authority.global_t0_identity_ledger;');
  console.log('global_t0_identity_ledger count in shadow:', qLedger.rows[0].count);

  sc.release();
  await shadowPool.end();

  c.release();
  await pool.end();
}

check().catch(console.error);
