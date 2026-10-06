import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

// Notice: DROP INDEX CONCURRENTLY requires a client without transaction block
const client = new pg.Client({ ...parseDbUrl() });
const indexName = process.argv[2];

if (!indexName) {
  console.error('Usage: node scripts/remove_index_safely.mjs <INDEX_NAME>');
  process.exit(1);
}

async function run() {
  await client.connect();
  console.log(`=== SAFE NON-BLOCKING REMOVAL: ${indexName} ===`);

  // 1. Verify index exists
  const checkRes = await client.query(`
    SELECT c.relname, pg_size_pretty(pg_relation_size(c.oid)) as size,
           round((pg_relation_size(c.oid)/(1024.0*1024.0))::numeric, 2) as size_mb
    FROM pg_class c
    WHERE c.relname = $1;
  `, [indexName]);

  if (checkRes.rows.length === 0) {
    console.log(`Index ${indexName} does not exist in database.`);
    await client.end();
    return;
  }

  const indexInfo = checkRes.rows[0];
  console.log(`Index found: ${indexInfo.relname} (${indexInfo.size} / ${indexInfo.size_mb} MB)`);

  // 2. Drop concurrently
  console.log(`Executing DROP INDEX CONCURRENTLY IF EXISTS public.${indexName}...`);
  const t0 = performance.now();
  await client.query(`DROP INDEX CONCURRENTLY IF EXISTS public.${indexName};`);
  const durSec = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`Successfully dropped ${indexName} in ${durSec}s.`);

  // 3. Verify it is gone
  const verifyRes = await client.query(`
    SELECT c.relname FROM pg_class c WHERE c.relname = $1;
  `, [indexName]);

  if (verifyRes.rows.length === 0) {
    console.log(`VERIFICATION CONFIRMED: ${indexName} is completely removed.`);
  } else {
    console.error(`VERIFICATION FAILED: ${indexName} still exists!`);
  }

  await client.end();
}

run().catch(async (err) => {
  console.error('Error during index drop:', err.message);
  await client.end();
  process.exit(1);
});
