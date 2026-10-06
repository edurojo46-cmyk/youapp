import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let dbUrl = '';
try {
  const envConfig = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env')));
  dbUrl = envConfig.DATABASE_URL || envConfig.VITE_SUPABASE_DB_URL || envConfig.SUPABASE_DB_URL || envConfig.SUPABASE_POSTGRES_URL || '';
} catch (e) {}

try {
  const envLocalConfig = dotenv.parse(fs.readFileSync(path.resolve(process.cwd(), '.env.local')));
  dbUrl = dbUrl || envLocalConfig.DATABASE_URL || envLocalConfig.VITE_SUPABASE_DB_URL || envLocalConfig.SUPABASE_DB_URL || envLocalConfig.SUPABASE_POSTGRES_URL || '';
} catch (e) {}

if (!dbUrl) {
  throw new Error("DATABASE_URL must be provided in environment variables");
}

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("Connected to PostgreSQL DB");
  
  const migrationFile = path.resolve(process.cwd(), 'supabase/migrations/20260909078000_atlas_commerce_v1.sql');
  const sql = fs.readFileSync(migrationFile, 'utf-8');
  
  console.log("Applying 20260909078000_atlas_commerce_v1.sql...");
  await client.query(sql);
  console.log("Migration 20260909078000 applied successfully!");
  
  await client.end();
}

run().catch(err => {
  console.error("Migration execution failed:", err);
  process.exit(1);
});
