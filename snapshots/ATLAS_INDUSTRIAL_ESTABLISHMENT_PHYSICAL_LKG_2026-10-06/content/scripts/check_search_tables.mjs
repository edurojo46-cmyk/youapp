import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function checkSearchTables() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%search%';
    `);
    console.log('Search tables:', res.rows.map(r => r.table_name));

    for (const t of res.rows) {
      const cols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [t.table_name]);
      console.log(`Columns of ${t.table_name}:`, cols.rows.map(c => c.column_name).join(', '));
    }

    // Also check which 8 emails are in authority but not in atlas_public_email_contacts_1m
    const missingInContacts = await client.query(`
      SELECT a.email_normalized, a.source_origin, a.first_seen_at
      FROM public.atlas_global_email_authority a
      LEFT JOIN public.atlas_public_email_contacts_1m c ON a.email_normalized = c.email_normalized
      WHERE a.is_preexisting = false AND a.first_seen_at >= '2026-09-28T01:00:00Z' AND c.email_normalized IS NULL;
    `);
    console.log('8 missing in contacts:', missingInContacts.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

checkSearchTables().catch(console.error);
