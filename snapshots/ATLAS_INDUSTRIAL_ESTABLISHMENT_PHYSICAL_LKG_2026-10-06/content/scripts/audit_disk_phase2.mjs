import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function run() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== 1. SUPABASE CAPACITY & STATS RESET AUDIT ===');
  
  // Check stats_reset
  const statsReset = await client.query(`
    SELECT datname, stats_reset 
    FROM pg_stat_database 
    WHERE datname = current_database();
  `);
  console.log('Postgres stats_reset:', statsReset.rows[0]);

  // Check system disk info if available
  try {
    const diskSettings = await client.query(`
      SELECT name, setting, unit, short_desc 
      FROM pg_settings 
      WHERE name IN ('temp_file_limit', 'max_wal_size', 'min_wal_size', 'shared_buffers', 'work_mem');
    `);
    console.table(diskSettings.rows);
  } catch (e) {}

  // Check Supabase project reference
  const dbUrl = process.env.DATABASE_URL || '';
  const match = dbUrl.match(/aws-0-[a-z0-9-]+|postgres\.([a-z0-9]+)/);
  console.log('Database Host Pattern:', match ? match[0] : 'unknown');

  await client.end();
}

run().catch(console.error);
