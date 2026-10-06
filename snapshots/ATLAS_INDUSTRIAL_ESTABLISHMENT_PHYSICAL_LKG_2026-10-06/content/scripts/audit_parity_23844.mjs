import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function auditParity() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // 1. Check how many of the 12256 + 11588 rows exist in atlas_public_email_contacts_1m
    const res = await client.query(`
      SELECT 
        count(DISTINCT a.email_normalized) as auth_count,
        count(DISTINCT c.email_normalized) as contact_count,
        count(DISTINCT CASE WHEN c.mission_qualification_status = 'MISSION_QUALIFIED' OR c.mission_qualification_status = 'QUALIFIED_ACTIVE' THEN c.email_normalized END) as qualified_count
      FROM public.atlas_global_email_authority a
      LEFT JOIN public.atlas_public_email_contacts_1m c ON a.email_normalized = c.email_normalized
      WHERE a.is_preexisting = false 
        AND a.first_seen_at >= '2026-09-28T01:00:00Z';
    `);

    console.log('Parity for 23,844 rows:');
    console.table(res.rows);

    // Also check searchable in search outbox / index
    const outboxRes = await client.query(`
      SELECT count(DISTINCT email_normalized) 
      FROM public.atlas_search_outbox_v2
      WHERE email_normalized IN (
        SELECT email_normalized FROM public.atlas_global_email_authority 
        WHERE is_preexisting = false AND first_seen_at >= '2026-09-28T01:00:00Z'
      );
    `);
    console.log('Indexed in search outbox v2:', outboxRes.rows[0].count);

  } finally {
    client.release();
    await pool.end();
  }
}

auditParity().catch(console.error);
