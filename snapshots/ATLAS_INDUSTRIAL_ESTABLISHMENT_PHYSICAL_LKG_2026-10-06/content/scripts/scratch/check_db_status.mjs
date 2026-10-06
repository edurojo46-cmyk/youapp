import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();
const { Client } = pg;
const c = new Client(parseDbUrl());
await c.connect();
const s = await c.query(`
  SELECT 
    pg_size_pretty(pg_database_size(current_database())) as db_pretty,
    pg_database_size(current_database()) as db_bytes
`);
const outbox = await c.query(`
  SELECT count(*) as total, 
         count(*) FILTER (WHERE status = 'PUBLISHED') as published,
         count(*) FILTER (WHERE status = 'PENDING') as pending
  FROM atlas_search_outbox
`);
const indexes = await c.query(`
  SELECT indexname, pg_size_pretty(pg_relation_size(quote_ident(schemaname) || '.' || quote_ident(indexname))) as size
  FROM pg_indexes
  WHERE tablename IN ('atlas_hot_source_key_map', 'atlas_hot_national_identity_map')
`);
console.log('DB:', s.rows[0]);
console.log('Outbox:', outbox.rows[0]);
console.log('Hot indexes remaining:');
console.table(indexes.rows);
await c.end();
