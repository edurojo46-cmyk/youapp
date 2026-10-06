import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    console.log('Deploying Atlas Person Profile / Evidence Fusion Engine V1 Schema...');
    const ddl = fs.readFileSync('src/lib/profile/profile_schema.sql', 'utf8');
    await client.query(ddl);
    console.log('Schema deployed successfully.');

    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('atlas_person_observations', 'atlas_person_organization_relations', 'atlas_person_profile_conflicts', 'atlas_person_profiles');
    `);
    console.log('Verified tables in database:', tableCheck.rows.map(r => r.table_name));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
