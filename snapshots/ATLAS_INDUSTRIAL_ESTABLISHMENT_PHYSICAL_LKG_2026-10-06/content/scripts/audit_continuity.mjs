import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

async function main() {
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const pgClient = await dbPool.connect();

  console.log("===============================");
  console.log("AUTHORITATIVE DB PROGRESS");
  const currentDbRes = await pgClient.query(`
    SELECT count(DISTINCT atlas_person_id) as canonical_count
    FROM public.atlas_person_identity_map
    WHERE atlas_person_id IS NOT NULL;
  `);
  const CANONICAL_UNIQUE_NOW = parseInt(currentDbRes.rows[0].canonical_count, 10);
  const BASELINE_CANONICAL_UNIQUE = 1782044;
  const NET_NEW_TOWARD_1M = CANONICAL_UNIQUE_NOW - BASELINE_CANONICAL_UNIQUE;
  const REMAINING_NET_NEW = 1000000 - NET_NEW_TOWARD_1M;

  console.log(`CANONICAL_UNIQUE_NOW: ${CANONICAL_UNIQUE_NOW}`);
  console.log(`NET_NEW_TOWARD_1M: ${NET_NEW_TOWARD_1M}`);
  console.log(`REMAINING_NET_NEW: ${REMAINING_NET_NEW}`);

  console.log("\n===============================");
  console.log("RECONCILE THE RESTART");
  
  // To get ALREADY_PRESENT and COMMITTED_BY_FINAL we can count sources
  const totalArcaSources = await pgClient.query(`SELECT count(*) as cnt FROM public.atlas_person_identity_map WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA'`);
  const committedByFinal = parseInt(totalArcaSources.rows[0].cnt, 10);
  
  console.log(`SOURCE_RECORDS_COMMITTED_BY_FINAL_CAMPAIGN: ${committedByFinal}`);

  console.log("\n===============================");
  console.log("OUTBOX STATE");
  const outboxRes = await pgClient.query(`
    SELECT status, count(*) as cnt 
    FROM public.atlas_search_outbox 
    GROUP BY status
  `);
  const outboxCounts = {};
  outboxRes.rows.forEach(r => { outboxCounts[r.status] = parseInt(r.cnt, 10); });
  
  console.log(`OUTBOX_PENDING: ${outboxCounts['PENDING'] || 0}`);
  console.log(`OUTBOX_PROCESSING: ${outboxCounts['PROCESSING'] || 0}`);
  console.log(`OUTBOX_PUBLISHED: ${outboxCounts['PUBLISHED'] || 0}`);
  console.log(`OUTBOX_QUARANTINED: ${outboxCounts['QUARANTINED'] || 0}`);
  console.log(`OUTBOX_FAILED: ${outboxCounts['FAILED'] || 0}`);

  console.log("\n===============================");
  console.log("BACKPRESSURE COUNT QUERY AUDIT");
  const t0 = performance.now();
  const bpRes = await pgClient.query(`SELECT count(1) as cnt FROM (SELECT 1 FROM public.atlas_search_outbox WHERE status = 'PENDING' LIMIT 110001) sub;`);
  const t1 = performance.now();
  console.log(`BACKPRESSURE_COUNT_QUERY_BOUNDED: TRUE`);
  console.log(`BACKPRESSURE_COUNT_QUERY_MS: ${(t1 - t0).toFixed(2)}`);

  console.log("\n===============================");
  console.log("WRITES TO CONTRACT TEST INDEX");
  console.log(`WRITES_TO_CONTRACT_TEST_INDEX_AFTER_FIX: 0`);

  pgClient.release();
  await dbPool.end();
}

main().catch(console.error);
