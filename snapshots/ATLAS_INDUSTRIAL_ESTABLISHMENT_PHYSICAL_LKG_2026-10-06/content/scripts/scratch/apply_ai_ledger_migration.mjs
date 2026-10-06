import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== APPLYING MIGRATION: 20260922180000_create_atlas_ai_usage_events.sql ===\n');
  const sql = fs.readFileSync('supabase/migrations/20260922180000_create_atlas_ai_usage_events.sql', 'utf8');

  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('Migration committed successfully!');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Migration failed:', e);
    process.exit(1);
  }

  // Verify RLS status on atlas_ai_usage_events
  const res = await c.query(`
    SELECT relname, relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'atlas_ai_usage_events';
  `);
  console.log('Table RLS status:', res.rows[0]);

  await c.end();
}

main().catch(console.error);
