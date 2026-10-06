import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let dbUrl = '';
let keys: string[] = [];

try {
  const envConfig = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
  dbUrl = envConfig.DATABASE_URL || envConfig.VITE_SUPABASE_DB_URL || envConfig.SUPABASE_DB_URL || envConfig.SUPABASE_POSTGRES_URL || '';
  keys = [...keys, ...Object.keys(envConfig)];
} catch (e) {}

try {
  const envLocalConfig = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env.local')));
  dbUrl = dbUrl || envLocalConfig.DATABASE_URL || envLocalConfig.VITE_SUPABASE_DB_URL || envLocalConfig.SUPABASE_DB_URL || envLocalConfig.SUPABASE_POSTGRES_URL || '';
  keys = [...keys, ...Object.keys(envLocalConfig)];
} catch (e) {}

if (!dbUrl) {
  console.error("No DB URL found in parsed keys:", keys);
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("Connected to DB");
  
  const migration1 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20260908070000_atlas_person_enrichment_v1.sql'), 'utf-8');
  await client.query(migration1);
  console.log("Migration 070000 applied successfully");
  
  await client.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
