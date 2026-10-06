import fs from 'node:fs';
import pg from 'pg';
import { runP21Benchmark } from './run_perf_p21_benchmarks.mjs';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function prewarmIndexes() {
  console.log('\n--- EXECUTING CONTROLLED READ-ONLY PREWARM OF IDENTITY INDEXES ---');
  const pool = new pg.Pool(parseDbUrl());
  const t0 = performance.now();
  try {
    // Read through idx_identity_map_identifier
    console.log('Scanning idx_identity_map_identifier...');
    await pool.query(`
      SELECT count(*) 
      FROM atlas_person_identity_map 
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC' 
      AND identifier_value LIKE 'a%'
    `);
    // Read through uq_person_identity_source
    console.log('Scanning uq_person_identity_source...');
    await pool.query(`
      SELECT count(*) 
      FROM atlas_person_identity_map 
      WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' 
      AND source_person_id LIKE 'rec_arca_20%'
    `);
  } finally {
    await pool.end();
  }
  const prewarmMs = performance.now() - t0;
  console.log(`Prewarm complete in ${prewarmMs.toFixed(1)} ms.\n`);
}

async function main() {
  console.log('================================================================');
  console.log('🏆 ATLAS STAGE P2.1 — COMPREHENSIVE PERFORMANCE EVALUATION');
  console.log('GOAL: BREAK 555.56 NEW/SEC -> TARGET >= 560 NEW/SEC');
  console.log('================================================================\n');

  const matrixResults = [];

  // Configuration S1: workers=1, batch=2000
  console.log('\n>>> RUNNING S1: workers=1, batch=2000 <<<');
  const resS1 = await runP21Benchmark({
    configName: 'S1_w1_b2000',
    workers: 1,
    batchSize: 2000,
    startLine: 2280000,
    limit: 50000
  });
  matrixResults.push(resS1);

  // Configuration S2: workers=1, batch=4000
  console.log('\n>>> RUNNING S2: workers=1, batch=4000 <<<');
  const resS2 = await runP21Benchmark({
    configName: 'S2_w1_b4000',
    workers: 1,
    batchSize: 4000,
    startLine: 2340000,
    limit: 50000
  });
  matrixResults.push(resS2);

  // Configuration S3: workers=1, batch=8000
  console.log('\n>>> RUNNING S3: workers=1, batch=8000 <<<');
  const resS3 = await runP21Benchmark({
    configName: 'S3_w1_b8000',
    workers: 1,
    batchSize: 8000,
    startLine: 2400000,
    limit: 50000
  });
  matrixResults.push(resS3);

  // Controlled Prewarm Test: Warm indexes, then run matched cohort
  // We match S2 (b=4000) or S1 to compare Cold/Warm Baseline vs Prewarmed
  await prewarmIndexes();
  console.log('\n>>> RUNNING S_PREWARMED: workers=1, batch=4000 (PREWARMED) <<<');
  const resPrewarmed = await runP21Benchmark({
    configName: 'S2_w1_b4000_prewarmed',
    workers: 1,
    batchSize: 4000,
    startLine: 2460000,
    limit: 50000
  });
  matrixResults.push(resPrewarmed);

  // Reference winner P2-B for comparison
  const p2bRef = {
    CONFIG_NAME: 'P2_B_w2_b2000_ref',
    WORKERS: 2,
    BATCH_SIZE: 2000,
    CAND_SEC: 489.85,
    NEW_SEC: 477.22,
    BATCH_P50: 7554.91,
    BATCH_P95: 9314.17,
    PG_IDENTITY_WRITE_P50: 3820.97,
    PG_IDENTITY_WRITE_P95: 5128.84,
    PG_OUTBOX_WRITE_P50: 1401.35,
    PG_OUTBOX_WRITE_P95: 1849.11,
    COMMIT_P50: 178.65,
    COMMIT_P95: 201.35,
    DATA_FILE_READ_WAIT_SEC: 38.4,
    BUFFER_HITS: 421050,
    PHYSICAL_READS: 18230,
    WAL_BYTES: 49820000,
    BACKPRESSURE_WALL_PERCENT: 0
  };

  // Find best configuration among single-writer tests
  const sorted = [...matrixResults].sort((a, b) => b.NEW_SEC - a.NEW_SEC);
  const bestSingleWriter = sorted[0];

  const report = {
    timestamp: new Date().toISOString(),
    stage: 'atlas_perf_1m30_p21_matrix',
    winner_P2B_baseline: p2bRef,
    single_writer_matrix: matrixResults,
    BEST_SINGLE_WRITER: bestSingleWriter,
    PREWARM_COMPARISON: {
      BASELINE_S2_UNWARMED: resS2,
      PREWARMED_S2: resPrewarmed,
      NEW_SEC_SPEEDUP: Number((resPrewarmed.NEW_SEC / resS2.NEW_SEC).toFixed(2)),
      PHYSICAL_READS_DELTA: resPrewarmed.PHYSICAL_READS - resS2.PHYSICAL_READS,
      BUFFER_HITS_DELTA: resPrewarmed.BUFFER_HITS - resS2.BUFFER_HITS,
      DATA_FILE_READ_WAIT_DELTA_SEC: Number((resPrewarmed.DATA_FILE_READ_WAIT_SEC - resS2.DATA_FILE_READ_WAIT_SEC).toFixed(2))
    }
  };

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    'reports/atlas/discovery/atlas_perf_1m30_p21_single_writer_matrix_v1.json',
    JSON.stringify(report, null, 2)
  );

  console.log('\n================================================================');
  console.log('🏆 STAGE P2.1 EVALUATION MATRIX COMPLETE:');
  console.log(`CURRENT WINNER P2-B (w=2, b=2000): ${p2bRef.NEW_SEC} NEW/sec`);
  console.log(`S1 (w=1, b=2000): ${resS1.NEW_SEC} NEW/sec`);
  console.log(`S2 (w=1, b=4000): ${resS2.NEW_SEC} NEW/sec`);
  console.log(`S3 (w=1, b=8000): ${resS3.NEW_SEC} NEW/sec`);
  console.log(`S2 PREWARMED:     ${resPrewarmed.NEW_SEC} NEW/sec`);
  console.log(`BEST CONFIG: ${bestSingleWriter.CONFIG_NAME} (${bestSingleWriter.NEW_SEC} NEW/sec)`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal Master Evaluation Error:', err);
  process.exit(1);
});
