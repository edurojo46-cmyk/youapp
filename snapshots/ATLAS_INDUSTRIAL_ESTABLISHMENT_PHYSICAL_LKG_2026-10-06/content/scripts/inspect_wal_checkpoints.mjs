import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

async function checkWalAndCheckpoints() {
  const pool = new pg.Pool({ ...dbConfig, max: 1 });
  const client = await pool.connect();
  
  const walRes = await client.query(`
    SELECT pg_current_wal_lsn(), 
           pg_wal_lsn_diff(pg_current_wal_lsn(), '0/0') AS lsn_bytes;
  `);
  console.log('WAL LSN:', walRes.rows);

  try {
    const cpRes = await client.query('SELECT * FROM pg_stat_checkpointer;');
    console.log('CHECKPOINTER:', cpRes.rows[0]);
  } catch (e) {
    console.log('No pg_stat_checkpointer (pre-PG17):', e.message);
  }

  const bgRes = await client.query('SELECT * FROM pg_stat_bgwriter;');
  console.log('BGWRITER:', bgRes.rows[0]);

  try {
    const archRes = await client.query('SELECT * FROM pg_stat_archiver;');
    console.log('ARCHIVER:', archRes.rows[0]);
  } catch (e) {
    console.log('Archiver query error:', e.message);
  }

  try {
    const walStatRes = await client.query('SELECT * FROM pg_stat_wal;');
    console.log('WAL STATS:', walStatRes.rows[0]);
  } catch (e) {
    console.log('WAL stats query error:', e.message);
  }

  // Check dead tuple bloat in public and atlas_shadow
  const bloatRes = await client.query(`
    SELECT schemaname, relname, n_live_tup, n_dead_tup,
           round(n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0) * 100, 2) AS dead_pct,
           pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
           pg_total_relation_size(relid) AS total_bytes
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 1000
    ORDER BY n_dead_tup DESC
    LIMIT 15;
  `);
  console.log('DEAD TUPLE HOTSPOTS (postgres db):', bloatRes.rows);

  client.release();
  await pool.end();
}

checkWalAndCheckpoints().catch(console.error);
