import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function audit() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    console.log('=== AUDITING atlas_global_email_authority ===');
    const authTotal = await client.query('SELECT count(*) FROM public.atlas_global_email_authority;');
    console.log('Total authority rows:', authTotal.rows[0].count);

    const authByGen = await client.query('SELECT authority_generation, is_preexisting, count(*) FROM public.atlas_global_email_authority GROUP BY authority_generation, is_preexisting;');
    console.log('Authority by generation & is_preexisting:', authByGen.rows);

    const authOrigins = await client.query('SELECT source_origin, count(*) FROM public.atlas_global_email_authority WHERE is_preexisting = false GROUP BY source_origin ORDER BY count(*) DESC LIMIT 20;');
    console.log('Non-preexisting by source_origin (top 20):', authOrigins.rows);

    const contactTotals = await client.query('SELECT count(*) FROM public.atlas_public_email_contacts_1m;');
    console.log('Total contacts in 1m:', contactTotals.rows[0].count);

    const contactOrigins = await client.query('SELECT source_family, count(*) FROM public.atlas_public_email_contacts_1m GROUP BY source_family ORDER BY count(*) DESC LIMIT 20;');
    console.log('Contacts by source_family (top 20):', contactOrigins.rows);

    const contactTimes = await client.query('SELECT min(discovered_at), max(discovered_at), min(verified_at), max(verified_at) FROM public.atlas_public_email_contacts_1m;');
    console.log('Contact timestamps range:', contactTimes.rows[0]);

    // Check timestamps in authority
    const authTimes = await client.query('SELECT min(first_seen_at), max(first_seen_at) FROM public.atlas_global_email_authority WHERE is_preexisting = false;');
    console.log('Authority first_seen_at range for is_preexisting = false:', authTimes.rows[0]);

    // Group authority by time buckets or distinct origins
    const authTimeBuckets = await client.query(`
      SELECT date_trunc('minute', first_seen_at) as minute_bucket, source_origin, count(*)
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false
      GROUP BY minute_bucket, source_origin
      ORDER BY minute_bucket ASC;
    `);
    console.log('Authority time buckets count:', authTimeBuckets.rows.length);
    console.log('Sample time buckets:', authTimeBuckets.rows.slice(0, 15));
    if (authTimeBuckets.rows.length > 15) {
      console.log('Last time buckets:', authTimeBuckets.rows.slice(-10));
    }

  } finally {
    client.release();
    await pool.end();
  }
}

audit().catch(console.error);
