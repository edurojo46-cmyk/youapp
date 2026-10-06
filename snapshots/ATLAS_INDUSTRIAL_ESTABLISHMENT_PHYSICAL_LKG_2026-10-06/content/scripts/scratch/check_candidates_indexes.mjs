import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const idxRes = await c.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'atlas_people_discovery_candidates'
  `);
  console.log('Indexes on atlas_people_discovery_candidates:');
  console.table(idxRes.rows);

  // Fast count using primary or indexed columns
  const countCand = await c.query('SELECT count(*) FROM atlas_people_discovery_candidates');
  console.log('Total candidates:', countCand.rows[0].count);

  await c.end();
}

main().catch(console.error);
