import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== 1. AUDITING PUBLIC SCHEMA TABLES FOR RLS AND PRIVILEGES ===\n');

  // Query all tables in public schema with their RLS status
  const tablesQuery = `
    SELECT 
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
      AND c.relkind = 'r'
    ORDER BY c.relname;
  `;
  const tablesRes = await client.query(tablesQuery);

  // Query table privileges for anon, authenticated, and service_role
  const privsQuery = `
    SELECT 
      table_name,
      grantee,
      privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated', 'service_role')
    ORDER BY table_name, grantee, privilege_type;
  `;
  const privsRes = await client.query(privsQuery);

  // Query existing policies
  const policiesQuery = `
    SELECT 
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `;
  const policiesRes = await client.query(policiesQuery);

  // Map privileges
  const privMap = {};
  for (const row of privsRes.rows) {
    if (!privMap[row.table_name]) privMap[row.table_name] = {};
    if (!privMap[row.table_name][row.grantee]) privMap[row.table_name][row.grantee] = [];
    privMap[row.table_name][row.grantee].push(row.privilege_type);
  }

  // Map policies
  const polMap = {};
  for (const row of policiesRes.rows) {
    if (!polMap[row.tablename]) polMap[row.tablename] = [];
    polMap[row.tablename].push({
      policyname: row.policyname,
      cmd: row.cmd,
      roles: row.roles
    });
  }

  const inventory = [];
  const rlsDisabled = [];
  const anonReadable = [];
  const anonWritable = [];
  const authWritable = [];

  for (const t of tablesRes.rows) {
    const tName = t.table_name;
    const tPrivs = privMap[tName] || {};
    const tPols = polMap[tName] || [];

    const anonPrivs = tPrivs['anon'] || [];
    const authPrivs = tPrivs['authenticated'] || [];
    const servPrivs = tPrivs['service_role'] || [];

    const item = {
      table_name: tName,
      rls_enabled: t.rls_enabled,
      rls_forced: t.rls_forced,
      anon_select: anonPrivs.includes('SELECT'),
      anon_insert: anonPrivs.includes('INSERT'),
      anon_update: anonPrivs.includes('UPDATE'),
      anon_delete: anonPrivs.includes('DELETE'),
      auth_select: authPrivs.includes('SELECT'),
      auth_insert: authPrivs.includes('INSERT'),
      auth_update: authPrivs.includes('UPDATE'),
      auth_delete: authPrivs.includes('DELETE'),
      service_role_access: servPrivs.length > 0 ? servPrivs.join(', ') : 'ALL/DEFAULT',
      policies_count: tPols.length,
      policies: tPols.map(p => `${p.policyname} (${p.cmd})`).join('; ')
    };

    inventory.push(item);

    if (!t.rls_enabled) {
      rlsDisabled.push(tName);
      if (item.anon_select) anonReadable.push(tName);
      if (item.anon_insert || item.anon_update || item.anon_delete) anonWritable.push(tName);
      if (item.auth_insert || item.auth_update || item.auth_delete) authWritable.push(tName);
    }
  }

  console.log(`TOTAL PUBLIC TABLES AUDITED: ${inventory.length}`);
  console.log(`RLS DISABLED TABLES (${rlsDisabled.length}):`, rlsDisabled);
  console.log(`ANON READABLE TABLES (${anonReadable.length}):`, anonReadable);
  console.log(`ANON WRITABLE TABLES (${anonWritable.length}):`, anonWritable);
  console.log(`AUTHENTICATED WRITABLE TABLES (${authWritable.length}):`, authWritable);

  console.log('\n--- DETAILED INVENTORY ---');
  console.table(inventory.map(i => ({
    table: i.table_name,
    rls: i.rls_enabled,
    anon_r: i.anon_select,
    anon_w: (i.anon_insert || i.anon_update || i.anon_delete),
    auth_w: (i.auth_insert || i.auth_update || i.auth_delete),
    policies: i.policies_count
  })));

  await client.end();
}

main().catch(console.error);
