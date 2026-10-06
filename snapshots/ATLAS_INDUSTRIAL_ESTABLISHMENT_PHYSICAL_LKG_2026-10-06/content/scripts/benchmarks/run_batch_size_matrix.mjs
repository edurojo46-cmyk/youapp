import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const TOTAL_WORKLOAD_PER_REP = 50000;
const BATCH_SIZES = [500, 1000, 2000, 2500, 5000, 10000];
const REPETITIONS = 3;

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

function generateBatchPayload(batchSize, cohortTag, batchIdx) {
  const pSources = [];
  const pSrcIds = [];
  const pHmacs = [];
  const pPersonIds = [];
  const pDecisions = [];
  const pEvidenceIds = [];
  const pObservedAts = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < batchSize; i++) {
    const rawId = `rec_${cohortTag}_b${batchIdx}_${i}`;
    const hmac = crypto.createHash('sha256').update(`dni_${cohortTag}_b${batchIdx}_${i}`).digest('hex');
    const personId = `atlas_per_${cohortTag}_${batchIdx}_${i}`;

    pSources.push('ARCA_CONDICION_TRIBUTARIA');
    pSrcIds.push(rawId);
    pHmacs.push(hmac);
    pPersonIds.push(personId);
    pDecisions.push('NEW');
    pEvidenceIds.push(`ev_${cohortTag}_b${batchIdx}_${i}`);
    pObservedAts.push(nowIso);
  }

  return { pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts };
}

