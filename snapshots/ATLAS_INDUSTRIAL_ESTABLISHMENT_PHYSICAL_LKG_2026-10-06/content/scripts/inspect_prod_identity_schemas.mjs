import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

const poolProd = new pg.Pool({
  user: dbConfig.user,
  password: dbConfig.password,
  host: dbConfig.host,
  port: 5432,
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const c = await poolProd.connect();
  try {
    console.log('Inspecting production identity tables...');
    const q1 = await c.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('atlas_person_identity_map', 'atlas_hot_national_identity_map', 'atlas_people_discovery_candidates')
      ORDER BY table_name, ordinal_position;
    `);
    console.table(q1.rows);
  } finally {
    c.release();
    await poolProd.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
