import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function diagnose() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    const ssotRes = await client.query("SELECT * FROM public.atlas_people_live_metrics WHERE id = 'current'");
    const ssot = ssotRes.rows[0];

    const cabaPbaUnion = Number(ssot.caba_pba_qualified_unique_real_people || 0);
    const caba = Number(ssot.caba_qualified_unique_real_people || 0);
    const pba = Number(ssot.pba_qualified_unique_real_people || 0);
    const both = (caba + pba) - cabaPbaUnion;

    console.log('=== SSOT DIRECT ===');
    console.log('SSOT_DENOMINATOR:', cabaPbaUnion);
    console.log('SSOT_UPDATED_AT:', ssot.updated_at);
    console.log('SSOT_LAST_CHANGE_AT:', ssot.last_verified_change_at);
    console.log('CABA_COUNT:', caba);
    console.log('PBA_COUNT:', pba);
    console.log('BOTH_CABA_PBA:', both);

    // List outbox tables
    const tablesRes = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%outbox%' OR table_name LIKE '%canonical%'
    `);
    console.log('\n=== TABLES FOUND ===');
    console.table(tablesRes.rows);

    // Check active queries
    const activeRes = await client.query(`
      SELECT pid, query, state, query_start, now() - query_start as duration 
      FROM pg_stat_activity 
      WHERE state = 'active' AND pid != pg_backend_pid()
    `);
    console.log('\n=== ACTIVE DB QUERIES ===');
    console.log(activeRes.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

diagnose().catch(console.error);
