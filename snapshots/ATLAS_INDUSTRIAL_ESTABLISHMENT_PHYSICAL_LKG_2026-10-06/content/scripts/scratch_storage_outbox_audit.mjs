import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function audit() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== DATABASE SIZE ===');
  const dbSizeRes = await client.query(`
    SELECT 
      pg_size_pretty(pg_database_size(current_database())) as db_size,
      pg_database_size(current_database()) as db_bytes;
  `);
  console.log(dbSizeRes.rows[0]);

  console.log('\n=== WAL SIZE ===');
  try {
    const walRes = await client.query(`
      SELECT pg_size_pretty(sum(size)) as wal_size, sum(size) as wal_bytes
      FROM pg_ls_waldir();
    `);
    console.log(walRes.rows[0]);
  } catch (e) {
    console.log('WAL size via pg_ls_waldir not available:', e.message);
  }

  console.log('\n=== TOP 20 TABLES + INDEXES BY TOTAL SIZE ===');
  const tablesRes = await client.query(`
    SELECT 
      schemaname || '.' || relname AS relation,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_total_relation_size(relid) AS total_bytes,
      pg_size_pretty(pg_relation_size(relid)) AS table_size,
      pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
    FROM pg_catalog.pg_statio_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 20;
  `);
  console.table(tablesRes.rows);

  console.log('\n=== TOP 15 LARGEST INDEXES ===');
  const indexRes = await client.query(`
    SELECT
      schemaname || '.' || relname as table_name,
      indexrelname as index_name,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
      pg_relation_size(indexrelid) as index_bytes
    FROM pg_stat_user_indexes
    ORDER BY pg_relation_size(indexrelid) DESC
    LIMIT 15;
  `);
  console.table(indexRes.rows);

  console.log('\n=== OUTBOX INSPECTION ===');
  const outboxTablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name LIKE '%outbox%';
  `);
  console.log('Outbox tables found:', outboxTablesRes.rows.map(r => r.table_name));

  for (const row of outboxTablesRes.rows) {
    const t = row.table_name;
    try {
      const countRes = await client.query(`
        SELECT 
          count(*) as total,
          count(*) FILTER (WHERE status = 'PENDING') as pending,
          count(*) FILTER (WHERE status = 'PROCESSING') as processing,
          count(*) FILTER (WHERE status = 'RETRY') as retry,
          count(*) FILTER (WHERE status = 'FAILED') as failed,
          count(*) FILTER (WHERE status = 'PUBLISHED') as published
        FROM public.${t};
      `);
      console.log(`Table ${t} status counts:`, countRes.rows[0]);
    } catch (e) {
      console.log(`Could not query counts on ${t}:`, e.message);
    }
  }

  console.log('\n=== CHECKING OUTBOX V2 / PARTITIONS ===');
  const partitionsRes = await client.query(`
    SELECT 
      inhparent::regclass as parent_table,
      inhrelid::regclass as partition_name
    FROM pg_inherits
    WHERE inhparent::regclass::text LIKE '%outbox%';
  `);
  console.log('Partitioned outbox tables found:', partitionsRes.rows);

  console.log('\n=== CHECKING BENCHMARK / TEMP / UNRECONCILED TABLES ===');
  const allUserTables = await client.query(`
    SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) as total_size, pg_total_relation_size(relid) as bytes
    FROM pg_statio_user_tables
    WHERE relname LIKE '%test%' OR relname LIKE '%bench%' OR relname LIKE '%temp%' OR relname LIKE '%bak%' OR relname LIKE '%old%'
    ORDER BY pg_total_relation_size(relid) DESC;
  `);
  console.log('Test/bench/temp tables:', allUserTables.rows);

  await client.end();
}

audit().catch(console.error);
