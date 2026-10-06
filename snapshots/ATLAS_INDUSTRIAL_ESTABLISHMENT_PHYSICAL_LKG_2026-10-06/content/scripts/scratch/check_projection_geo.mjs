import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== Checking atlas_argentina_people_search_projection_v1 ===');
  const countRes = await c.query('SELECT count(*) FROM atlas_argentina_people_search_projection_v1');
  console.log('Total rows in projection:', countRes.rows[0].count);

  const geoRes = await c.query(`
    SELECT geography_name, count(*) as count
    FROM atlas_argentina_people_search_projection_v1
    GROUP BY geography_name
    ORDER BY count DESC
    LIMIT 20;
  `);
  console.table(geoRes.rows);

  await c.end();
}

main().catch(console.error);
