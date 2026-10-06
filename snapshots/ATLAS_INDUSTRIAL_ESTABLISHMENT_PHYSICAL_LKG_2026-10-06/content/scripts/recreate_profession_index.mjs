import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client({ ...parseDbUrl() });

async function run() {
  await client.connect();
  console.log('=== RESTORING INDEX: idx_discovery_candidates_profession_trgm ===');

  // Disable statement timeout for index rebuild and boost maintenance_work_mem
  await client.query("SET statement_timeout = 0;");
  await client.query("SET maintenance_work_mem = '128MB';");

  // Check if invalid index was left behind from timeout
  const checkRes = await client.query(`
    SELECT i.relname, x.indisvalid
    FROM pg_class i
    JOIN pg_index x ON i.oid = x.indexrelid
    WHERE i.relname = 'idx_discovery_candidates_profession_trgm';
  `);

  if (checkRes.rows.length > 0) {
    if (!checkRes.rows[0].indisvalid) {
      console.log('Found INVALID index from aborted build. Cleaning up concurrently...');
      await client.query('DROP INDEX CONCURRENTLY IF EXISTS public.idx_discovery_candidates_profession_trgm;');
      console.log('Cleaned up invalid index.');
    } else {
      console.log('Index already exists and is VALID.');
      await client.end();
      return;
    }
  }

  console.log('Executing CREATE INDEX CONCURRENTLY idx_discovery_candidates_profession_trgm (timeout=0)...');
  const t0 = performance.now();
  await client.query(`
    CREATE INDEX CONCURRENTLY idx_discovery_candidates_profession_trgm 
    ON public.atlas_people_discovery_candidates 
    USING gin (profession gin_trgm_ops);
  `);
  const durSec = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`Successfully recreated idx_discovery_candidates_profession_trgm in ${durSec}s.`);

  // Verify existence & validity
  const verifyRes = await client.query(`
    SELECT c.relname, pg_size_pretty(pg_relation_size(c.oid)) as size, x.indisvalid
    FROM pg_class c
    JOIN pg_index x ON c.oid = x.indexrelid
    WHERE c.relname = 'idx_discovery_candidates_profession_trgm';
  `);
  console.log('Restoration verification:', verifyRes.rows);

  await client.end();
}

run().catch(async (err) => {
  console.error('Error during index recreation:', err.message);
  await client.end();
  process.exit(1);
});
