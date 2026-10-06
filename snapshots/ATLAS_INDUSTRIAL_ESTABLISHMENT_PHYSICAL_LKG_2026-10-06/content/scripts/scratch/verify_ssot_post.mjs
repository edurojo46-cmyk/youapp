import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const cRes = await client.query('SELECT COUNT(DISTINCT atlas_person_id) as c FROM public.atlas_person_identity_map');
    const mRes = await client.query('SELECT COUNT(*) as c FROM public.atlas_person_identity_map');
    const oRes = await client.query(`
      SELECT 
        COUNT(*) as total, 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending, 
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing 
      FROM public.atlas_search_outbox
    `);

    console.log('Certified SSOT Post-Benchmark Counts:');
    console.log({
      canonical_distinct: Number(cRes.rows[0].c),
      identity_map_rows: Number(mRes.rows[0].c),
      search_outbox_total: Number(oRes.rows[0].total),
      pending: Number(oRes.rows[0].pending),
      processing: Number(oRes.rows[0].processing)
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
