import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

async function verify() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    const qLedger = await client.query("SELECT count(*) FROM public.atlas_500k_mission_ledger;");
    const qAuth = await client.query("SELECT count(*) FROM public.atlas_global_email_authority WHERE authority_generation = 'AUTONOMOUS_500K_RUN';");
    const qContacts = await client.query(`
      SELECT count(*) FROM public.atlas_public_email_contacts_1m c
      INNER JOIN public.atlas_500k_mission_ledger l ON c.email_normalized = l.email_normalized;
    `);
    const qSearch = await client.query(`
      SELECT count(*) FROM public.atlas_argentina_people_search_v1 s
      INNER JOIN public.atlas_500k_mission_ledger l ON s.public_email = l.email_normalized;
    `);

    console.log('=== INDEPENDENT SSOT VERIFICATION ===');
    console.log('Canonical Mission Ledger Count:', qLedger.rows[0].count);
    console.log('Authority Count (AUTONOMOUS_500K_RUN):', qAuth.rows[0].count);
    console.log('Contacts Count (Matching Ledger):', qContacts.rows[0].count);
    console.log('Searchable Count (Matching Ledger):', qSearch.rows[0].count);
  } finally {
    client.release();
    await pool.end();
  }
}

verify().catch(console.error);
