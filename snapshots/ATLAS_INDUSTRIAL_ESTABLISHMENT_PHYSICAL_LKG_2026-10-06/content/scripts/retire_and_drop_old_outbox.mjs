import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== RETIRING & PHYSICALLY DROPPING OLD SEARCH OUTBOX ===');

// 1. Measure DISK BEFORE DROP
const preDrop = await client.query(`
  SELECT 
    pg_database_size(current_database()) AS db_bytes_before,
    pg_size_pretty(pg_database_size(current_database())) AS db_size_before,
    pg_total_relation_size('public.atlas_search_outbox') AS table_bytes,
    pg_size_pretty(pg_total_relation_size('public.atlas_search_outbox')) AS table_size,
    pg_size_pretty(pg_relation_size('public.atlas_search_outbox')) AS data_size,
    pg_size_pretty(pg_indexes_size('public.atlas_search_outbox')) AS index_size
`);

console.log('Pre-drop physical measurements:');
console.table(preDrop.rows);

const tableBytes = parseInt(preDrop.rows[0].table_bytes, 10);
const dbBytesBefore = parseInt(preDrop.rows[0].db_bytes_before, 10);

// 2. Execute controlled DROP TABLE
console.log('Executing DROP TABLE public.atlas_search_outbox...');
console.time('DROP TABLE atlas_search_outbox');
await client.query('DROP TABLE public.atlas_search_outbox CASCADE');
console.timeEnd('DROP TABLE atlas_search_outbox');
console.log('✅ TABLE public.atlas_search_outbox DROPPED SUCCESSFULLY.');

// 3. Measure DISK AFTER DROP
const postDrop = await client.query(`
  SELECT 
    pg_database_size(current_database()) AS db_bytes_after,
    pg_size_pretty(pg_database_size(current_database())) AS db_size_after
`);

console.log('Post-drop physical measurements:');
console.table(postDrop.rows);

const dbBytesAfter = parseInt(postDrop.rows[0].db_bytes_after, 10);
const bytesReleased = dbBytesBefore - dbBytesAfter;
const gbReleased = (bytesReleased / (1024 * 1024 * 1024)).toFixed(2);
const tableGbExpected = (tableBytes / (1024 * 1024 * 1024)).toFixed(2);

console.log('════════════════════════════════════════════════════════════');
console.log(`DATABASE_SIZE_BEFORE : \${(dbBytesBefore / (1024 * 1024 * 1024)).toFixed(2)} GB`);
console.log(`DATABASE_SIZE_AFTER  : \${(dbBytesAfter / (1024 * 1024 * 1024)).toFixed(2)} GB`);
console.log(`EXPECTED_GB_RELEASED : \${tableGbExpected} GB`);
console.log(`PHYSICAL_GB_RELEASED : \${gbReleased} GB`);
console.log('════════════════════════════════════════════════════════════');

await client.end();
