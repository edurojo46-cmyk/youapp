import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SECRET_KEY || '';
const client = createClient(url, serviceKey);

async function query(sql: string) {
  const { data, error } = await client.rpc('exec_sql', { sql });
  if (error) {
    console.error(`Error executing ${sql}:`, error.message);
    throw error;
  }
  return data;
}

async function main() {
  console.log('Cleaning up overloaded functions...');
  
  // We can query pg_proc to find the exact signatures and drop them
  const findSql = `
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname IN ('search_canonical_persons_v1', 'search_admin_all_persons_v1')
      AND pronamespace = 'public'::regnamespace;
  `;
  
  const results = await query(findSql);
  if (results && results.length > 0) {
    for (const row of results) {
      console.log(`Dropping ${row.sig}...`);
      await query(`DROP FUNCTION IF EXISTS ${row.sig} CASCADE;`);
    }
  }
  
  // Also delete the failed migration record so we can retry push
  await query(`DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260910181000';`);
  
  console.log('Done.');
}

main().catch(console.error);
