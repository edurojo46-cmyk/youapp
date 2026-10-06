import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl() });

async function listTables() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('Tables in public schema:');
    for (const r of res.rows) {
      try {
        const c = await client.query(`SELECT count(*) FROM public."${r.table_name}";`);
        console.log(`  ${r.table_name}: ${c.rows[0].count} rows`);
      } catch (e) {
        console.log(`  ${r.table_name}: error reading (${e.message})`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

listTables().catch(console.error);
