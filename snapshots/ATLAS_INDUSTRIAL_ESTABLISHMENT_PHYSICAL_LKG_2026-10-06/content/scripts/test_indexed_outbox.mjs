import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function run() {
  const pool = new pg.Pool(parseDbUrl());

  console.log('--- EXACT INDEXED COUNTS ---');

  const t0 = Date.now();
  const qPending = await pool.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PENDING' AND next_retry_at IS NOT NULL");
  console.log('Pending count:', qPending.rows[0].count, 'in', Date.now() - t0, 'ms');

  const t1 = Date.now();
  const qRetry = await pool.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'RETRY' AND next_retry_at IS NOT NULL");
  console.log('Retry count:', qRetry.rows[0].count, 'in', Date.now() - t1, 'ms');

  const t2 = Date.now();
  const qQuar = await pool.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'QUARANTINED' AND next_retry_at IS NOT NULL");
  console.log('Quarantined count:', qQuar.rows[0].count, 'in', Date.now() - t2, 'ms');

  const t3 = Date.now();
  const qProc = await pool.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING' AND processing_started_at IS NOT NULL");
  console.log('Processing count:', qProc.rows[0].count, 'in', Date.now() - t3, 'ms');

  const t4 = Date.now();
  const qStat = await pool.query("SELECT n_live_tup, last_autovacuum FROM pg_stat_user_tables WHERE relname = 'atlas_search_outbox'");
  const totalLive = Number(qStat.rows[0].n_live_tup);
  console.log('Total live outbox rows:', totalLive, 'in', Date.now() - t4, 'ms');

  const pending = Number(qPending.rows[0].count);
  const retry = Number(qRetry.rows[0].count);
  const quar = Number(qQuar.rows[0].count);
  const proc = Number(qProc.rows[0].count);
  const published = totalLive - (pending + retry + quar + proc);

  console.log('Computed PUBLISHED rows:', published);

  // Discovery Candidates schema & live estimate
  const qDisc = await pool.query("SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'atlas_people_discovery_candidates'");
  console.log('Discovery Candidates Total Rows:', qDisc.rows[0].n_live_tup);

  const qDiscCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'atlas_people_discovery_candidates'");
  console.log('Discovery Columns:', qDiscCols.rows.map(r => r.column_name).join(', '));

  await pool.end();
}

run().catch(console.error);
