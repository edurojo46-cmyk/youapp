import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

async function check() {
  const pool = new pg.Pool(parseDbUrl());
  
  // 1. Total ECO_ sources in 1m table
  const ecoRes = await pool.query("SELECT source_id, COUNT(*) FROM public.atlas_public_email_contacts_1m WHERE source_id LIKE 'ECO_%' GROUP BY source_id ORDER BY count DESC;");
  console.log('ECO_ sources currently in 1m table:', ecoRes.rows);

  const ecoTotal = await pool.query("SELECT COUNT(*) FROM public.atlas_public_email_contacts_1m WHERE source_id LIKE 'ECO_%';");
  console.log('Total ECO_ rows in 1m table:', ecoTotal.rows[0].count);

  // 2. Exactas UBA breakdown
  const exactasTotal = await pool.query("SELECT source_id, COUNT(*) FROM public.atlas_public_email_contacts_1m WHERE email_normalized LIKE '%exactas.uba.ar' GROUP BY source_id;");
  console.log('Exactas UBA emails by source_id:', exactasTotal.rows);

  // 3. Check what was in report JSON
  await pool.end();
}

check().catch(console.error);
