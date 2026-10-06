import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_POSTGRES_URL || '';

if (!dbUrl) {
  console.error("No DATABASE_URL found in environment");
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("Connected to PostgreSQL database securely.");
  
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20260913120000_atlas_people_discovery_candidates_v1.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  
  await client.query(sql);
  console.log("Migration 20260913120000_atlas_people_discovery_candidates_v1 applied successfully.");
  
  // Verify table exists
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name = 'atlas_people_discovery_candidates';
  `);
  
  if (res.rows.length > 0) {
    console.log("TABLE_VERIFIED: public.atlas_people_discovery_candidates EXISTS in Supabase Postgres.");
  } else {
    throw new Error("Table verification failed: table does not exist after migration");
  }
  
  await client.end();
}

run().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
