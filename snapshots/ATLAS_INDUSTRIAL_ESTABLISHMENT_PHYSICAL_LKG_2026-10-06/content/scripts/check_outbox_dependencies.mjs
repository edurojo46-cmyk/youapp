import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

// 1. Check foreign keys referencing atlas_search_outbox
const fkRes = await client.query(`
  SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
  FROM information_schema.table_constraints AS tc 
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND ccu.table_name = 'atlas_search_outbox'
`);
console.log('FK references to atlas_search_outbox:', fkRes.rows);

// 2. Check views referencing atlas_search_outbox
const viewRes = await client.query(`
  SELECT viewname, definition 
  FROM pg_views 
  WHERE schemaname = 'public' 
    AND definition ILIKE '%atlas_search_outbox%'
`);
console.log('Views referencing atlas_search_outbox:', viewRes.rows);

// 3. Exact physical size of atlas_search_outbox
const sizeRes = await client.query(`
  SELECT 
    pg_size_pretty(pg_total_relation_size('public.atlas_search_outbox')) AS total_size,
    pg_size_pretty(pg_relation_size('public.atlas_search_outbox')) AS data_size,
    pg_size_pretty(pg_indexes_size('public.atlas_search_outbox')) AS index_size,
    pg_total_relation_size('public.atlas_search_outbox') AS total_bytes
`);
console.log('atlas_search_outbox size:', sizeRes.rows[0]);

// 4. Current database size
const dbSizeRes = await client.query(`
  SELECT 
    pg_size_pretty(pg_database_size(current_database())) as db_pretty,
    pg_database_size(current_database()) as db_bytes
`);
console.log('Database size:', dbSizeRes.rows[0]);

await client.end();
