import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function check() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();
  try {
    const idxs = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'atlas_person_observations';
    `);
    console.log('Indexes:', JSON.stringify(idxs.rows, null, 2));

    const trigs = await client.query(`
      SELECT tgname, pg_get_triggerdef(oid)
      FROM pg_trigger
      WHERE tgrelid = 'public.atlas_person_observations'::regclass;
    `);
    console.log('Triggers:', JSON.stringify(trigs.rows, null, 2));

    const count = await client.query('SELECT count(*) FROM public.atlas_person_observations');
    console.log('Total rows in atlas_person_observations:', count.rows[0].count);
  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
