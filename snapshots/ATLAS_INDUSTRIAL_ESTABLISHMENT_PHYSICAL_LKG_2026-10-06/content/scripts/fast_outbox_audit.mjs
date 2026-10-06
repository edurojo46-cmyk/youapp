import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function run() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== FAST OUTBOX & DISCOVERY AUDIT ===');
  
  // 1. Ready queue count (uses partial index idx_atlas_search_outbox_ready_queue)
  const readyRes = await client.query(`
    SELECT status, count(*) AS count 
    FROM public.atlas_search_outbox 
    WHERE status IN ('PENDING', 'RETRY')
    GROUP BY status
  `);
  console.log('Ready counts (Indexed):', readyRes.rows);

  // 2. Quarantined count
  const quarRes = await client.query(`
    SELECT count(*) AS count 
    FROM public.atlas_search_outbox 
    WHERE status = 'QUARANTINED'
  `);
  console.log('Quarantined count:', quarRes.rows[0].count);

  // 3. Processing count
  const procRes = await client.query(`
    SELECT count(*) AS count 
    FROM public.atlas_search_outbox 
    WHERE status = 'PROCESSING'
  `);
  console.log('Processing count:', procRes.rows[0].count);

  // 4. Total Outbox rows from pg_stat_user_tables or reltuples
  const totalRes = await client.query(`
    SELECT n_live_tup AS estimate
    FROM pg_stat_user_tables
    WHERE relname = 'atlas_search_outbox'
  `);
  const totalEstimate = Number(totalRes.rows[0].estimate);
  console.log('Total live estimate:', totalEstimate);

  const pending = Number(readyRes.rows.find(r => r.status === 'PENDING')?.count || 0);
  const retry = Number(readyRes.rows.find(r => r.status === 'RETRY')?.count || 0);
  const quarantined = Number(quarRes.rows[0].count);
  const processing = Number(procRes.rows[0].count);
  const publishedEstimate = totalEstimate - (pending + retry + quarantined + processing);

  console.log('Derived PUBLISHED rows:', publishedEstimate);

  // 5. Discovery candidates breakdown
  const discTotalRes = await client.query(`
    SELECT n_live_tup AS estimate
    FROM pg_stat_user_tables
    WHERE relname = 'atlas_people_discovery_candidates'
  `);
  console.log('Discovery Candidates live estimate:', discTotalRes.rows[0].estimate);

  // Sample discovery candidates columns and status
  const discCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_people_discovery_candidates'
  `);
  console.log('Discovery Candidate columns:', discCols.rows.map(r => r.column_name));

  await client.end();
}

run().catch(console.error);
