import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool(parseDbUrl());

async function inspect() {
  const ssot = await pool.query("SELECT * FROM public.atlas_people_live_metrics WHERE id = 'current'");
  const count = await pool.query('SELECT count(*) FROM atlas_ingest_v2_shadow.staging_incoming_records');
  console.log('Staging row count:', count.rows[0]);
  const indexes = await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'atlas_ingest_v2_shadow' AND tablename = 'staging_incoming_records'");
  console.log('Staging Indexes:', indexes.rows);

  const act = await pool.query("SELECT pid, state, wait_event_type, wait_event, query FROM pg_stat_activity WHERE state != 'idle' AND pid != pg_backend_pid()");
  const fn = await pool.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'commit_staged_batch_v2'");
  console.log('FUNCTION DEF:\n', fn.rows[0]?.pg_get_functiondef);

  const locks = await pool.query(`
    SELECT blocked_locks.pid     AS blocked_pid,
           blocked_activity.query AS blocked_statement,
           blocking_locks.pid    AS blocking_pid,
           blocking_activity.query AS current_statement_in_blocking_process
    FROM  pg_catalog.pg_locks         blocked_locks
    JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
    JOIN pg_catalog.pg_locks         blocking_locks 
        ON blocking_locks.locktype = blocked_locks.locktype
        AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
        AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
        AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
        AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
        AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
        AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
        AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
        AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
        AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
        AND blocking_locks.pid != blocked_locks.pid
    JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
    WHERE NOT blocked_locks.granted;
  `);
  console.log('Blocked locks count:', locks.rows.length);
  for (const l of locks.rows) {
    console.log(`Blocked PID ${l.blocked_pid} by PID ${l.blocking_pid}`);
  }

  await pool.end();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
