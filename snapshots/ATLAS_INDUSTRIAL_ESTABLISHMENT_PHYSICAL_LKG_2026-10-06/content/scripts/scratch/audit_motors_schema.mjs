import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const cols = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_discovery_source_motors'
    ORDER BY ordinal_position
  `);
  console.log('atlas_discovery_source_motors columns:');
  console.table(cols.rows);

  const motors = await c.query(`SELECT * FROM atlas_discovery_source_motors LIMIT 20`);
  console.table(motors.rows);

  await c.end();
}

main().catch(console.error);
