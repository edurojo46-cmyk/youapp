import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('--- atlas_person_identity_map columns ---');
  const cols = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_person_identity_map'
    ORDER BY ordinal_position
  `);
  console.table(cols.rows);

  console.log('--- Tables with geo or location in columns ---');
  const geoCols = await c.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND (column_name ILIKE '%geo%' OR column_name ILIKE '%loc%' OR column_name ILIKE '%caba%' OR column_name ILIKE '%provincia%')
    ORDER BY table_name, ordinal_position
  `);
  console.table(geoCols.rows);

  console.log('--- Sample distinct sources in atlas_person_identity_map ---');
  const sources = await c.query(`
    SELECT source_id, count(*) as count
    FROM atlas_person_identity_map
    GROUP BY source_id
    ORDER BY count DESC
    LIMIT 20
  `);
  console.table(sources.rows);

  await c.end();
}

main().catch(console.error);
