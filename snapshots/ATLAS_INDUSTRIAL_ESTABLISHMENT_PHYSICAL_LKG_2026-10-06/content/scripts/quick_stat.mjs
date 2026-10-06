import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool(parseDbUrl());

async function run() {
  const act = await pool.query("SELECT pid, state, wait_event_type, wait_event, age(clock_timestamp(), query_start) as duration, query FROM pg_stat_activity WHERE state != 'idle' AND pid != pg_backend_pid()");
  console.log('Active queries count:', act.rows.length);
  for (const r of act.rows) {
    console.log(r.pid, r.duration, r.wait_event_type, r.wait_event, r.query?.replace(/\s+/g, ' ').slice(0, 80));
  }

  const stat = await pool.query("SELECT relname, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum FROM pg_stat_user_tables WHERE relname = 'staging_incoming_records'");
  console.log('staging_incoming_records stats:', stat.rows[0]);

  const ssot = await pool.query("SELECT caba_pba_qualified_unique_real_people, caba_qualified_unique_real_people, pba_qualified_unique_real_people, qualified_unique_real_people FROM public.atlas_people_live_metrics WHERE id = 'current'");
  console.log('SSOT:', ssot.rows[0]);

  await pool.end();
}

run().catch(console.error);
