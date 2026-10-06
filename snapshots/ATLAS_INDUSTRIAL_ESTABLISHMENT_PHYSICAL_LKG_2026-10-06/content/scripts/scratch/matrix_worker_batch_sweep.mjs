import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const SOURCE_FILE = process.env.SOURCE_FILE_PATH || 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { p50: 0, p95: 0, p99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    p95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    p99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function runSweepCell(pool, startLine, limit, workers, batchSize) {
  // 1. Read fresh candidates
  const rawCandidates = [];
  for await (const batch of streamChunkedCandidates(SOURCE_FILE, {
    startLine,
    limit,
    batchSize: 2000
  })) {
    rawCandidates.push(...batch);
    if (rawCandidates.length >= limit) break;
  }

  const candidates = rawCandidates.slice(0, limit);
  const rpcLatencies = [];
  let totalNew = 0;
  let totalMerged = 0;
  let totalErrors = 0;
  let totalConflicts = 0;

  // Background wait event sampler
  const workerPids = new Set();
  let dataFileReadSamples = 0;
  let totalWaitSamples = 0;
  let samplerActive = true;

  const samplerPromise = (async () => {
    while (samplerActive) {
      if (workerPids.size > 0) {
        try {
          const pidsArr = Array.from(workerPids);
          const sRes = await pool.query(`
            SELECT pid, wait_event_type, wait_event
            FROM pg_stat_activity
            WHERE pid = ANY($1::int[])
          `, [pidsArr]);
          for (const row of sRes.rows) {
            totalWaitSamples++;
            if (row.wait_event === 'DataFileRead') {
              dataFileReadSamples++;
            }
          }
        } catch (_) {}
      }
      await new Promise(r => setTimeout(r, 25));
    }
  })();

  // Sample initial WAL position
  let walBytes = 0;
  try {
    const walRes = await pool.query(`SELECT pg_current_wal_lsn() AS lsn`);
    const startLsn = walRes.rows[0].lsn;

    async function processBatch(batchData, wId) {
      const client = await pool.connect();
      try {
        const pidRes = await client.query(`SELECT pg_backend_pid() AS pid`);
        const pid = pidRes.rows[0].pid;
        workerPids.add(pid);

        const p_source_person_ids = batchData.map(c => c.source_person_id);
        const p_identifier_types = batchData.map(() => 'NATIONAL_IDENTITY_HMAC');
        const p_identifier_values = batchData.map(c => c.identifier_value);
        const p_display_names = batchData.map(c => c.raw_name);
        const p_name_norms = batchData.map(c => c.name_norm);
        const p_field_classifications = batchData.map((_, i) => i % 12 === 0 ? 'POSSIBLY_PRESENT' : 'DEFINITELY_ABSENT');
        const p_proposed_atlas_ids = batchData.map(() => 'atlas_arg_per_' + crypto.randomBytes(8).toString('hex'));
        const p_evidence_ids = batchData.map(c => 'ev_arca_' + c.source_person_id);
        const p_confidences = batchData.map(() => 1.0);
        const p_resolution_methods = batchData.map(() => 'DETERMINISTIC');

        const tRpc0 = performance.now();
        const rpcRes = await client.query(`
          SELECT * FROM public.atlas_resolve_and_ingest_batch_rpc(
            $1::text, $2::text[], $3::text[], $4::text[], $5::text[],
            $6::text[], $7::text[], $8::text[], $9::text[], $10::numeric[],
            $11::text[]
          );
        `, [
          'ARCA_CONDICION_TRIBUTARIA',
          p_source_person_ids,
          p_identifier_types,
          p_identifier_values,
          p_display_names,
          p_name_norms,
          p_field_classifications,
          p_proposed_atlas_ids,
          p_evidence_ids,
          p_confidences,
          p_resolution_methods
        ]);
        const rpcElapsed = performance.now() - tRpc0;
        rpcLatencies.push(rpcElapsed);

        const resRow = rpcRes.rows[0];
        totalNew += resRow.new_count;
        totalMerged += resRow.merge_count;
      } catch (err) {
        totalErrors++;
      } finally {
        client.release();
      }
    }

    const tStart = performance.now();
    let cursor = 0;
    const activeTasks = new Set();
    let wIdx = 0;

    while (cursor < candidates.length) {
      const slice = candidates.slice(cursor, cursor + batchSize);
      if (slice.length === 0) break;
      cursor += slice.length;

      const p = processBatch(slice, (wIdx % workers) + 1);
      wIdx++;
      activeTasks.add(p);
      p.finally(() => activeTasks.delete(p));

      if (activeTasks.size >= workers) {
        await Promise.race(activeTasks);
      }
    }

    await Promise.all(activeTasks);
    const wallSec = (performance.now() - tStart) / 1000;

    samplerActive = false;
    await samplerPromise.catch(() => {});

    // Compute WAL diff
    const endWalRes = await pool.query(`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1) AS diff`, [startLsn]);
    walBytes = parseInt(endWalRes.rows[0].diff || '0', 10);

    const rpcP = calcPercentiles(rpcLatencies);
    const candSec = Number((candidates.length / wallSec).toFixed(2));
    const newSec = Number((totalNew / wallSec).toFixed(2));
    const dataFileReadRate = totalWaitSamples > 0 ? Number(((dataFileReadSamples / totalWaitSamples) * 100).toFixed(2)) : 0;

    return {
      workers,
      batchSize,
      candidates: candidates.length,
      wallSec: Number(wallSec.toFixed(2)),
      candSec,
      newSec,
      rpcP50: rpcP.p50,
      rpcP95: rpcP.p95,
      walBytes,
      walMb: Number((walBytes / (1024 * 1024)).toFixed(2)),
      dataFileReadRate: `${dataFileReadRate}%`,
      errors: totalErrors,
      conflicts: totalConflicts
    };
  } catch (err) {
    samplerActive = false;
    throw err;
  }
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 10 });
  const combinations = [
    { workers: 2, batchSize: 1500 },
    { workers: 2, batchSize: 2000 },
    { workers: 2, batchSize: 3000 },
    { workers: 2, batchSize: 4000 },
    { workers: 3, batchSize: 1500 },
    { workers: 3, batchSize: 2000 },
    { workers: 3, batchSize: 3000 },
    { workers: 4, batchSize: 1500 },
    { workers: 4, batchSize: 2000 },
    { workers: 4, batchSize: 3000 }
  ];

  console.log('================================================================');
  console.log('🔬 ONE-RPC WORKER & BATCH SIZE SWEEP (10K Candidates per cell)');
  console.log('================================================================\n');

  const results = [];
  let currentStartLine = 3460000;

  for (const c of combinations) {
    console.log(`▶ Testing Workers: ${c.workers} | Batch: ${c.batchSize} (StartLine: ${currentStartLine})...`);
    try {
      const res = await runSweepCell(pool, currentStartLine, 10000, c.workers, c.batchSize);
      console.log(`   -> Rate: ${res.newSec} NEW/s (${res.candSec} CAND/s) | Wall: ${res.wallSec}s | P50: ${res.rpcP50}ms | P95: ${res.rpcP95}ms | WAL: ${res.walMb}MB | DFR: ${res.dataFileReadRate}`);
      results.push(res);
    } catch (e) {
      console.error(`   -> Failed: ${e.message}`);
    }
    currentStartLine += 10000;
  }

  // Find winner
  const winner = [...results].sort((a, b) => b.newSec - a.newSec)[0];

  console.log('\n================================================================');
  console.log('🏆 MATRIX SWEEP WINNER');
  console.log('================================================================');
  console.log(`BEST WORKERS  : ${winner.workers}`);
  console.log(`BEST BATCH    : ${winner.batchSize}`);
  console.log(`NEW_SEC       : ${winner.newSec}`);
  console.log(`CAND_SEC      : ${winner.candSec}`);
  console.log(`RPC P50       : ${winner.rpcP50} ms`);
  console.log(`RPC P95       : ${winner.rpcP95} ms`);
  console.log('================================================================\n');

  fs.writeFileSync('reports/atlas/discovery/atlas_one_rpc_matrix_sweep.json', JSON.stringify({ results, winner }, null, 2));

  // Run ONE fresh 50K on the winning configuration
  console.log(`\n================================================================`);
  console.log(`🚀 RUNNING ONE FRESH 50K COHORT ON WINNER (W: ${winner.workers}, B: ${winner.batchSize})`);
  console.log(`================================================================\n`);
  const fresh50kStartLine = currentStartLine + 10000;
  const winner50k = await runSweepCell(pool, fresh50kStartLine, 50000, winner.workers, winner.batchSize);

  console.log('\n================================================================');
  console.log('🏁 WINNING CONFIGURATION 50K COHORT RESULT');
  console.log('================================================================');
  console.log(`START_LINE    : ${fresh50kStartLine}..${fresh50kStartLine + 50000}`);
  console.log(`WALL_SEC      : ${winner50k.wallSec} s`);
  console.log(`CAND_SEC      : ${winner50k.candSec}`);
  console.log(`NEW_SEC       : ${winner50k.newSec}`);
  console.log(`RPC_P50_MS    : ${winner50k.rpcP50} ms`);
  console.log(`RPC_P95_MS    : ${winner50k.rpcP95} ms`);
  console.log(`WAL_MB        : ${winner50k.walMb} MB`);
  console.log(`DFR_WAIT_RATE : ${winner50k.dataFileReadRate}`);
  console.log(`GATE_560      : ${winner50k.newSec >= 560 ? 'PASS' : 'FAIL'}`);
  console.log('================================================================\n');

  fs.writeFileSync('reports/atlas/discovery/atlas_one_rpc_winner_50k.json', JSON.stringify(winner50k, null, 2));

  await pool.end();
}

main().catch(err => {
  console.error('Sweep failed:', err);
  process.exit(1);
});
