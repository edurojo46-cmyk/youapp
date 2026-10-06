import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

function calcPercentiles(arr) {
  if (!arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function main() {
  console.log('================================================================');
  console.log('🧪 EXPERIMENT: QUANTIFY SECONDARY INDEX WRITE COST IN SHADOW ONLY');
  console.log('Target Index: idx_identity_map_atlas_person_id');
  console.log('================================================================\n');

  const pool = new pg.Pool(parseDbUrl());

  try {
    // 1. Create two identical disposable shadow tables
    console.log('Creating disposable shadow tables...');
    await pool.query('DROP TABLE IF EXISTS shadow_identity_full, shadow_identity_no_sec');
    
    // Full table with all 4 indexes
    await pool.query(`
      CREATE TABLE shadow_identity_full (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        atlas_person_id text NOT NULL,
        source_id text NOT NULL,
        source_person_id text NOT NULL,
        identifier_type text NOT NULL,
        identifier_value text NOT NULL,
        evidence_id text,
        confidence double precision,
        resolution_method text,
        observed_at timestamp with time zone,
        CONSTRAINT uq_shadow_full_source UNIQUE (source_id, source_person_id)
      )
    `);
    await pool.query('CREATE INDEX idx_shadow_full_ident ON shadow_identity_full (identifier_type, identifier_value)');
    await pool.query('CREATE INDEX idx_shadow_full_sec_atlas_id ON shadow_identity_full (atlas_person_id)');

    // No-sec table with only 3 indexes (omitting secondary index on atlas_person_id)
    await pool.query(`
      CREATE TABLE shadow_identity_no_sec (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        atlas_person_id text NOT NULL,
        source_id text NOT NULL,
        source_person_id text NOT NULL,
        identifier_type text NOT NULL,
        identifier_value text NOT NULL,
        evidence_id text,
        confidence double precision,
        resolution_method text,
        observed_at timestamp with time zone,
        CONSTRAINT uq_shadow_no_sec_source UNIQUE (source_id, source_person_id)
      )
    `);
    await pool.query('CREATE INDEX idx_shadow_no_sec_ident ON shadow_identity_no_sec (identifier_type, identifier_value)');

    console.log('Shadow tables and indexes created successfully.');

    // 2. Generate test batches: 10 batches of 2,000 rows = 20,000 rows total
    const TEST_BATCHES = 10;
    const BATCH_SIZE = 2000;
    const testData = [];

    for (let b = 0; b < TEST_BATCHES; b++) {
      const ids = [], sources = [], pids = [], types = [], vals = [], evs = [], confs = [], resMethods = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        ids.push(`atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`);
        sources.push('ARCA_CONDICION_TRIBUTARIA');
        pids.push(`rec_shadow_${b}_${i}_${crypto.randomBytes(4).toString('hex')}`);
        types.push('NATIONAL_IDENTITY_HMAC');
        vals.push(crypto.randomBytes(32).toString('hex'));
        evs.push('ev_test');
        confs.push(1.0);
        resMethods.push('DETERMINISTIC');
      }
      testData.push({ ids, sources, pids, types, vals, evs, confs, resMethods });
    }

    console.log(`Generated ${TEST_BATCHES} batches of ${BATCH_SIZE} candidate rows (20,000 total).`);

    // Helper to measure insertion workload on a target table
    async function benchmarkTable(tableName, hasSecondaryIndex) {
      console.log(`\n--- Benchmarking ${tableName} (Has Secondary Index: ${hasSecondaryIndex}) ---`);
      
      // I/O & WAL Snapshot Before
      const snap0 = await pool.query(`
        SELECT 
          coalesce(sum(idx_blks_read), 0)::bigint as idx_reads,
          coalesce(sum(idx_blks_hit), 0)::bigint as idx_hits
        FROM pg_statio_user_indexes
        WHERE relname = $1
      `, [tableName]);
      const wal0 = await pool.query('SELECT pg_current_wal_lsn() as lsn');

      const latencies = [];
      const tStart = performance.now();

      for (let b = 0; b < TEST_BATCHES; b++) {
        const batch = testData[b];
        const t0 = performance.now();
        await pool.query(`
          INSERT INTO ${tableName} (
            atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
            evidence_id, confidence, resolution_method, observed_at
          )
          SELECT * FROM UNNEST(
            $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
            $6::text[], $7::float[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])])
          )
          ON CONFLICT (source_id, source_person_id) DO NOTHING
        `, [
          batch.ids, batch.sources, batch.pids, batch.types, batch.vals,
          batch.evs, batch.confs, batch.resMethods
        ]);
        latencies.push(performance.now() - t0);
      }

      const totalWallSec = (performance.now() - tStart) / 1000;
      const totalRows = TEST_BATCHES * BATCH_SIZE;
      const newSec = totalRows / totalWallSec;

      // I/O & WAL Snapshot After
      const snap1 = await pool.query(`
        SELECT 
          coalesce(sum(idx_blks_read), 0)::bigint as idx_reads,
          coalesce(sum(idx_blks_hit), 0)::bigint as idx_hits
        FROM pg_statio_user_indexes
        WHERE relname = $1
      `, [tableName]);
      const wal1 = await pool.query(`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as wal_bytes`, [wal0.rows[0].lsn]);

      const idxReadsDelta = Number(BigInt(snap1.rows[0].idx_reads) - BigInt(snap0.rows[0].idx_reads));
      const idxHitsDelta = Number(BigInt(snap1.rows[0].idx_hits) - BigInt(snap0.rows[0].idx_hits));
      const walBytes = Number(wal1.rows[0].wal_bytes);
      const p = calcPercentiles(latencies);

      const result = {
        tableName,
        hasSecondaryIndex,
        totalRows,
        totalWallSec: Number(totalWallSec.toFixed(2)),
        newSec: Number(newSec.toFixed(2)),
        identityWriteP50Ms: p.P50,
        identityWriteP95Ms: p.P95,
        walBytes,
        idxReadsDelta,
        idxHitsDelta
      };

      console.log(`Results for ${tableName}:`);
      console.log(`  NEW_SEC: ${result.newSec} | Wall: ${result.totalWallSec}s | P50: ${result.identityWriteP50Ms}ms | P95: ${result.identityWriteP95Ms}ms`);
      console.log(`  WAL_BYTES: ${result.walBytes} | IDX_READS: ${result.idxReadsDelta} | IDX_HITS: ${result.idxHitsDelta}`);

      return result;
    }

    // Benchmark A: Full (all 4 indexes)
    const resFull = await benchmarkTable('shadow_identity_full', true);

    // Benchmark B: No-Sec (omitting idx_identity_map_atlas_person_id)
    const resNoSec = await benchmarkTable('shadow_identity_no_sec', false);

    // Calculate Write Cost Delta
    const latencyReductionPercent = Number((((resFull.identityWriteP50Ms - resNoSec.identityWriteP50Ms) / resFull.identityWriteP50Ms) * 100).toFixed(2));
    const throughputGainPercent = Number((((resNoSec.newSec - resFull.newSec) / resFull.newSec) * 100).toFixed(2));
    const walReductionPercent = Number((((resFull.walBytes - resNoSec.walBytes) / resFull.walBytes) * 100).toFixed(2));

    const finalReport = {
      timestamp: new Date().toISOString(),
      stage: 'atlas_perf_1m30_p22_shadow_index_cost',
      BENCHMARK_FULL_4_INDEXES: resFull,
      BENCHMARK_WITHOUT_SECONDARY_INDEX: resNoSec,
      COMPARISON: {
        LATENCY_REDUCTION_PERCENT: latencyReductionPercent,
        THROUGHPUT_GAIN_PERCENT: throughputGainPercent,
        WAL_REDUCTION_PERCENT: walReductionPercent,
        SECONDARY_INDEX_WRITE_COST_PERCENT: throughputGainPercent,
        IS_MATERIAL_IMPROVEMENT: throughputGainPercent > 10.0
      }
    };

    console.log('\n================================================================');
    console.log('📊 SHADOW SECONDARY INDEX COST VERDICT:');
    console.log(`Full 4 Indexes NEW_SEC:            ${resFull.newSec}`);
    console.log(`Without Secondary Index NEW_SEC:   ${resNoSec.newSec}`);
    console.log(`Throughput Gain:                   +${throughputGainPercent}%`);
    console.log(`Identity Write P50 Latency Drop:   ${latencyReductionPercent}%`);
    console.log(`WAL Bytes Reduction:               ${walReductionPercent}%`);
    console.log(`Material Improvement (>10%):       ${finalReport.COMPARISON.IS_MATERIAL_IMPROVEMENT}`);
    console.log('================================================================\n');

    // Save report artifact
    await import('node:fs').then(fs => fs.promises.writeFile(
      'reports/atlas/discovery/atlas_perf_1m30_p22_shadow_index_cost_v1.json',
      JSON.stringify(finalReport, null, 2)
    ));

    // Clean up disposable shadow tables
    console.log('Dropping disposable shadow tables...');
    await pool.query('DROP TABLE IF EXISTS shadow_identity_full, shadow_identity_no_sec');
    console.log('Cleanup complete.');

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal Shadow Experiment Error:', err);
  process.exit(1);
});
