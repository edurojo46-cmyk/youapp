import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function checkSearchable() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    const qCount = await client.query('SELECT count(*) FROM public.atlas_argentina_people_search_v1;');
    console.log('Total in atlas_argentina_people_search_v1:', qCount.rows[0].count);

    const qWithEmail = await client.query('SELECT count(*) FROM public.atlas_argentina_people_search_v1 WHERE public_email IS NOT NULL;');
    console.log('With public_email in search table:', qWithEmail.rows[0].count);

    const qLedgerSearchable = await client.query(`
      SELECT count(DISTINCT l.email_normalized)
      FROM public.atlas_500k_mission_ledger l
      INNER JOIN public.atlas_argentina_people_search_v1 s ON l.email_normalized = s.public_email;
    `);
    console.log('Ledger emails currently in search table:', qLedgerSearchable.rows[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}

checkSearchable().catch(console.error);
