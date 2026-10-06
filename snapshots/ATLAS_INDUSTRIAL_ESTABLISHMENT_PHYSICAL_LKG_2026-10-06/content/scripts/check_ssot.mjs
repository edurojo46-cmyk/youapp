import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT * FROM public.atlas_people_live_metrics WHERE id = 'current'");
    console.log('SSOT:', res.rows[0]);
    const locks = await client.query("SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND pid != pg_backend_pid()");
    console.log('Active queries:', locks.rows[0]);
    const staging = await client.query("SELECT count(*) FROM atlas_ingest_v2_shadow.staging_incoming_records");
    console.log('Staging rows:', staging.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}
check().catch(console.error);
