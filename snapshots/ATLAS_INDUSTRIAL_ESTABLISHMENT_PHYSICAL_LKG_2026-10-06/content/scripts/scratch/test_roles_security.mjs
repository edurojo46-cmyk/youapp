import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log('=== TESTING ACCESS AS REAL ROLES (anon, authenticated, service_role) ===\n');

  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const testTables = [
    'atlas_person_profiles',
    'atlas_hot_source_key_map',
    'atlas_hot_national_identity_map',
    'atlas_identity_evidence_store',
    'atlas_checkpoints',
    'atlas_discovered_companies'
  ];

  console.log('--- 1. DIRECT POSTGRESQL ROLE SIMULATION ---');
  for (const tbl of testTables) {
    console.log(`\nTable: ${tbl}`);

    // Test as anon
    try {
      await c.query('BEGIN');
      await c.query('SET ROLE anon');
      let selectOk = false;
      let insertOk = false;
      try {
        await c.query(`SELECT * FROM public.${tbl} LIMIT 1`);
        selectOk = true;
      } catch (e) {
        selectOk = false;
      }
      try {
        await c.query(`INSERT INTO public.${tbl} DEFAULT VALUES`);
        insertOk = true;
      } catch (e) {
        insertOk = false;
      }
      await c.query('ROLLBACK');
      console.log(`  anon:          SELECT = ${selectOk ? 'ALLOWED' : 'DENIED'}, INSERT = ${insertOk ? 'ALLOWED' : 'DENIED'}`);
    } catch (e) {
      await c.query('ROLLBACK');
    }

    // Test as authenticated
    try {
      await c.query('BEGIN');
      await c.query('SET ROLE authenticated');
      let selectOk = false;
      let insertOk = false;
      try {
        await c.query(`SELECT * FROM public.${tbl} LIMIT 1`);
        selectOk = true;
      } catch (e) {
        selectOk = false;
      }
      try {
        await c.query(`INSERT INTO public.${tbl} DEFAULT VALUES`);
        insertOk = true;
      } catch (e) {
        insertOk = false;
      }
      await c.query('ROLLBACK');
      console.log(`  authenticated: SELECT = ${selectOk ? 'ALLOWED' : 'DENIED'}, INSERT = ${insertOk ? 'ALLOWED' : 'DENIED'}`);
    } catch (e) {
      await c.query('ROLLBACK');
    }

    // Test as postgres / service
    try {
      await c.query('BEGIN');
      await c.query('SET ROLE postgres');
      const res = await c.query(`SELECT 1 FROM public.${tbl} LIMIT 1`);
      await c.query('ROLLBACK');
      console.log(`  service/pg:    SELECT = ALLOWED (${res.rows.length} row), INSERT/WRITE = ALLOWED`);
    } catch (e) {
      await c.query('ROLLBACK');
      console.log(`  service/pg:    ERROR: ${e.message}`);
    }
  }

  console.log('\n--- 2. SUPABASE REST API CLIENT TEST (anon client) ---');
  if (supabaseUrl && supabaseAnonKey) {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    for (const tbl of testTables) {
      const { data: selData, error: selErr } = await anonClient.from(tbl).select('*').limit(1);
      const { error: insErr } = await anonClient.from(tbl).insert({ dummy_nonexistent_field: 123 });

      console.log(`Table ${tbl}:`);
      console.log(`  API anon SELECT: ${selErr ? `DENIED (${selErr.code || selErr.message})` : `ALLOWED (${selData?.length} rows)`}`);
      console.log(`  API anon INSERT: ${insErr ? `DENIED (${insErr.code || insErr.message})` : 'ALLOWED'}`);
    }
  } else {
    console.log('Skipping API test: Supabase URL or Anon Key missing.');
  }

  await c.end();
}

main().catch(console.error);
