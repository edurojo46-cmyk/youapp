import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

async function check() {
  const client = new pg.Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const q = await client.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'atlas_shadow' AND tablename = 'atlas_argentina_people_search_v1';
  `);
  console.log('Indexes on search table:', q.rows);
  const q2 = await client.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'atlas_shadow' AND tablename = 'atlas_canonical_persons_v2';
  `);
  console.log('Indexes on canonical table:', q2.rows);
  await client.end();
}

check().catch(console.error);
