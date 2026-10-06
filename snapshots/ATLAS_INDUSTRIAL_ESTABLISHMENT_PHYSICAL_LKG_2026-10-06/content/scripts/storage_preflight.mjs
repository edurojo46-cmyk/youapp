import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const dbConfig = parseDbUrl(process.env.DATABASE_URL);
const pool = new pg.Pool({ ...dbConfig, max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '10s'");
    const { rows: dbSize } = await client.query('SELECT pg_size_pretty(pg_database_size(current_database())) as db_size, pg_database_size(current_database()) as db_bytes');
    const { rows: idxSize } = await client.query(`
      SELECT pg_size_pretty(sum(pg_relation_size(c.oid))) as idx_size, sum(pg_relation_size(c.oid)) as idx_bytes 
      FROM pg_class c 
      JOIN pg_namespace n ON n.oid = c.relnamespace 
      WHERE c.relkind = 'i' AND n.nspname = 'public' AND c.relname LIKE '%search%'
    `);
    const { rows: idCount } = await client.query(`
      SELECT reltuples::bigint as count FROM pg_class WHERE relname = 'atlas_person_identity_map'
    `);
    const { rows: metrics } = await client.query(`
      SELECT qualified_unique_real_people, caba_pba_qualified_unique_real_people 
      FROM atlas_people_live_metrics WHERE id = 'current'
    `);
    console.log({
      dbSize: dbSize[0],
      searchIndexSize: idxSize[0],
      productionIdentityCountAtT0: idCount[0].count,
      qualifiedPeople: metrics[0].qualified_unique_real_people,
      cabaPbaUnion: metrics[0].caba_pba_qualified_unique_real_people
    });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
