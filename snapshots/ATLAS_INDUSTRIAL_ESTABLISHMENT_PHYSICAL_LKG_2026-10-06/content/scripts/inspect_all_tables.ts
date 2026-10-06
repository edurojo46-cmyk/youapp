import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
  
  if (connectionString) {
    const client = new pg.Client({ connectionString });
    await client.connect();
    const res = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Public tables in Postgres:');
    console.log(res.rows.map(r => r.table_name));
    await client.end();
  } else {
    console.log('No direct postgres connection string, checking via Supabase client');
  }
}

main().catch(console.error);
