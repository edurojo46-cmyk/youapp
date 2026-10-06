import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

async function main() {
  const pool = new pg.Pool({ ...dbConfig, database: 'atlas_shadow_cold_gate', ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  try {
    console.log('Resetting disposable shadow benchmark tables...');
    await client.query("SET statement_timeout = '120s';");
    await client.query('TRUNCATE atlas_shadow.staging_incoming_records CASCADE;');
    await client.query('TRUNCATE atlas_shadow.atlas_canonical_persons_v2 CASCADE;');
    await client.query('TRUNCATE atlas_shadow.atlas_argentina_people_search_p16 CASCADE;');
    await client.query('TRUNCATE atlas_shadow.atlas_identity_keys_v2 CASCADE;');

    const q1 = await client.query('SELECT count(*) FROM atlas_shadow.atlas_canonical_persons_v2;');
    const q2 = await client.query('SELECT count(*) FROM atlas_shadow.atlas_argentina_people_search_p16;');
    console.log(`Shadow Canonical Count: ${q1.rows[0].count}`);
    console.log(`Shadow Search Index Count: ${q2.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
