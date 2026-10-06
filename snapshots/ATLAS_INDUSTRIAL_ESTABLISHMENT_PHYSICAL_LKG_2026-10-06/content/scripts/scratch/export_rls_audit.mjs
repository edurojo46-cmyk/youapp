import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const rlsRes = await c.query(`
    SELECT 
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      c.relforcerowsecurity AS rls_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);

  const privsRes = await c.query(`
    SELECT table_name, grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated', 'service_role');
  `);

  const polsRes = await c.query(`
    SELECT schemaname, tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname = 'public';
  `);

  const privMap = {};
  for (const r of privsRes.rows) {
    if (!privMap[r.table_name]) privMap[r.table_name] = {};
    if (!privMap[r.table_name][r.grantee]) privMap[r.table_name][r.grantee] = [];
    privMap[r.table_name][r.grantee].push(r.privilege_type);
  }

  const polMap = {};
  for (const r of polsRes.rows) {
    if (!polMap[r.tablename]) polMap[r.tablename] = [];
    polMap[r.tablename].push(r);
  }

  const rlsDisabled = [];
  const anonReadableNoRls = [];
  const anonWritableNoRls = [];
  const authWritableNoRls = [];
  const fullInventory = [];

  for (const row of rlsRes.rows) {
    const t = row.table_name;
    const privs = privMap[t] || {};
    const pols = polMap[t] || [];

    const anon = privs['anon'] || [];
    const auth = privs['authenticated'] || [];
    const serv = privs['service_role'] || [];

    const item = {
      table_name: t,
      rls_enabled: row.rls_enabled,
      rls_forced: row.rls_forced,
      anon_select: anon.includes('SELECT'),
      anon_insert: anon.includes('INSERT'),
      anon_update: anon.includes('UPDATE'),
      anon_delete: anon.includes('DELETE'),
      auth_select: auth.includes('SELECT'),
      auth_insert: auth.includes('INSERT'),
      auth_update: auth.includes('UPDATE'),
      auth_delete: auth.includes('DELETE'),
      service_role_access: serv,
      policies: pols
    };
    fullInventory.push(item);

    if (!row.rls_enabled) {
      rlsDisabled.push(t);
      if (anon.includes('SELECT')) anonReadableNoRls.push(t);
      if (anon.some(p => ['INSERT', 'UPDATE', 'DELETE'].includes(p))) anonWritableNoRls.push(t);
      if (auth.some(p => ['INSERT', 'UPDATE', 'DELETE'].includes(p))) authWritableNoRls.push(t);
    }
  }

  const report = {
    total_public_tables: rlsRes.rows.length,
    rls_disabled_count: rlsDisabled.length,
    rls_disabled_tables: rlsDisabled,
    anon_readable_no_rls: anonReadableNoRls,
    anon_writable_no_rls: anonWritableNoRls,
    auth_writable_no_rls: authWritableNoRls,
    inventory: fullInventory
  };

  fs.writeFileSync('reports/atlas/realtime/supabase_rls_security_audit.json', JSON.stringify(report, null, 2));
  console.log('AUDIT SAVED to reports/atlas/realtime/supabase_rls_security_audit.json');
  console.log('Total Public Tables:', rlsRes.rows.length);
  console.log('RLS Disabled Count:', rlsDisabled.length);
  console.log('RLS Disabled Tables:', rlsDisabled);
  console.log('Anon Writable No RLS (' + anonWritableNoRls.length + '):', anonWritableNoRls);
  console.log('Auth Writable No RLS (' + authWritableNoRls.length + '):', authWritableNoRls);

  await c.end();
}

main().catch(console.error);
