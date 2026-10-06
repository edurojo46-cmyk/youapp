/**
 * apply_source_motors_migration.mjs
 * Applies 20260918000002_atlas_discovery_source_motors.sql to PostgreSQL.
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const clientConfig = parseDbUrl();
  console.log(`Connecting to Postgres (${clientConfig.host}:${clientConfig.port})...`);
  const client = new Client(clientConfig);

  await client.connect();
  console.log('✅ Connected to PostgreSQL.');

  const migrationFile = path.resolve(__dirname, '../supabase/migrations/20260918000002_atlas_discovery_source_motors.sql');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('Applying migration 20260918000002_atlas_discovery_source_motors.sql...');
  await client.query(sql);
  console.log('✅ Migration executed successfully.');

  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'atlas_discovery_source_motors'
  `);
  const tableExists = rows.length > 0;
  console.log(`TABLE_VERIFIED: atlas_discovery_source_motors ${tableExists ? 'EXISTS ✅' : 'NOT FOUND ❌'}`);

  if (tableExists) {
    const { rows: countRows } = await client.query(
      'SELECT COUNT(*) AS cnt FROM public.atlas_discovery_source_motors'
    );
    console.log(`INITIAL_MOTORS_COUNT: ${countRows[0].cnt}`);
  }

  await client.end();
  console.log('Connection closed.');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
