import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

async function resetTestEcoRows() {
  const pool = new pg.Pool(parseDbUrl());
  
  const before = await pool.query('SELECT COUNT(*) FROM public.atlas_public_email_contacts_1m;');
  console.log('Total rows before reset:', before.rows[0].count);

  const delRes = await pool.query("DELETE FROM public.atlas_public_email_contacts_1m WHERE source_id LIKE 'ECO_%';");
  console.log('Deleted test ECO_ rows:', delRes.rowCount);

  const after = await pool.query('SELECT COUNT(*) FROM public.atlas_public_email_contacts_1m;');
  console.log('Total rows after reset:', after.rows[0].count);

  await pool.end();
}

resetTestEcoRows().catch(console.error);
