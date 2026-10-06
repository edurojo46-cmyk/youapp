import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

const tables = await client.query(`
  SELECT 
    c.relname, 
    c.relkind, 
    c.reltuples::bigint as rows, 
    pg_size_pretty(pg_total_relation_size(c.oid)) as size 
  FROM pg_class c 
  JOIN pg_namespace n ON n.oid = c.relnamespace 
  WHERE n.nspname = 'public' AND c.relname LIKE '%outbox%';
`);
console.log('--- ALL OUTBOX TABLES IN POSTGRES ---');
console.table(tables.rows);

// Check if partitioned
const partitions = await client.query(`
  SELECT 
    nmsp_parent.nspname AS parent_schema,
    parent.relname      AS parent_table,
    nmsp_child.nspname  AS child_schema,
    child.relname       AS child_table
  FROM pg_inherits
  JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
  JOIN pg_class child  ON pg_inherits.inhrelid   = child.oid
  JOIN pg_namespace nmsp_parent ON nmsp_parent.oid = parent.relnamespace
  JOIN pg_namespace nmsp_child  ON nmsp_child.oid  = child.relnamespace
  WHERE parent.relname LIKE '%outbox%';
`);
console.log('--- OUTBOX PARTITIONS ---');
console.table(partitions.rows);

// Check where factory writes outbox events: inspect commit RPC
const factoryRpc = await client.query(`
  SELECT proname, prosrc 
  FROM pg_proc 
  WHERE prosrc LIKE '%outbox%' AND proname LIKE '%batch%' OR proname LIKE '%commit%' OR proname LIKE '%people%'
  LIMIT 5;
`);
console.log('--- FUNCTIONS WRITING TO OUTBOX ---');
for (const r of factoryRpc.rows) {
  if (r.prosrc.includes('outbox')) {
    console.log('Function:', r.proname);
    // Find lines with outbox
    const lines = r.prosrc.split('\n').filter(l => l.includes('outbox'));
    console.log('Lines referencing outbox:', lines);
  }
}

await client.end();
