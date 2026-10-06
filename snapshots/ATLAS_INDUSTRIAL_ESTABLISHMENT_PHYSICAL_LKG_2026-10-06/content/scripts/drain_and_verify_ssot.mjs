import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

// 1. Check in-flight active queries
const actRes = await client.query(`
  SELECT count(*) FROM pg_stat_activity 
  WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%' AND pid <> pg_backend_pid();
`);
console.log('ACTIVE_DB_QUERIES:', actRes.rows[0].count);

// 2. Check staging table
const stgRes = await client.query(`
  SELECT count(*) FROM atlas_ingest_v2_shadow.staging_incoming_records;
`);
console.log('RAW_STAGING_PENDING:', stgRes.rows[0].count);

// If staging has uncommitted leftover rows from the killed batch, clean staging
if (Number(stgRes.rows[0].count) > 0) {
  await client.query(`TRUNCATE atlas_ingest_v2_shadow.staging_incoming_records;`);
  console.log('STAGING_PENDING truncated to 0.');
}

const stgFinal = await client.query(`
  SELECT count(*) FROM atlas_ingest_v2_shadow.staging_incoming_records;
`);
console.log('FINAL_STAGING_PENDING:', stgFinal.rows[0].count);

// 3. Live SSOT metrics
const mRes = await client.query(`
  SELECT 
    caba_pba_qualified_unique_real_people,
    caba_qualified_unique_real_people,
    pba_qualified_unique_real_people,
    qualified_unique_real_people,
    unique_people,
    search_outbox_depth,
    last_verified_change_at,
    updated_at
  FROM public.atlas_people_live_metrics WHERE id = 'current';
`);
console.log('FINAL_LIVE_METRICS:', mRes.rows[0]);

await client.end();
