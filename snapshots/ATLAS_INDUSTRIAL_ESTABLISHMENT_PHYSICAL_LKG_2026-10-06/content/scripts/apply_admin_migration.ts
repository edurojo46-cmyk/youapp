import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import * as fs from 'fs';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, key);

async function applyMigration() {
  const sql = fs.readFileSync('./supabase/migrations/20260908043000_atlas_admin_global_search_v1.sql', 'utf8');
  
  // Split on semicolons-after-$$ to find individual statements
  // The file has one big CREATE OR REPLACE FUNCTION, then REVOKE/GRANT
  // We'll use rpc approach: call a helper function that runs DDL
  
  // Instead, use the Supabase DB connection directly via the
  // service_role which has superuser access over REST
  // Try the built-in /pg endpoint:
  const resp = await fetch(`${url}/pg`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'text/plain',
    },
    body: sql
  });
  const text = await resp.text();
  console.log('/pg status:', resp.status, text.substring(0, 300));

  // Also verify if the function already exists by calling it
  console.log('\nVerifying function exists...');
  const adminClient = createClient(url, key);
  
  // Sign in as admin
  const { data: authData } = await adminClient.auth.signInWithPassword({
    email: 'admin@youapp.com',
    password: 'AdminPassword123!'
  });
  console.log('Admin role:', authData.user?.app_metadata?.role);
  
  const { data, error } = await adminClient.rpc('search_admin_all_persons_v1', {
    p_page: 1,
    p_page_size: 25
  });
  if (error) {
    console.log('RPC error (may not exist yet):', error.message);
  } else {
    console.log('RPC SUCCESS! Total count:', data?.total_count, 'Items:', data?.items?.length);
  }
}

applyMigration().catch(console.error);
