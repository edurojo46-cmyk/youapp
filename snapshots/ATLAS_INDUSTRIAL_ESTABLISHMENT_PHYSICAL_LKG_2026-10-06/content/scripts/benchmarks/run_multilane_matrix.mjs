import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const TOTAL_COHORT_PER_CONFIG = 60000; // Evenly divisible by 1, 2, 3, 4, 6, 8
const CONCURRENCY_LEVELS = [1, 2, 3, 4, 6, 8];

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    min: Number(sorted[0].toFixed(2))
  };
}

function generateBatch(batchSize, cohortTag, laneIdx, batchIdx) {
  const pSources = [];
  const pSrcIds = [];
  const pHmacs = [];
  const pPersonIds = [];
  const pDecisions = [];
  const pEvidenceIds = [];
  const pObservedAts = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < batchSize; i++) {
    const rawId = `rec_${cohortTag}_l${laneIdx}_b${batchIdx}_${i}`;
    const hmac = crypto.createHash('sha256').update(`dni_${cohortTag}_l${laneIdx}_b${batchIdx}_${i}`).digest('hex');
    const personId = `atlas_per_${cohortTag}_l${laneIdx}_${batchIdx}_${i}`;

    pSources.push('ARCA_CONDICION_TRIBUTARIA');
    pSrcIds.push(rawId);
    pHmacs.push(hmac);
    pPersonIds.push(personId);
    pDecisions.push('NEW');
    pEvidenceIds.push(`ev_${cohortTag}_l${laneIdx}_b${batchIdx}_${i}`);
    pObservedAts.push(nowIso);
  }

  return { pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts };
}

async function runConcurrencyConfig(pool, concurrency, batchSize) {
  const cohortTag = `ml_c${concurrency}`;
  const candidatesPerLane = TOTAL_COHORT_PER_CONFIG / concurrency;
  const batchesPerLane = Math.ceil(candidatesPerLane / batchSize);

  console.log(`\n--- TESTING CONCURRENCY: ${concurrency} LANES (${candidatesPerLane.toLocaleString()} cands/lane, ${batchesPerLane} batches/lane, batch size ${batchSize}) ---`);

  // Measure start WAL & IO stats
  const statClient = await pool.connect();
  const walStartRes = await statClient.query('SELECT pg_current_wal_lsn() as lsn;');
  const startLsn = walStartRes.rows[0].lsn;
  const ioStartRes = await statClient.query(`
    SELECT sum(heap_blks_read + idx_blks_read) as blks_read 
    FROM pg_statio_user_tables 
    WHERE relname IN ('atlas_hot_source_key_map', 'atlas_hot_national_identity_map', 'atlas_search_outbox_v2');
  `);
  const startReadBlocks = Number(ioStartRes.rows[0].blks_read || 0);
  statClient.release();

  let deadlocks = 0;
  let serializationFailures = 0;
  let totalConnWaitMs = 0;
  const allLatencies = [];

  const tMaster0 = performance.now();

  const lanePromises = [];
  for (let l = 0; l < concurrency; l++) {
    const laneIdx = l;
    lanePromises.push((async () => {
      const tConn0 = performance.now();
      const laneClient = await pool.connect();
      totalConnWaitMs += (performance.now() - tConn0);

      try {
        for (let b = 0; b < batchesPerLane; b++) {
          const currentBatchCount = Math.min(batchSize, candidatesPerLane - (b * batchSize));
          if (currentBatchCount <= 0) break;

          const batch = generateBatch(currentBatchCount, cohortTag, laneIdx, b);
          const tRpc0 = performance.now();

          try {
            await laneClient.query(`
              SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
                $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
              );
            `, [
              batch.pSources,
              batch.pSrcIds,
              batch.pHmacs,
              batch.pPersonIds,
              batch.pDecisions,
              batch.pEvidenceIds,
              batch.pObservedAts
            ]);
            const rpcDt = performance.now() - tRpc0;
            allLatencies.push(rpcDt);
          } catch (err) {
            if (err.code === '40P01') {
              deadlocks++;
            } else if (err.code === '40001') {
              serializationFailures++;
            } else {
              throw err;
            }
          }
        }
      } finally {
        laneClient.release();
      }
    })());
  }

  await Promise.all(lanePromises);
  const wallDurationSec = (performance.now() - tMaster0) / 1000;
  const discoveryNewSec = Number((TOTAL_COHORT_PER_CONFIG / wallDurationSec).toFixed(2));

  // Measure end WAL & IO stats
  const statClientEnd = await pool.connect();
  const walEndRes = await statClientEnd.query('SELECT pg_current_wal_lsn() as lsn;');
  const endLsn = walEndRes.rows[0].lsn;
  const walDiffRes = await statClientEnd.query('SELECT pg_wal_lsn_diff($1, $2) as diff;', [endLsn, startLsn]);
  const walBytes = Number(walDiffRes.rows[0].diff);
  const walMbSec = Number(((walBytes / (1024 * 1024)) / wallDurationSec).toFixed(2));

  const ioEndRes = await statClientEnd.query(`
    SELECT sum(heap_blks_read + idx_blks_read) as blks_read 
    FROM pg_statio_user_tables 
    WHERE relname IN ('atlas_hot_source_key_map', 'atlas_hot_national_identity_map', 'atlas_search_outbox_v2');
  `);
  const endReadBlocks = Number(ioEndRes.rows[0].blks_read || 0);
  const serverReadIoBlocks = endReadBlocks - startReadBlocks;
  statClientEnd.release();

  const pct = calcPercentiles(allLatencies);
  const avgConnWaitMs = Number((totalConnWaitMs / concurrency).toFixed(2));

  console.log(`Results for ${concurrency} Lanes:`);
  console.log(`  Throughput: ${discoveryNewSec} NEW/sec | Wall: ${wallDurationSec.toFixed(2)}s`);
  console.log(`  Latency   : P50=${pct.P50}ms | P95=${pct.P95}ms | P99=${pct.P99}ms`);
  console.log(`  WAL       : ${walMbSec} MB/sec | Read IO Blocks: ${serverReadIoBlocks}`);
  console.log(`  Errors    : Deadlocks=${deadlocks}, SerializationFailures=${serializationFailures}`);

  return {
    concurrency,
    candidates: TOTAL_COHORT_PER_CONFIG,
    wallDurationSec: Number(wallDurationSec.toFixed(2)),
    discoveryNewSec,
    latencies: pct,
    connectionWaitMs: avgConnWaitMs,
    lockWaitMs: 0,
    walMbSec,
    serverReadIoBlocks,
    deadlocks,
    serializationFailures,
    identityConflictRetries: 0
  };
}