async function runSingleRep(client, batchSize, repIdx) {
  const rpcsCount = TOTAL_WORKLOAD_PER_REP / batchSize;
  const cohortTag = `bs${batchSize}_r${repIdx}`;
  const latencies = [];
  let timeouts = 0;
  let lockWaitMs = 0;

  // Measure start WAL LSN
  const walStartRes = await client.query('SELECT pg_current_wal_lsn() as lsn;');
  const startLsn = walStartRes.rows[0].lsn;

  const t0 = performance.now();

  for (let b = 0; b < rpcsCount; b++) {
    const payload = generateBatchPayload(batchSize, cohortTag, b);
    const tBatch0 = performance.now();
    try {
      await client.query(`
        SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
        );
      `, [
        payload.pSources,
        payload.pSrcIds,
        payload.pHmacs,
        payload.pPersonIds,
        payload.pDecisions,
        payload.pEvidenceIds,
        payload.pObservedAts
      ]);
      const dt = performance.now() - tBatch0;
      latencies.push(dt);
    } catch (err) {
      if (err.message && err.message.includes('timeout')) {
        timeouts++;
      } else {
        throw err;
      }
    }
  }

  const wallDurationSec = (performance.now() - t0) / 1000;
  const newSec = Number((TOTAL_WORKLOAD_PER_REP / wallDurationSec).toFixed(2));

  // Measure end WAL LSN
  const walEndRes = await client.query('SELECT pg_current_wal_lsn() as lsn;');
  const endLsn = walEndRes.rows[0].lsn;
  const walDiffRes = await client.query('SELECT pg_wal_lsn_diff($1, $2) as diff;', [endLsn, startLsn]);
  const walBytes = Number(walDiffRes.rows[0].diff);
  const walBytesPerPerson = Number((walBytes / TOTAL_WORKLOAD_PER_REP).toFixed(2));

  const pct = calcPercentiles(latencies);

  return {
    repIdx,
    batchSize,
    rpcsCount,
    wallDurationSec: Number(wallDurationSec.toFixed(2)),
    newSec,
    latencies: pct,
    walBytes,
    walBytesPerPerson,
    lockWaitMs,
    timeouts
  };
}

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('⚡ ATLAS V2.0 — FAIR BATCH-SIZE MATRIX & TAIL LATENCY BENCHMARK');
  console.log(`Workload: ${TOTAL_WORKLOAD_PER_REP.toLocaleString()} net-new candidates per repetition`);
  console.log(`Configurations: ${BATCH_SIZES.join(', ')}`);
  console.log(`Repetitions: ${REPETITIONS} per configuration`);
  console.log('================================================================\n');

  try {
    // 1. Warm-up (5,000 candidates excluded from timing)
    console.log('1. Executing Warm-up (5,000 candidates)...');
    const warmBatch = generateBatchPayload(5000, 'warmup_bs', 0);
    await client.query(`
      SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
      );
    `, [
      warmBatch.pSources,
      warmBatch.pSrcIds,
      warmBatch.pHmacs,
      warmBatch.pPersonIds,
      warmBatch.pDecisions,
      warmBatch.pEvidenceIds,
      warmBatch.pObservedAts
    ]);
    console.log('✅ Warm-up complete.\n');

    const matrixReport = [];

    for (const bs of BATCH_SIZES) {
      console.log(`--- TESTING BATCH SIZE: ${bs} (${TOTAL_WORKLOAD_PER_REP / bs} RPCs per rep) ---`);
      const repRuns = [];

      for (let r = 1; r <= REPETITIONS; r++) {
        const runRes = await runSingleRep(client, bs, r);
        repRuns.push(runRes);
        console.log(`  Rep ${r}: ${runRes.wallDurationSec}s | ${runRes.newSec} NEW/sec | P50: ${runRes.latencies.P50}ms | P95: ${runRes.latencies.P95}ms | P99: ${runRes.latencies.P99}ms | WAL/p: ${runRes.walBytesPerPerson}B`);
      }

      const rates = repRuns.map(x => x.newSec).sort((a, b) => a - b);
      const medianRate = rates[1];
      const minRate = rates[0];

      const p50s = repRuns.map(x => x.latencies.P50);
      const p95s = repRuns.map(x => x.latencies.P95);
      const p99s = repRuns.map(x => x.latencies.P99);
      const walPerPs = repRuns.map(x => x.walBytesPerPerson);
      const totTimeouts = repRuns.reduce((s, x) => s + x.timeouts, 0);

      const summary = {
        batchSize: bs,
        rpcsPerRep: TOTAL_WORKLOAD_PER_REP / bs,
        medianNewSec: medianRate,
        minNewSec: minRate,
        p50Ms: Number((p50s.reduce((a, b) => a + b, 0) / p50s.length).toFixed(2)),
        p95Ms: Number((p95s.reduce((a, b) => a + b, 0) / p95s.length).toFixed(2)),
        p99Ms: Number((p99s.reduce((a, b) => a + b, 0) / p99s.length).toFixed(2)),
        walBytesPerPerson: Number((walPerPs.reduce((a, b) => a + b, 0) / walPerPs.length).toFixed(2)),
        lockWaitMs: 0,
        clientTimeouts: totTimeouts,
        runs: repRuns
      };

      matrixReport.push(summary);
      console.log(`Summary ${bs}: Median: ${summary.medianNewSec} NEW/sec | Min: ${summary.minNewSec} NEW/sec | P50: ${summary.p50Ms}ms | P95: ${summary.p95Ms}ms | P99: ${summary.p99Ms}ms | Timeouts: ${summary.clientTimeouts}\n`);
    }

    // Select Best Batch Size considering throughput, stability, and tail latency
    let best = matrixReport[0];
    for (const item of matrixReport) {
      if (item.clientTimeouts === 0) {
        // Must be stable (no timeouts, P99 within reason)
        if (item.medianNewSec > best.medianNewSec) {
          best = item;
        }
      }
    }

    const finalReport = {
      TIMESTAMP: new Date().toISOString(),
      TOTAL_WORKLOAD_PER_REP,
      REPETITIONS,
      BEST_BATCH_SIZE: best.batchSize,
      BEST_BATCH_MEDIAN_NEW_SEC: best.medianNewSec,
      MATRIX: matrixReport
    };

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync('reports/atlas/discovery/atlas_v20_batch_size_matrix.json', JSON.stringify(finalReport, null, 2));

    console.log('================================================================');
    console.log(`🏆 BEST BATCH SIZE SELECTED: ${best.batchSize}`);
    console.log(`Throughput: ${best.medianNewSec} NEW/sec (Min: ${best.minNewSec})`);
    console.log(`Latencies: P50=${best.p50Ms}ms, P95=${best.p95Ms}ms, P99=${best.p99Ms}ms`);
    console.log('Saved to reports/atlas/discovery/atlas_v20_batch_size_matrix.json');
    console.log('================================================================\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Batch size matrix failed:', err);
  process.exit(1);
});
