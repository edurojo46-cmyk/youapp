import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

const dbConfig = parseDbUrl();

async function check() {
  const pProd = new pg.Pool({ ...dbConfig, max: 1 });
  const cProd = await pProd.connect();
  const rProd = await cProd.query("SELECT * FROM public.atlas_people_live_metrics WHERE id = 'current'");
  console.log('Production CABA/PBA:', rProd.rows[0]?.caba_pba_qualified_unique_real_people);
  cProd.release();
  await pProd.end();

  const pShadow = new pg.Pool({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false },
    max: 1
  });
  const cShadow = await pShadow.connect();
  await cShadow.query('SET statement_timeout = 60000;');
  console.log('Truncating shadow tables...');
  await cShadow.query('TRUNCATE atlas_shadow.atlas_canonical_persons_v2 CASCADE;');
  await cShadow.query('TRUNCATE atlas_shadow.atlas_argentina_people_search_v1 CASCADE;');
  await cShadow.query('TRUNCATE atlas_shadow.staging_incoming_records CASCADE;');
  
  const rCan = await cShadow.query('SELECT count(*) FROM atlas_shadow.atlas_canonical_persons_v2');
  const rSearch = await cShadow.query('SELECT count(*) FROM atlas_shadow.atlas_argentina_people_search_v1');
  const rStaging = await cShadow.query('SELECT count(*) FROM atlas_shadow.staging_incoming_records');
  console.log('Shadow Persons:', rCan.rows[0].count, 'Search:', rSearch.rows[0].count, 'Staging:', rStaging.rows[0].count);
  cShadow.release();
  await pShadow.end();
}
check().catch(console.error);