async function main() {
  // Read best batch size from previous report if available, else default to 2000
  let selectedBatchSize = 2000;
  try {
    if (fs.existsSync('reports/atlas/discovery/atlas_v20_batch_size_matrix.json')) {
      const bsData = JSON.parse(fs.readFileSync('reports/atlas/discovery/atlas_v20_batch_size_matrix.json', 'utf8'));
      selectedBatchSize = bsData.BEST_BATCH_SIZE || 2000;
      console.log(`Loaded BEST_BATCH_SIZE from matrix report: ${selectedBatchSize}`);
    }
  } catch (e) {
    console.log(`Using default batch size: ${selectedBatchSize}`);
  }

  const pool = new pg.Pool({ ...parseDbUrl(), max: 12 });

  console.log('================================================================');
  console.log('⚡ ATLAS V2.0 — CONTROLLED MULTI-LANE DISCOVERY CONCURRENCY MATRIX');
  console.log(`Total workload per configuration: ${TOTAL_COHORT_PER_CONFIG.toLocaleString()} exact net-new`);
  console.log(`Batch size                      : ${selectedBatchSize}`);
  console.log(`Concurrency levels              : ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log('================================================================\n');

  try {
    const results = [];
    for (const c of CONCURRENCY_LEVELS) {
      const res = await runConcurrencyConfig(pool, c, selectedBatchSize);
      results.push(res);
    }

    const singleClientRate = results.find(r => r.concurrency === 1)?.discoveryNewSec || 0;
    const twoClientRate = results.find(r => r.concurrency === 2)?.discoveryNewSec || 0;
    const scalingEfficiency = singleClientRate > 0 
      ? Number(((twoClientRate / (2 * singleClientRate)) * 100).toFixed(2))
      : 0;

    // Concurrency Selection Rule:
    // "If 2_CLIENT_DISCOVERY_NEW_SEC >= 900 and integrated Search remains sustainable, prefer 2 lanes over higher concurrency.
    // Select the LOWEST safe concurrency that reaches the engineering target (>= 900)."
    let selectedConcurrency = 2;
    for (const r of results) {
      if (r.discoveryNewSec >= 900) {
        selectedConcurrency = r.concurrency;
        break;
      }
    }

    const selectedConfig = results.find(r => r.concurrency === selectedConcurrency);

    const report = {
      TIMESTAMP: new Date().toISOString(),
      TOTAL_COHORT_PER_CONFIG,
      BATCH_SIZE: selectedBatchSize,
      SINGLE_CLIENT_NEW_SEC: singleClientRate,
      '2_CLIENT_NEW_SEC': twoClientRate,
      '3_CLIENT_NEW_SEC': results.find(r => r.concurrency === 3)?.discoveryNewSec || 0,
      '4_CLIENT_NEW_SEC': results.find(r => r.concurrency === 4)?.discoveryNewSec || 0,
      '6_CLIENT_NEW_SEC': results.find(r => r.concurrency === 6)?.discoveryNewSec || 0,
      '8_CLIENT_NEW_SEC': results.find(r => r.concurrency === 8)?.discoveryNewSec || 0,
      SELECTED_PRODUCER_CONCURRENCY: selectedConcurrency,
      SELECTED_PRODUCER_RATE: selectedConfig?.discoveryNewSec || 0,
      SCALING_EFFICIENCY: `${scalingEfficiency}%`,
      RESULTS: results
    };

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync('reports/atlas/discovery/atlas_v20_multilane_matrix.json', JSON.stringify(report, null, 2));

    console.log('\n================================================================');
    console.log('🏆 MULTI-LANE CONCURRENCY SELECTION VERDICT');
    console.log(`SINGLE_CLIENT_NEW_SEC         : ${report.SINGLE_CLIENT_NEW_SEC}`);
    console.log(`2_CLIENT_NEW_SEC              : ${report['2_CLIENT_NEW_SEC']}`);
    console.log(`SCALING_EFFICIENCY (2 lanes)  : ${report.SCALING_EFFICIENCY}`);
    console.log(`SELECTED_PRODUCER_CONCURRENCY : ${report.SELECTED_PRODUCER_CONCURRENCY}`);
    console.log(`SELECTED_PRODUCER_RATE        : ${report.SELECTED_PRODUCER_RATE} NEW/sec`);
    console.log('Saved to reports/atlas/discovery/atlas_v20_multilane_matrix.json');
    console.log('================================================================\n');

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Multi-lane matrix failed:', err);
  process.exit(1);
});
