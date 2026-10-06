import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const shadowCfg = { ...parseDbUrl(), database: 'atlas_shadow_cold_gate' };
  const prodCfg = parseDbUrl();

  const pShadow = new pg.Pool(shadowCfg);
  const pProd = new pg.Pool(prodCfg);

  const c1 = await pShadow.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='atlas_shadow' AND table_name='atlas_person_identity_map';");
  const c2 = await pShadow.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='atlas_shadow' AND table_name='atlas_argentina_people_search_v1';");
  console.log('ID MAP COLS:', c1.rows.map(r => r.column_name));
  console.log('SEARCH COLS:', c2.rows.map(r => r.column_name));

  await pShadow.end();
  await pProd.end();
}

main().catch(console.error);
