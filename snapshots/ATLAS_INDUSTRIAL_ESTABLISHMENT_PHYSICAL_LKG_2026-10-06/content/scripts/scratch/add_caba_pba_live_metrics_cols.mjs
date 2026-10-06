import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('Adding CABA/PBA sprint columns to atlas_people_live_metrics...');
  await c.query(`
    ALTER TABLE atlas_people_live_metrics
      ADD COLUMN IF NOT EXISTS caba_pba_qualified_unique_real_people bigint DEFAULT 24628,
      ADD COLUMN IF NOT EXISTS caba_qualified_unique_real_people bigint DEFAULT 24628,
      ADD COLUMN IF NOT EXISTS pba_qualified_unique_real_people bigint DEFAULT 0,
      ADD COLUMN IF NOT EXISTS atlas_geo_sprint_mode text DEFAULT 'CABA_PBA',
      ADD COLUMN IF NOT EXISTS target_approach_mode boolean DEFAULT false;
  `);

  await c.query(`
    UPDATE atlas_people_live_metrics
    SET 
      caba_pba_qualified_unique_real_people = 24628,
      caba_qualified_unique_real_people = 24628,
      pba_qualified_unique_real_people = 0,
      atlas_geo_sprint_mode = 'CABA_PBA',
      target_approach_mode = false,
      updated_at = NOW()
    WHERE id = 'current';
  `);

  console.log('✅ Columns added and updated successfully!');
  await c.end();
}

main().catch(console.error);
