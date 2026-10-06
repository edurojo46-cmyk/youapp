import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const res = await c.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_people_live_metrics' 
    ORDER BY ordinal_position;
  `);
  console.table(res.rows);

  const row = await c.query(`SELECT * FROM atlas_people_live_metrics WHERE id = 'current'`);
  console.log('Current row in atlas_people_live_metrics:', row.rows[0]);

  await c.end();
}

main().catch(console.error);
