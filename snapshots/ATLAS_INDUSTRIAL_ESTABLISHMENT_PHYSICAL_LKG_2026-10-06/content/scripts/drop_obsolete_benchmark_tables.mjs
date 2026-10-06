import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function run() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== 2. CONTROLLED DROP OF OBSOLETE BENCHMARK TABLES ===\n');

  // 1. Measure DATABASE_SIZE_BEFORE
  const beforeRes = await client.query(`
    SELECT 
      pg_database_size(current_database()) AS size_bytes,
      pg_size_pretty(pg_database_size(current_database())) AS size_pretty
  `);
  const sizeBeforeBytes = Number(beforeRes.rows[0].size_bytes);
  console.log(`DATABASE_SIZE_BEFORE: ${beforeRes.rows[0].size_pretty} (${sizeBeforeBytes} bytes)`);

  // 2. Drop deprecated test RPC functions
  const deprecatedFuncs = [
    'atlas_resolve_and_ingest_batch_v15_shadow_rpc',
    'atlas_resolve_and_ingest_batch_v16_production_rpc',
    'atlas_resolve_and_ingest_batch_v19_append_rpc',
    'atlas_resolve_and_ingest_batch_v20_instrumented_rpc'
  ];
  for (const fn of deprecatedFuncs) {
    try {
      await client.query(`DROP FUNCTION IF EXISTS public.${fn} CASCADE;`);
      console.log(`Dropped deprecated function: ${fn}`);
    } catch (e) {
      console.warn(`Could not drop ${fn}:`, e.message);
    }
  }

  // 3. Drop obsolete benchmark tables
  console.log('Dropping public.atlas_search_outbox_v2...');
  await client.query(`DROP TABLE IF EXISTS public.atlas_search_outbox_v2 CASCADE;`);
  console.log('Successfully dropped atlas_search_outbox_v2.');

  console.log('Dropping public.atlas_search_outbox_minimal...');
  await client.query(`DROP TABLE IF EXISTS public.atlas_search_outbox_minimal CASCADE;`);
  console.log('Successfully dropped atlas_search_outbox_minimal.');

  // 4. Measure DATABASE_SIZE_AFTER
  const afterRes = await client.query(`
    SELECT 
      pg_database_size(current_database()) AS size_bytes,
      pg_size_pretty(pg_database_size(current_database())) AS size_pretty
  `);
  const sizeAfterBytes = Number(afterRes.rows[0].size_bytes);
  console.log(`\nDATABASE_SIZE_AFTER: ${afterRes.rows[0].size_pretty} (${sizeAfterBytes} bytes)`);

  const releasedBytes = sizeBeforeBytes - sizeAfterBytes;
  const releasedMb = (releasedBytes / (1024 * 1024)).toFixed(2);
  const releasedGb = (releasedBytes / (1024 * 1024 * 1024)).toFixed(3);
  console.log(`ACTUAL_SPACE_RELEASED: ${releasedMb} MB (${releasedGb} GB / ${releasedBytes} bytes)`);

  await client.end();
}

run().catch(console.error);
