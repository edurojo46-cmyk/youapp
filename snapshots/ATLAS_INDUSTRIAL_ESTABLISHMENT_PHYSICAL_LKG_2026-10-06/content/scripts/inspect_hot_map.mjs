import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl() });

async function searchTables() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (
          table_name ILIKE '%contact%'
          OR table_name ILIKE '%email%'
          OR table_name ILIKE '%1m%'
          OR table_name ILIKE '%authority%'
          OR table_name ILIKE '%person%'
          OR table_name ILIKE '%source%'
          OR table_name ILIKE '%harvest%'
        )
      ORDER BY table_name;
    `);
    console.log('Matching tables:');
    for (const r of res.rows) {
      const c = await client.query(`SELECT count(*) FROM public."${r.table_name}";`);
      console.log(`  ${r.table_name}: ${c.rows[0].count} rows`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

searchTables().catch(console.error);
