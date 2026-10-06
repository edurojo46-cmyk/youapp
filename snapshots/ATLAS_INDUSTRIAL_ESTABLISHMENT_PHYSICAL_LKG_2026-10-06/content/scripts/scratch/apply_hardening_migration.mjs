import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== APPLYING HARDENING MIGRATION: 20260922170000_harden_all_public_rls_and_rpcs.sql ===\n');

  // Read migration SQL
  const sql = fs.readFileSync('supabase/migrations/20260922170000_harden_all_public_rls_and_rpcs.sql', 'utf8');

  // 1. Audit BEFORE state
  const beforeRes = await c.query(`
    SELECT count(*) AS disabled_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;
  `);
  console.log(`BEFORE MIGRATION: ${beforeRes.rows[0].disabled_count} tables with RLS disabled.`);

  // 2. Execute migration inside transaction
  await c.query('BEGIN');
  try {
    await c.query(sql);
    await c.query('COMMIT');
    console.log('Migration committed successfully!');
  } catch (err) {
    await c.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    process.exit(1);
  }

  // 3. Audit AFTER state
  const afterRes = await c.query(`
    SELECT count(*) AS disabled_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;
  `);
  console.log(`AFTER MIGRATION: ${afterRes.rows[0].disabled_count} tables with RLS disabled.`);

  // 4. Verify any remaining tables without RLS
  const remainingRes = await c.query(`
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false;
  `);
  if (remainingRes.rows.length === 0) {
    console.log('\nSUCCESS: ZERO tables in public have RLS disabled! (UNINTENDED_PUBLIC_TABLE_WITH_RLS_DISABLED = 0)');
  } else {
    console.warn('\nRemaining tables with RLS disabled:', remainingRes.rows.map(r => r.table_name));
  }

  await c.end();
}

main().catch(console.error);
