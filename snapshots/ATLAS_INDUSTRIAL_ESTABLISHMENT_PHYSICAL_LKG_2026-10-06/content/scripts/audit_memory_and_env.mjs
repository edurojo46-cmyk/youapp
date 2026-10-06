import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function run() {
  console.log('=== SECTION 2: MEASURE ACTUAL HOST & DB MEMORY ===');

  // Version and environment
  const ver = await pool.query('SELECT version();');
  console.log('Postgres Version:', ver.rows[0].version);

  // Settings
  const settings = await pool.query(`
    SELECT name, setting, unit, context, vartype, boot_val, reset_val, pending_restart
    FROM pg_settings
    WHERE name IN (
      'shared_buffers',
      'effective_cache_size',
      'work_mem',
      'maintenance_work_mem',
      'max_connections',
      'wal_buffers',
      'checkpoint_completion_target',
      'max_wal_size',
      'min_wal_size',
      'random_page_cost',
      'seq_page_cost'
    )
    ORDER BY name;
  `);
  console.log('\n--- PG SETTINGS & RESTART REQUIREMENTS ---');
  console.table(settings.rows);

  // Connection stats
  const connStats = await pool.query(`
    SELECT 
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active_connections,
      count(*) FILTER (WHERE state = 'idle') as idle_connections,
      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_xact,
      count(*) FILTER (WHERE wait_event IS NOT NULL AND state = 'active') as waiting_connections
    FROM pg_stat_activity;
  `);
  console.log('\n--- CONNECTION METRICS ---');
  console.table(connStats.rows);

  // Active pooler / connection details
  const dbInfo = await pool.query(`
    SELECT 
      current_database() as database,
      current_user as user,
      inet_server_addr() as server_ip,
      inet_server_port() as server_port;
  `);
  console.log('\n--- SERVER INFO ---');
  console.table(dbInfo.rows);

  await pool.end();
}

run().catch(console.error);
