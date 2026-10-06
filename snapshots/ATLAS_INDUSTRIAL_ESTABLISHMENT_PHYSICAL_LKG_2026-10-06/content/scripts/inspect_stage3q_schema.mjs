import dotenv from 'dotenv';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const tables = ['atlas_person_identity_map', 'atlas_search_outbox'];
    for (const t of tables) {
      console.log(`\n=== TABLE: ${t} ===`);
      const cols = await client.query(`
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [t]);
      console.log('Columns:');
      for (const c of cols.rows) {
        console.log(`  ${c.column_name}: ${c.data_type} (${c.udt_name}), nullable=${c.is_nullable}, default=${c.column_default}`);
      }

      const idxs = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = $1 AND schemaname = 'public'
        ORDER BY indexname
      `, [t]);
      console.log('Indexes:');
      for (const i of idxs.rows) {
        console.log(`  ${i.indexname}: ${i.indexdef}`);
      }
    }

    const res = await client.query(`
      SELECT routine_name, routine_type 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' AND routine_name LIKE '%resolve%'
    `);
    console.log('Routines:', res.rows);
    
    const atlasTables = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'atlas%'
    `);
    console.log('Atlas tables:', atlasTables.rows.map(r => r.table_name));

    // Also check people tables
    const peopleTables = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%person%' OR table_name LIKE '%people%'
    `);
    console.log('Person/people tables:', peopleTables.rows.map(r => r.table_name));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
