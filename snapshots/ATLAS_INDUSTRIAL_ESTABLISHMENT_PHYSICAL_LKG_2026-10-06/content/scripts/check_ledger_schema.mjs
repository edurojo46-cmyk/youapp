import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function check() {
  const shadowPool = new pg.Pool({ ...parseDbUrl(), database: 'atlas_shadow_cold_gate', max: 2 });
  const sc = await shadowPool.connect();
  const qCols = await sc.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'atlas_authority' AND table_name = 'global_t0_identity_ledger';
  `);
  console.log('Columns of global_t0_identity_ledger:');
  console.log(qCols.rows.map(r => `${r.column_name} (${r.data_type})`));
  const qSample = await sc.query('SELECT * FROM atlas_authority.global_t0_identity_ledger LIMIT 2');
  console.log('Sample rows:');
  console.log(qSample.rows);
  sc.release();
  await shadowPool.end();
}

check().catch(console.error);
