import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

console.log('=== VERIFYING OUTBOX V2 ACTIVE TRAFFIC FLOW ===');

const v2Counts = await client.query(`
  SELECT 
    status,
    count(*) 
  FROM public.atlas_search_outbox_v2 
  GROUP BY status;
`);
console.log('atlas_search_outbox_v2 counts by status:');
console.table(v2Counts.rows);

const v2Partitions = await client.query(`
  SELECT 
    tableoid::regclass as partition, 
    count(*) 
  FROM public.atlas_search_outbox_v2 
  GROUP BY 1;
`);
console.log('atlas_search_outbox_v2 by partition:');
console.table(v2Partitions.rows);

const deliveryKeys = await client.query(`
  SELECT 
    delivery_status, 
    count(*) 
  FROM public.atlas_search_delivery_keys 
  GROUP BY delivery_status;
`);
console.log('atlas_search_delivery_keys by status:');
console.table(deliveryKeys.rows);

await client.end();
