import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  
  // Check available schemas
  const schemaRes = await pool.query(`SELECT schema_name FROM information_schema.schemata;`);
  console.log('Available schemas:', schemaRes.rows.map(r => r.schema_name));

  // Check any disk/metric related views/tables
  const viewRes = await pool.query(`
    SELECT table_schema, table_name 
    FROM information_schema.views 
    WHERE table_name LIKE '%stat%' OR table_name LIKE '%metric%' OR table_name LIKE '%io%' OR table_name LIKE '%disk%';
  `);
  console.log('Available stat/io views:', viewRes.rows);

  await pool.end();
}

main().catch(console.error);
