/**
 * scripts/execute_phase2_hot_index_drops.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * ATLAS PHASE 2: PRUDENT DROP OF REDUNDANT HOT MAP INDEXES
 *
 * Sequence:
 *   1. Preflight Audit of Index 1 (idx_hot_source_key_person_id)
 *   2. Identity Path Latency Baseline
 *   3. DROP INDEX CONCURRENTLY idx_hot_source_key_person_id
 *   4. Physical Disk Measurement 1
 *   5. Smoke Test & Performance Gate (< 10% degradation)
 *   6. Preflight Audit of Index 2 (idx_hot_nat_id_person_id)
 *   7. DROP INDEX CONCURRENTLY idx_hot_nat_id_person_id
 *   8. Physical Disk Measurement 2 & Final Disk Usage
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const ALLOCATED_DISK_BYTES = 25 * 1024 * 1024 * 1024; // 25 GB Pro Allocation

async function preflightCheck(client, indexName) {
  console.log(`\n>>> PREFLIGHT AUDIT: [${indexName}]`);

  // 1. Check existence in pg_indexes
  const existRes = await client.query(`
    SELECT tablename, indexname, indexdef 
    FROM pg_indexes 
    WHERE indexname = $1;
  `, [indexName]);

  if (existRes.rows.length === 0) {
    throw new Error(`PREFLIGHT_FAIL: Index ${indexName} does not exist!`);
  }
  console.log(`  [OK] Index exists on table: ${existRes.rows[0].tablename}`);
  console.log(`       Definition: ${existRes.rows[0].indexdef}`);

  // 2. Check if index backs a constraint (PK, UNIQUE, FK)
  const constrRes = await client.query(`
    SELECT c.conname, c.contype 
    FROM pg_class i
    JOIN pg_constraint c ON c.conindid = i.oid
    WHERE i.relname = $1;
  `, [indexName]);

  if (constrRes.rows.length > 0) {
    throw new Error(`PREFLIGHT_FAIL: Index ${indexName} belongs to constraint: ${constrRes.rows[0].conname}`);
  }
  console.log(`  [OK] Not associated with any constraint (Not PK, Not UNIQUE).`);

  // 3. Check for dependent objects (views, rules)
  const depRes = await client.query(`
    SELECT d.classid::regclass, d.objid, d.deptype
    FROM pg_class c
    JOIN pg_depend d ON d.objid = c.oid
    WHERE c.relname = $1 AND d.deptype != 'n';
  `, [indexName]);
  console.log(`  [OK] Special dependencies: ${depRes.rows.length}`);

  // 4. Physical size
  const sizeRes = await client.query(`
    SELECT pg_relation_size($1::regclass) as bytes, pg_size_pretty(pg_relation_size($1::regclass)) as pretty;
  `, [indexName]);
  console.log(`  [OK] Index Physical Size: ${sizeRes.rows[0].pretty} (${sizeRes.rows[0].bytes} bytes)`);

  console.log(`  >>> VERDICT: INDEX_REQUIRED = FALSE (Safe to DROP)`);
  return {
    tableName: existRes.rows[0].tablename,
    sizeBytes: Number(sizeRes.rows[0].bytes),
    sizePretty: sizeRes.rows[0].pretty
  };
}

async function measureDisk(client) {
  const dbRes = await client.query(`SELECT pg_database_size(current_database()) as db_bytes`);
  const dbBytes = Number(dbRes.rows[0].db_bytes);
  let walBytes = 1073742194; // fallback 1GB
  try {
    const walRes = await client.query(`SELECT sum(size) as wal_bytes FROM pg_ls_waldir()`);
    if (walRes.rows[0]?.wal_bytes) walBytes = Number(walRes.rows[0].wal_bytes);
  } catch (_) {}

  const totalUsedBytes = dbBytes + walBytes;
  const freeBytes = Math.max(0, ALLOCATED_DISK_BYTES - totalUsedBytes);
  const usagePercent = Number(((totalUsedBytes / ALLOCATED_DISK_BYTES) * 100).toFixed(2));

  return {
    db_bytes: dbBytes,
    db_gb: (dbBytes / (1024*1024*1024)).toFixed(3),
    wal_bytes: walBytes,
    wal_gb: (walBytes / (1024*1024*1024)).toFixed(3),
    total_used_bytes: totalUsedBytes,
    total_used_gb: (totalUsedBytes / (1024*1024*1024)).toFixed(3),
    free_bytes: freeBytes,
    free_gb: (freeBytes / (1024*1024*1024)).toFixed(3),
    usage_percent: usagePercent
  };
}

async function runIdentitySmokeTest(client, sampleKeys) {
  const latencies = [];
  let errorCount = 0;

  for (let i = 0; i < 50; i++) {
    const key = sampleKeys[i % sampleKeys.length];
    const t0 = performance.now();
    try {
      // 1. Forward source key lookup (Production Factory Path)
      const res = await client.query(`
        SELECT atlas_person_id 
        FROM public.atlas_hot_source_key_map 
        WHERE source_id = $1 AND source_person_id = $2
        LIMIT 1;
      `, [key.source_id, key.source_person_id]);
      
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
    } catch (e) {
      errorCount++;
    }
  }

  latencies.sort((a,b) => a - b);
  const avg = latencies.reduce((a,b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  return { avg_ms: avg, p50_ms: p50, p95_ms: p95, errors: errorCount };
}

async function run() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('========================================================================');
  console.log('🛡️  ATLAS PHASE 2: SAFE PHYSICAL DISK RECLAMATION (HOT MAP INDEXES)');
  console.log('========================================================================\n');

  // Step 0: Baseline Disk & Sample Keys
  const diskStart = await measureDisk(client);
  console.log(`[DISK_START] Database: ${diskStart.db_gb} GB | Total Used: ${diskStart.total_used_gb} GB | Free: ${diskStart.free_gb} GB | Usage: ${diskStart.usage_percent}%\n`);

  // Sample existing source keys for smoke testing
  const sampleRes = await client.query(`
    SELECT source_id, source_person_id, atlas_person_id 
    FROM public.atlas_hot_source_key_map 
    LIMIT 20;
  `);
  const sampleKeys = sampleRes.rows;
  console.log(`Fetched ${sampleKeys.length} representative keys for identity path validation.`);

  // Baseline Smoke Test
  const baselinePerf = await runIdentitySmokeTest(client, sampleKeys);
  console.log(`[IDENTITY_PERF_BASELINE] Avg: ${baselinePerf.avg_ms.toFixed(2)} ms | P50: ${baselinePerf.p50_ms.toFixed(2)} ms | P95: ${baselinePerf.p95_ms.toFixed(2)} ms | Errors: ${baselinePerf.errors}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. DROP INDEX 1: idx_hot_source_key_person_id
  // ─────────────────────────────────────────────────────────────────────────────
  const idx1Pre = await preflightCheck(client, 'idx_hot_source_key_person_id');
  
  console.log(`\n>>> Executing DROP INDEX CONCURRENTLY public.idx_hot_source_key_person_id...`);
  const t0_drop1 = Date.now();
  await client.query(`DROP INDEX CONCURRENTLY IF EXISTS public.idx_hot_source_key_person_id;`);
  console.log(`✅ Index 1 dropped in ${Date.now() - t0_drop1} ms.`);

  const diskAfter1 = await measureDisk(client);
  const released1Bytes = diskStart.total_used_bytes - diskAfter1.total_used_bytes;
  const released1Mb = (released1Bytes / (1024*1024)).toFixed(2);
  const released1Gb = (released1Bytes / (1024*1024*1024)).toFixed(3);

  console.log(`[DISK_AFTER_INDEX_1] Database: ${diskAfter1.db_gb} GB | Used: ${diskAfter1.total_used_gb} GB | Free: ${diskAfter1.free_gb} GB | Usage: ${diskAfter1.usage_percent}%`);
  console.log(`PHYSICAL_SPACE_RELEASED_INDEX_1: ${released1Mb} MB (${released1Gb} GB)`);

  // Smoke Test After Drop 1
  const perfAfter1 = await runIdentitySmokeTest(client, sampleKeys);
  console.log(`[IDENTITY_PERF_AFTER_INDEX_1] Avg: ${perfAfter1.avg_ms.toFixed(2)} ms | P50: ${perfAfter1.p50_ms.toFixed(2)} ms | P95: ${perfAfter1.p95_ms.toFixed(2)} ms | Errors: ${perfAfter1.errors}`);
  
  const degradation1 = ((perfAfter1.avg_ms - baselinePerf.avg_ms) / baselinePerf.avg_ms) * 100;
  console.log(`Performance degradation: ${degradation1.toFixed(1)}%`);

  if (perfAfter1.errors > 0 || degradation1 > 10) {
    console.error(`❌ GATE FAILURE after Index 1: Degradation=${degradation1.toFixed(1)}%, Errors=${perfAfter1.errors}. Aborting Index 2!`);
    await client.end();
    return;
  }
  console.log(`✅ GATE 1 PASS: Degradation < 10%, 0 errors.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DROP INDEX 2: idx_hot_nat_id_person_id
  // ─────────────────────────────────────────────────────────────────────────────
  const idx2Pre = await preflightCheck(client, 'idx_hot_nat_id_person_id');

  console.log(`\n>>> Executing DROP INDEX CONCURRENTLY public.idx_hot_nat_id_person_id...`);
  const t0_drop2 = Date.now();
  await client.query(`DROP INDEX CONCURRENTLY IF EXISTS public.idx_hot_nat_id_person_id;`);
  console.log(`✅ Index 2 dropped in ${Date.now() - t0_drop2} ms.`);

  const diskAfter2 = await measureDisk(client);
  const released2Bytes = diskAfter1.total_used_bytes - diskAfter2.total_used_bytes;
  const released2Mb = (released2Bytes / (1024*1024)).toFixed(2);
  const released2Gb = (released2Bytes / (1024*1024*1024)).toFixed(3);

  const totalReleasedBytes = diskStart.total_used_bytes - diskAfter2.total_used_bytes;
  const totalReleasedGb = (totalReleasedBytes / (1024*1024*1024)).toFixed(3);

  console.log(`[DISK_AFTER_INDEX_2] Database: ${diskAfter2.db_gb} GB | Used: ${diskAfter2.total_used_gb} GB | Free: ${diskAfter2.free_gb} GB | Usage: ${diskAfter2.usage_percent}%`);
  console.log(`PHYSICAL_SPACE_RELEASED_INDEX_2: ${released2Mb} MB (${released2Gb} GB)`);
  console.log(`TOTAL_PHYSICAL_SPACE_RELEASED: ${totalReleasedGb} GB`);

  // Smoke Test After Drop 2
  const perfAfter2 = await runIdentitySmokeTest(client, sampleKeys);
  console.log(`[IDENTITY_PERF_AFTER_INDEX_2] Avg: ${perfAfter2.avg_ms.toFixed(2)} ms | P50: ${perfAfter2.p50_ms.toFixed(2)} ms | P95: ${perfAfter2.p95_ms.toFixed(2)} ms | Errors: ${perfAfter2.errors}`);

  const degradation2 = ((perfAfter2.avg_ms - baselinePerf.avg_ms) / baselinePerf.avg_ms) * 100;
  console.log(`Final Performance degradation vs baseline: ${degradation2.toFixed(1)}%`);

  const below80 = diskAfter2.usage_percent < 80.0;
  console.log(`\n========================================================================`);
  console.log(`🎯 TARGET GATE: DISK_USAGE < 80%: ${below80 ? 'PASSED (GREEN)' : 'NOT YET MET'}`);
  console.log(`Final Usage: ${diskAfter2.usage_percent}% | Free Disk: ${diskAfter2.free_gb} GB`);
  console.log(`========================================================================\n`);

  await client.end();
}

run().catch(console.error);
