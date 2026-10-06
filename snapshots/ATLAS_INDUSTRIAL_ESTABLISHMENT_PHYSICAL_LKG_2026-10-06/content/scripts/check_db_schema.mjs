import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function check() {
  const c = await pool.connect();
  const qTables = await c.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema IN ('public', 'atlas_shadow', 'atlas_authority')
    ORDER BY table_schema, table_name;
  `);
  console.log('Tables in current DB:');
  console.table(qTables.rows);

  // Also check atlas_shadow_cold_gate
  const shadowPool = new pg.Pool({ ...parseDbUrl(), database: 'atlas_shadow_cold_gate', max: 2 });
  const sc = await shadowPool.connect();
  const qShadowTables = await sc.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema IN ('public', 'atlas_shadow', 'atlas_authority')
    ORDER BY table_schema, table_name;
  `);
  console.log('Tables in atlas_shadow_cold_gate DB:');
  console.table(qShadowTables.rows);

  const qLedgerCount = await sc.query(`SELECT count(*) FROM atlas_authority.global_t0_identity_ledger;`);
  console.log('atlas_authority.global_t0_identity_ledger count:', qLedgerCount.rows[0].count);

  sc.release();
  await shadowPool.end();

  c.release();
  await pool.end();
}

check().catch(console.error);
