import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as crypto from 'crypto';

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

const EXPECTED_079000_HASH = 'e999859214e5ab8ad548a4c2125eeb1d2fd31adf36f9a6f7dffa88962991012e';
const EXPECTED_078000_HASH = '1a4cdd17d3c4e086fb1c5fc510fb87390a7dedb6392959d42e16ced30d9bc1b0';

async function run() {
  const migration078Path = path.resolve(process.cwd(), 'supabase/migrations/20260909078000_atlas_commerce_v1.sql');
  const migration079Path = path.resolve(process.cwd(), 'supabase/migrations/20260909079000_atlas_demand_radar_v1.sql');

  const hash078 = crypto.createHash('sha256').update(fs.readFileSync(migration078Path)).digest('hex');
  const hash079 = crypto.createHash('sha256').update(fs.readFileSync(migration079Path)).digest('hex');

  console.log(`078000 Hash: ${hash078}`);
  console.log(`079000 Hash: ${hash079}`);

  if (hash078 !== EXPECTED_078000_HASH) {
    throw new Error(`078000 hash mismatch! Expected ${EXPECTED_078000_HASH}, got ${hash078}`);
  }
  if (hash079 !== EXPECTED_079000_HASH) {
    throw new Error(`079000 hash mismatch! Expected ${EXPECTED_079000_HASH}, got ${hash079}`);
  }

  await client.connect();
  console.log("Connected to Supabase Staging PostgreSQL DB");

  // Record migration in supabase_migrations table if it exists
  const checkMigrationsTable = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'supabase_migrations' 
      AND table_name = 'schema_migrations'
    ) as exists_schema_migrations,
    EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'supabase_migrations'
    ) as exists_public_migrations;
  `);
  console.log("Migration tables check:", checkMigrationsTable.rows[0]);

  const sql = fs.readFileSync(migration079Path, 'utf-8');
  console.log("Applying 20260909079000_atlas_demand_radar_v1.sql to Staging...");
  
  await client.query('BEGIN');
  try {
    await client.query(sql);
    
    // Check if supabase_migrations exists and insert version if appropriate
    try {
      await client.query(`
        INSERT INTO supabase_migrations.schema_migrations(version) 
        VALUES ('20260909079000') 
        ON CONFLICT (version) DO NOTHING;
      `);
    } catch (e) {
      // Table might not exist or be in a different schema
    }

    await client.query('COMMIT');
    console.log("Migration 20260909079000 applied successfully to Supabase Staging!");
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error("Migration execution failed:", err);
  process.exit(1);
});
