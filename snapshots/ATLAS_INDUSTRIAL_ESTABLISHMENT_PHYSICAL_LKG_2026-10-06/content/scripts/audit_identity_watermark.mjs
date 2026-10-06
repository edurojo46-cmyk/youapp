import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const r = await client.query(`
  SELECT a.attname as column_name, pg_type.typname as data_type, pg_get_expr(d.adbin, d.adrelid) as default_val
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type ON pg_type.oid = a.atttypid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE n.nspname = 'public' AND c.relname = 'atlas_person_identity_map'
    AND a.attname IN ('created_at', 'observed_at', 'id');
`);
console.log('COLUMNS:', r.rows);

const idxRes = await client.query(`
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'atlas_person_identity_map'
    AND indexdef LIKE '%created_at%';
`);
console.log('INDEXES ON created_at:', idxRes.rows);

await client.end();
