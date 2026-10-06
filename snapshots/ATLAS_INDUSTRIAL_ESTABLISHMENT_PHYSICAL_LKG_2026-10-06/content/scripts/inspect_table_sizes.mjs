import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT 
        pg_size_pretty(pg_total_relation_size('public.atlas_person_identity_map')) as total_size,
        pg_size_pretty(pg_relation_size('public.atlas_person_identity_map')) as table_size,
        pg_size_pretty(pg_indexes_size('public.atlas_person_identity_map')) as indexes_size,
        pg_total_relation_size('public.atlas_person_identity_map') as total_bytes,
        pg_relation_size('public.atlas_person_identity_map') as table_bytes,
        pg_indexes_size('public.atlas_person_identity_map') as indexes_bytes
    `);
    console.log('Production identity map size:', res.rows[0]);

    const res2 = await client.query(`
      SELECT 
        pg_size_pretty(pg_total_relation_size('public.atlas_search_outbox')) as total_size,
        pg_size_pretty(pg_indexes_size('public.atlas_search_outbox')) as indexes_size,
        pg_total_relation_size('public.atlas_search_outbox') as total_bytes,
        pg_indexes_size('public.atlas_search_outbox') as indexes_bytes
    `);
    console.log('Production search outbox size:', res2.rows[0]);

    // Check available disk / tablespace
    const diskRes = await client.query(`
      SELECT pg_size_pretty(sum(pg_database_size(oid))) as dbsize FROM pg_database;
    `);
    console.log('Total database size:', diskRes.rows[0].dbsize);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
