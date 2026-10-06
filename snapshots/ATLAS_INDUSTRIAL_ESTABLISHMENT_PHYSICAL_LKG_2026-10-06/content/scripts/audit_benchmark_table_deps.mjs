import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function checkDependencies() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== 2. AUDITING DEPENDENCIES OF HISTORICAL BENCHMARK TABLES ===\n');

  const targets = ['atlas_search_outbox_v2', 'atlas_search_outbox_minimal'];

  for (const table of targets) {
    console.log(`Checking [${table}]...`);
    
    // 1. Foreign keys referencing or referenced
    const fkRes = await client.query(`
      SELECT
        tc.table_schema, 
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND (tc.table_name = $1 OR ccu.table_name = $1);
    `, [table]);
    console.log(`  - Foreign keys: ${fkRes.rows.length}`);
    if (fkRes.rows.length > 0) console.table(fkRes.rows);

    // 2. Triggers
    const trigRes = await client.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = $1;
    `, [table]);
    console.log(`  - Triggers: ${trigRes.rows.length}`);
    if (trigRes.rows.length > 0) console.table(trigRes.rows);

    // 3. Views dependent on these tables
    const viewRes = await client.query(`
      SELECT view_name 
      FROM information_schema.view_table_usage
      WHERE table_name = $1;
    `, [table]);
    console.log(`  - Dependent views: ${viewRes.rows.length}`);
    if (viewRes.rows.length > 0) console.table(viewRes.rows);

    // 4. Stored procedures / functions referencing the table textually
    const funcRes = await client.query(`
      SELECT routine_schema, routine_name
      FROM information_schema.routines
      WHERE routine_definition ILIKE '%' || $1 || '%'
        AND routine_schema NOT IN ('pg_catalog', 'information_schema');
    `, [table]);
    console.log(`  - Dependent functions/procedures: ${funcRes.rows.length}`);
    if (funcRes.rows.length > 0) console.table(funcRes.rows);

    // 5. Current exact size
    const sizeRes = await client.query(`
      SELECT 
        pg_size_pretty(pg_total_relation_size($1::regclass)) AS total_size,
        pg_total_relation_size($1::regclass) AS total_bytes
    `, [`public.${table}`]);
    console.log(`  - Physical Total Size: ${sizeRes.rows[0].total_size} (${sizeRes.rows[0].total_bytes} bytes)\n`);
  }

  await client.end();
}

checkDependencies().catch(console.error);
