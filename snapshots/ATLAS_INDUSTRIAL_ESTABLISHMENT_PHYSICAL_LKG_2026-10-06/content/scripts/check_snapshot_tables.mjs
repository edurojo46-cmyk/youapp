import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const { Client } = pg;
const dbConfig = parseDbUrl();

async function main() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' 
        AND table_name IN ('atlas_source_snapshots', 'atlas_checkpoints', 'atlas_snapshot_lineage');
    `);
    console.log('EXISTING TABLES:', res.rows.map(r => r.table_name));
  } finally {
    await client.end();
  }
}

main().catch(console.error);
