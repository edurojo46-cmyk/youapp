import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION public.test_can_create_func()
      RETURNS boolean LANGUAGE sql AS $$ SELECT true; $$;
    `);
    const res = await client.query('SELECT public.test_can_create_func() as ok');
    console.log('Test function created and executed successfully:', res.rows[0].ok);
    await client.query('DROP FUNCTION public.test_can_create_func()');
    console.log('Test function dropped successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
