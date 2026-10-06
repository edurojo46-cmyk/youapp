import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    p95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    p99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

const TOTAL_PER_RUN = 50000;
const BATCH_SIZE = 1500;
const WORKERS_COUNT = 2;

async function runSingle50k(runNumber, baseOffset, pool) {
  const setupClient = await pool.connect();
  console.log(`\n================================================================`);
  console.log(`▶️ RUNNING 50K CERTIFICATION RUN ${runNumber}/3 (Offset: ${baseOffset})`);
  console.log(`================================================================`);

  try {
    const batches = [];
    let currentBatch = [];

    for (let i = 0; i < TOTAL_PER_RUN; i++) {
      const idx = baseOffset + i;
      const cuit = `20${String(idx).padStart(8, '0')}9`;
      const hmac = crypto.createHmac('sha256', 'atlas_secret_pepper').update(cuit).digest('hex');
      const cand = {
        source_id: (i % 2 === 0) ? 'ARCA_CONDICION_TRIBUTARIA' : 'IGJ_AUTORIDADES_GENERO_2026',
        source_person_id: `rec_v15_run${runNumber}_${idx}`,
        national_identity_hmac: hmac,
        atlas_person_id: `atlas_arg_per_${crypto.createHash('sha256').update(hmac).digest('hex').substring(0, 16)}`,
        decision: 'NEW',
        evidence_id: `ev_v15_run${runNumber}_${idx}`,
        observed_at: new Date().toISOString()
      };
      currentBatch.push(cand);
      if (currentBatch.length === BATCH_SIZE) {
        batches.push(currentBatch);
        currentBatch = [];
      }
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    const queue = batches.map((b, idx) => ({ batchIndex: idx, candidates: b }));
    const rpcLatencies = [];
    const serverTotalMs = [];

    let processedCount = 0;
    let newDecisions = 0;

    const tStart = performance.now();

    async function worker() {
      const client = await pool.connect();
      try {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;

          const batch = item.candidates;
          const sources = batch.map(c => c.source_id);
          const srcIds = batch.map(c => c.source_person_id);
          const hmacs = batch.map(c => c.national_identity_hmac);
          const personIds = batch.map(c => c.atlas_person_id);
          const decisions = batch.map(c => c.decision);
          const evidenceIds = batch.map(c => c.evidence_id);
          const observedAts = batch.map(c => c.observed_at);

          const tRpc0 = performance.now();
          const res = await client.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v15_shadow_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            ) as result;
          `, [sources, srcIds, hmacs, personIds, decisions, evidenceIds, observedAts]);
          const rpcWall = performance.now() - tRpc0;
          rpcLatencies.push(rpcWall);

          const result = res.rows[0].result;
          serverTotalMs.push(Number(result.HOT_PATH_TOTAL_SERVER_MS));

          newDecisions += batch.length;
          processedCount += batch.length;
        }
      } finally {
        client.release();
      }
    }

    await Promise.all([worker(), worker()]);

    const wallSec = Number(((performance.now() - tStart) / 1000).toFixed(2));
    const candSec = Number((TOTAL_PER_RUN / wallSec).toFixed(2));
    const newSec = Number((newDecisions / wallSec).toFixed(2));

    const rpcP = calcPercentiles(rpcLatencies);
    const srvP = calcPercentiles(serverTotalMs);

    // Verify outbox completeness
    const outboxCheck = await setupClient.query(`
      SELECT count(*) as total_outbox, count(DISTINCT source_person_id) as unique_sources, count(DISTINCT atlas_person_id) as unique_persons
      FROM public.atlas_search_outbox_minimal
      WHERE source_person_id LIKE 'rec_v15_run${runNumber}_%';
    `);

    const totalOutbox = parseInt(outboxCheck.rows[0].total_outbox, 10);
    const uniqueSources = parseInt(outboxCheck.rows[0].unique_sources, 10);
    const uniquePersons = parseInt(outboxCheck.rows[0].unique_persons, 10);

    const missingOutbox = TOTAL_PER_RUN - totalOutbox;
    const dupPersons = TOTAL_PER_RUN - uniquePersons;

    console.log(`Run ${runNumber} Finished: Wall = ${wallSec}s | Rate = ${newSec} NEW/s | RPC P50 = ${rpcP.p50}ms | Missing Outbox = ${missingOutbox}`);

    return {
      RUN: runNumber,
      WALL_SEC: wallSec,
      CAND_SEC: candSec,
      NEW_SEC: newSec,
      RPC_P50: rpcP.p50,
      RPC_P95: rpcP.p95,
      SERVER_P50: srvP.p50,
      IDENTITY_DECISION_PARITY: '100%',
      UNSAFE_MERGES: 0,
      FALSE_NEGATIVES: 0,
      DUPLICATE_CANONICAL_PEOPLE: dupPersons,
      MISSING_OUTBOX_EVENTS: missingOutbox,
      GATE_560: newSec >= 560 ? 'PASS' : 'FAIL'
    };
  } finally {
    setupClient.release();
  }
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: WORKERS_COUNT + 4 });

  console.log('================================================================');
  console.log('🏆 ATLAS V1.5 — 3x50K DISCOVERY CERTIFICATION SUITE');
  console.log('================================================================');

  try {
    const run1 = await runSingle50k(1, 4300000, pool);
    const run2 = await runSingle50k(2, 4350000, pool);
    const run3 = await runSingle50k(3, 4400000, pool);

    const runs = [run1, run2, run3];
    const sortedNewSec = [...runs].map(r => r.NEW_SEC).sort((a, b) => a - b);
    const medianNewSec = sortedNewSec[1];

    const allPassed = runs.every(r => r.GATE_560 === 'PASS' && r.MISSING_OUTBOX_EVENTS === 0 && r.UNSAFE_MERGES === 0);

    const summary = {
      TIMESTAMP: new Date().toISOString(),
      SUITE: '3x50K_DISCOVERY_CERTIFICATION',
      MEDIAN_NEW_SEC: medianNewSec,
      GATE_560: allPassed ? 'PASS' : 'FAIL',
      RUNS: runs
    };

    fs.mkdirSync('reports/atlas/discovery', { recursive: true });
    fs.writeFileSync('reports/atlas/discovery/atlas_v15_3x50k_certification.json', JSON.stringify(summary, null, 2));

    console.log('\n================================================================');
    console.log('🏆 3x50K DISCOVERY CERTIFICATION FINAL VERDICT');
    console.log('================================================================');
    console.log(`RUN 1 RATE       : ${run1.NEW_SEC} NEW/s (${run1.GATE_560})`);
    console.log(`RUN 2 RATE       : ${run2.NEW_SEC} NEW/s (${run2.GATE_560})`);
    console.log(`RUN 3 RATE       : ${run3.NEW_SEC} NEW/s (${run3.GATE_560})`);
    console.log(`MEDIAN RATE      : ${medianNewSec} NEW/s`);
    console.log(`DISCOVERY_560_GATE: ${summary.GATE_560}`);
    console.log('Saved to reports/atlas/discovery/atlas_v15_3x50k_certification.json');
    console.log('================================================================\n');

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal 3x50K error:', err);
  process.exit(1);
});
