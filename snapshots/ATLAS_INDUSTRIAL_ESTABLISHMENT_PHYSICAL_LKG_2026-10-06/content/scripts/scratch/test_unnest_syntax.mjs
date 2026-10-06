import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  const res = await client.query('SELECT u.c1, u.c2 FROM UNNEST($1::text[], $2::text[]) AS u(c1, c2)', [['a', 'b'], ['c', 'd']]);
  console.log('UNNEST AS u(c1, c2) result:', res.rows);

  client.release();
  await pool.end();
}

main().catch(console.error);
