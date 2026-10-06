import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

async function inspect() {
  const poolProd = new pg.Pool({ ...dbConfig, database: 'postgres', ssl: { rejectUnauthorized: false } });
  const poolCold = new pg.Pool({ ...dbConfig, database: 'atlas_shadow_cold_gate', ssl: { rejectUnauthorized: false } });

  const prodClient = await poolProd.connect();
  const coldClient = await poolCold.connect();

  try {
    console.log('--- PROD TABLES & INDEXES ---');
    const prodTables = await prodClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE '%atlas%'
    `);
    console.log('Prod Tables:', prodTables.rows.map(r => r.table_name));

    for (const t of ['atlas_people_discovery_candidates', 'atlas_canonical_persons_v2']) {
      const idxs = await prodClient.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = $1;
      `, [t]);
      console.log(`Indexes on ${t}:`, idxs.rows.map(r => r.indexname));
    }

    console.log('--- COLD GATE TABLES & INDEXES ---');
    const coldTables = await coldClient.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('atlas_shadow', 'atlas_authority')
    `);
    console.log('Cold Gate Tables:', coldTables.rows.map(r => `${r.table_schema}.${r.table_name}`));

  } finally {
    prodClient.release();
    coldClient.release();
    await poolProd.end();
    await poolCold.end();
  }
}

inspect().catch(console.error);
