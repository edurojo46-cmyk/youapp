import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  console.log('--- Inspecting PostgreSQL wait telemetry ---');
  try {
    const resDb = await pool.query(`
      SELECT datname, blk_read_time, blk_write_time, session_time, active_time, idle_in_transaction_time
      FROM pg_stat_database
      WHERE datname = current_database();
    `);
    console.log('pg_stat_database:', resDb.rows[0]);
  } catch (e) {
    console.log('pg_stat_database err:', e.message);
  }

  try {
    const resWait = await pool.query(`
      SELECT wait_event_type, wait_event, count(*)
      FROM pg_stat_activity
      GROUP BY wait_event_type, wait_event;
    `);
    console.log('pg_stat_activity wait events current sample:');
    for (const r of resWait.rows) {
      console.log(`- ${r.wait_event_type || 'CPU'}:${r.wait_event || 'none'} count=${r.count}`);
    }
  } catch (e) {
    console.log('wait err:', e.message);
  }

  await pool.end();
}

run();
