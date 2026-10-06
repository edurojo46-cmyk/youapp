import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('Adding geo_association columns to atlas_people_discovery_candidates...');
  await c.query(`
    ALTER TABLE atlas_people_discovery_candidates
      ADD COLUMN IF NOT EXISTS geo_association_type text,
      ADD COLUMN IF NOT EXISTS geo_confidence numeric(3,2) DEFAULT 1.00,
      ADD COLUMN IF NOT EXISTS geo_source text,
      ADD COLUMN IF NOT EXISTS geo_evidence text;
  `);

  console.log('Creating index on geo_association_type if not exists...');
  await c.query(`
    CREATE INDEX IF NOT EXISTS idx_discovery_candidates_geo_assoc 
    ON atlas_people_discovery_candidates(geo_association_type);
  `);

  console.log('✅ Geo association columns and index added successfully!');
  await c.end();
}

main().catch(console.error);
