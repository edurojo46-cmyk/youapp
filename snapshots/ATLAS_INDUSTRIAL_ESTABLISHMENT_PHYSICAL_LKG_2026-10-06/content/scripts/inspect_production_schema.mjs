import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Client } = pg;

async function checkSchema() {
  const client = new Client(parseDbUrl());
  await client.connect();

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name ILIKE '%atlas%'
    ORDER BY table_name;
  `);
  console.log('ATLAS TABLES:', tables.rows.map(r => r.table_name));

  const outboxCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'atlas_search_outbox'
    ORDER BY ordinal_position;
  `);
  console.log('OUTBOX COLUMNS:', outboxCols.rows);

  const peopleCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'atlas_people'
    ORDER BY ordinal_position;
  `);
  console.log('PEOPLE COLUMNS:', peopleCols.rows);

  const obsCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'atlas_person_observations'
    ORDER BY ordinal_position;
  `);
  console.log('OBSERVATIONS COLUMNS:', obsCols.rows);

  const rpcs = await client.query(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' AND (routine_name ILIKE '%canonical%' OR routine_name ILIKE '%reconcile%')
    ORDER BY routine_name;
  `);
  console.log('CANONICAL/RECONCILE RPCS:', rpcs.rows.map(r => r.routine_name));

  await client.end();
}

checkSchema().catch(console.error);
