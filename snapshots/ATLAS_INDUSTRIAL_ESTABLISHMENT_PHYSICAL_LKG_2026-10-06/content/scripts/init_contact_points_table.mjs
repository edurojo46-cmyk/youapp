import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function initContactTable() {
  const dbConfig = parseDbUrl();
  const client = new pg.Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  await client.query('SET statement_timeout = 0;');

  await client.query('CREATE SCHEMA IF NOT EXISTS atlas_shadow;');
  await client.query(`
    CREATE TABLE IF NOT EXISTS atlas_shadow.atlas_public_contact_points_1m (
      contact_point_id TEXT PRIMARY KEY,
      normalized_email TEXT NOT NULL,
      raw_email TEXT NOT NULL,
      contact_class TEXT NOT NULL,
      canonical_human_id TEXT,
      organization_id TEXT,
      source_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      source_url TEXT NOT NULL,
      raw_record_locator TEXT NOT NULL,
      raw_record_hash TEXT NOT NULL,
      argentina_link_verified BOOLEAN NOT NULL,
      public_context_verified BOOLEAN NOT NULL,
      first_seen_at TIMESTAMPTZ DEFAULT NOW(),
      verification_status TEXT NOT NULL
    );
  `);
  await client.query('TRUNCATE TABLE atlas_shadow.atlas_public_contact_points_1m;');
  console.log('Table atlas_shadow.atlas_public_contact_points_1m initialized and truncated successfully.');
  await client.end();
}

initContactTable().catch(console.error);
