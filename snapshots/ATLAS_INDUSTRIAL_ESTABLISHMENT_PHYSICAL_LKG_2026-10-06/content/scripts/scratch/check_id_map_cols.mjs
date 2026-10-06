import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'atlas_person_identity_map';
    `);
    console.table(res.rows);

    const maxObs = await client.query(`SELECT max(observed_at) as max_obs FROM public.atlas_person_identity_map;`);
    console.log('Max observed_at watermark:', maxObs.rows[0].max_obs);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
