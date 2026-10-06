import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });

async function run() {
  const counts = await pool.query(`
    SELECT 
      (SELECT count(*) FROM atlas_people_discovery_candidates) AS candidates_count,
      (SELECT count(*) FROM atlas_person_identity_map) AS identity_map_count;
  `);
  console.log('Counts:', counts.rows[0]);

  const indexes = await pool.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE tablename IN ('atlas_people_discovery_candidates', 'atlas_person_identity_map');
  `);
  console.log('Indexes:');
  for (const idx of indexes.rows) {
    console.log(`- ${idx.tablename}.${idx.indexname}: ${idx.indexdef}`);
  }

  await pool.end();
}

run();
