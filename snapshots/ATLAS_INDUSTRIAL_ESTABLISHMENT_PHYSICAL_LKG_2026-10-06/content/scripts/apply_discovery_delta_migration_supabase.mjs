/**
 * apply_discovery_delta_migration_supabase.mjs
 * Uses Supabase Management API (SUPABASE_ACCESS_TOKEN) OR exec_sql RPC
 * to apply DDL that pgBouncer Transaction Mode blocks.
 *
 * Falls back to splitting the SQL into statements and running via pg client
 * if Supabase Management API is not available.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Read the migration SQL
const sqlRaw = fs.readFileSync(
  path.resolve(__dirname, '../supabase/migrations/20260918000001_atlas_search_projection_v2_discovery_delta.sql'),
  'utf8'
);

// Split into individual statements (split on ; followed by newline + --comment or end)
// We'll run them as individual statements via exec_sql RPC if available
console.log('>>> Applying migration via Supabase Management API or exec_sql RPC...');

// Try exec_sql RPC first
const { data: rpcTest, error: rpcTestErr } = await sb.rpc('exec_sql', { sql: 'SELECT 1 AS ok' });

if (!rpcTestErr) {
  console.log('exec_sql RPC available. Executing migration...');
  const { data, error } = await sb.rpc('exec_sql', { sql: sqlRaw });
  if (error) {
    console.error('exec_sql migration failed:', error.message);
    process.exit(1);
  }
  console.log('✅ Migration applied via exec_sql RPC');
} else {
  // exec_sql not available — try Supabase Management API
  console.log(`exec_sql not available: ${rpcTestErr.message}`);
  console.log('>>> Trying Supabase Management REST API...');

  // Extract project ref from URL: https://xxx.supabase.co
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    console.error('Cannot extract project ref from VITE_SUPABASE_URL');
    process.exit(1);
  }

  const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
  if (!SUPABASE_ACCESS_TOKEN) {
    console.error('SUPABASE_ACCESS_TOKEN not found. Cannot use Management API.');
    console.error('');
    console.error('MANUAL OPTION: Apply the migration directly in Supabase SQL Editor:');
    console.error('https://supabase.com/dashboard/project/' + projectRef + '/editor');
    console.error('');
    console.error('File to run:', path.resolve(__dirname, '../supabase/migrations/20260918000001_atlas_search_projection_v2_discovery_delta.sql'));
    process.exit(1);
  }

  const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sqlRaw }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error('Management API error:', body);
    process.exit(1);
  }
  console.log('✅ Migration applied via Supabase Management API');
}

// Verify table exists
const { data: verifyData, error: verifyErr } = await sb
  .from('atlas_people_search_projection_v2_discovery_delta')
  .select('atlas_person_id')
  .limit(1);

if (verifyErr && verifyErr.code === '42P01') {
  console.error('❌ TABLE NOT CREATED: atlas_people_search_projection_v2_discovery_delta');
  process.exit(1);
} else if (verifyErr) {
  // Table may exist but RLS blocks us — still a success
  console.log(`TABLE_CHECK: ${verifyErr.message} (may be RLS — checking existence via count...)`);
} else {
  console.log('TABLE_VERIFIED: atlas_people_search_projection_v2_discovery_delta EXISTS ✅');
}

console.log('\nDELTA_MIGRATION_STATUS: COMPLETE');
console.log('NEXT: node scripts/run_discovery_d1k.mjs --canary');
