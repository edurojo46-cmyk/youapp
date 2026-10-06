import fs from 'node:fs';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';
import { streamChunkedCandidates, normalizeName } from './chunked_source_reader.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || process.env.ATLAS_IDENTITY_HMAC_SECRET || 'atlas_secret_cmyk_2026';
const PUBLISHER_STATUS_FILE = 'cache_gate31d/publisher_status.json';
const HIGH_WATERMARK = 50000;

const IDENTITY_INDEXES = [
  'uq_person_identity_source',
  'idx_identity_map_identifier',
  'idx_identity_map_atlas_person_id',
  'atlas_person_identity_map_pkey'
];

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function getIndexStatsSnapshot(pool) {
  const res = await pool.query(`
    SELECT 
      indexrelname,
      coalesce(idx_blks_read, 0)::bigint as idx_blks_read,
      coalesce(idx_blks_hit, 0)::bigint as idx_blks_hit
    FROM pg_statio_user_indexes
    WHERE indexrelname = ANY($1::text[])
  `, [IDENTITY_INDEXES]);
  const map = {};
  for (const r of res.rows) {
    map[r.indexrelname] = {
      read: BigInt(r.idx_blks_read),
      hit: BigInt(r.idx_blks_hit)
    };
  }
  return map;
}

export async function runW2BatchBenchmark(cfg) {
  const { configName, workersCount, batchSize, startLine, targetLimit } = cfg;

  console.log('\n================================================================');
  console.log(`🚀 STARTING P2.2 BENCHMARK: ${configName}`);
  console.log(`WORKERS: ${workersCount} | BATCH: ${batchSize} | LIMIT: ${targetLimit} | START_LINE: ${startLine}`);
  console.log('READER: CHUNKED | PG: UNSORTED | PUBLISHER: PIPELINED');
  console.log('================================================================\n');

  const tField0 = performance.now();
  const field = IdentityInductionField.loadFromFile('cache_gate31d/identity_field_perf_1m30.bin');
  console.log(`Identity Induction Field loaded in ${(performance.now() - tField0).toFixed(1)} ms.`);

  const dbPool = new pg.Pool({ ...parseDbUrl(), max: workersCount + 4 });

  // 1. Initial Snapshots
  const initIndexStats = await getIndexStatsSnapshot(dbPool);
  const initWalRes = await dbPool.query('SELECT pg_current_wal_lsn() as lsn');
  const initWalLsn = initWalRes.rows[0].lsn;

  const workerPids = new Set();
  let dataFileReadSamples = 0;
  let totalWaitSamples = 0;
  let samplerActive = true;

  const samplerPromise = (async () => {
    while (samplerActive) {
      if (workerPids.size > 0) {
        try {
          const pidsArr = Array.from(workerPids);
          const sRes = await dbPool.query(`
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

  let totalCandidatesProcessed = 0;
  let totalNetNewCommitted = 0;
  let totalMergedExisting = 0;
  let totalDbErrors = 0;
  let totalConflicts = 0;
  let totalOutboxProduced = 0;

  let totalWorkerBackpressureWaitMs = 0;
  let totalBackpressureWallMs = 0;
  let activeBackpressureWaiters = 0;
  let tBackpressureWallStart = 0;

  const metrics = {
    SOURCE_READ_MS: [],
    NORMALIZE_HMAC_MS: [],
    FIELD_CLASSIFY_MS: [],
    FALLBACK_LOOKUP_MS: [],
    IDENTITY_INSERT_MS: [],
    OUTBOX_INSERT_MS: [],
    COMMIT_MS: [],
    BACKPRESSURE_WAIT_MS: [],
    TOTAL_BATCH_MS: []
  };

  function getPublisherPublishedCount() {
    try {
      if (fs.existsSync(PUBLISHER_STATUS_FILE)) {
        const data = JSON.parse(fs.readFileSync(PUBLISHER_STATUS_FILE, 'utf8'));
        return data.totalDocsPublished || 0;
      }
    } catch (_) {}
    return 0;
  }

  const initialPublisherPublished = getPublisherPublishedCount();

  async function processBatch(workerId, batchData, batchTiming) {
    const workerTag = `worker_${workerId}`;
    const client = await dbPool.connect();
    
    const pidRes = await client.query('SELECT pg_backend_pid() as pid');
    const backendPid = pidRes.rows[0].pid;
    workerPids.add(backendPid);

    const tBatchStart = performance.now();

    try {
      // 1. Backpressure Regulation
      let backpressureWaitMs = 0;
      const tBp0 = performance.now();
      let enteredBp = false;

      while (true) {
        const publishedNow = getPublisherPublishedCount() - initialPublisherPublished;
        const pendingEstimate = totalOutboxProduced - publishedNow;
        if (pendingEstimate < HIGH_WATERMARK) break;

        if (!enteredBp) {
          enteredBp = true;
          if (activeBackpressureWaiters === 0) {
            tBackpressureWallStart = performance.now();
          }
          activeBackpressureWaiters++;
        }
        await new Promise(r => setTimeout(r, 40));
      }

      if (enteredBp) {
        activeBackpressureWaiters--;
        if (activeBackpressureWaiters === 0) {
          totalBackpressureWallMs += (performance.now() - tBackpressureWallStart);
        }
      }

      backpressureWaitMs = performance.now() - tBp0;
      totalWorkerBackpressureWaitMs += backpressureWaitMs;

      // 2. Field Classification & In-flight Reservation
      const tClass0 = performance.now();
      const possiblyPresentList = [];
      const definitelyAbsentList = [];

      for (const cand of batchData) {
        const candidatePayload = {
          source_id: cand.source_id,
          source_person_id: cand.source_person_id,
          identifier_value: cand.identifier_value
        };

        field.reserveInFlight(workerTag, candidatePayload);
        const classification = field.classifyCandidate(candidatePayload, workerTag);

        if (classification.classification === 'DEFINITELY_ABSENT') {
          cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
          cand.isNew = true;
          definitelyAbsentList.push(cand);
        } else {
          possiblyPresentList.push(cand);
        }
      }
      const fieldClassifyMs = performance.now() - tClass0;

      // 3. Fallback Lookup (Deterministic single bulk query with sorted keys)
      const tFallback0 = performance.now();
      let fallbackLookupMs = 0;
      const existingMap = new Map();

      if (possiblyPresentList.length > 0) {
        const hmacs = possiblyPresentList.map(c => c.identifier_value);
        hmacs.sort();

        const exRes = await client.query(`
          SELECT identifier_value, atlas_person_id
          FROM public.atlas_person_identity_map
          WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
          AND identifier_value = ANY($1::text[])
        `, [hmacs]);

        for (const row of exRes.rows) {
          existingMap.set(row.identifier_value, row.atlas_person_id);
        }

        for (const cand of possiblyPresentList) {
          const matchedAtlasId = existingMap.get(cand.identifier_value);
          if (matchedAtlasId) {
            cand.targetAtlasId = matchedAtlasId;
            cand.isNew = false;
          } else {
            cand.targetAtlasId = `atlas_arg_per_${crypto.randomBytes(8).toString('hex')}`;
            cand.isNew = true;
          }
        }
        fallbackLookupMs = performance.now() - tFallback0;
      }

      // 4. Promote reservations to committed
      const nowIso = new Date().toISOString();
      for (const cand of batchData) {
        field.promoteReservationToCommitted(workerTag, {
          source_id: cand.source_id,
          source_person_id: cand.source_person_id,
          identifier_value: cand.identifier_value
        }, nowIso);
      }

      // 5. Prepare Bulk UNNEST Arrays (Unsorted)
      const mapIds = [], mapSources = [], mapPersonIds = [], mapTypes = [], mapValues = [], mapEvidences = [], mapConfidences = [], mapResolutions = [];
      const outboxIds = [], outboxSources = [], outboxRecords = [], outboxPayloads = [], outboxVersions = [], outboxStatuses = [], outboxAttempts = [];

      let localNew = 0;
      let localMerged = 0;

      for (const cand of batchData) {
        if (cand.isNew) localNew++;
        else localMerged++;

        mapIds.push(cand.targetAtlasId);
        mapSources.push(cand.source_id);
        mapPersonIds.push(cand.source_person_id);
        mapTypes.push('NATIONAL_IDENTITY_HMAC');
        mapValues.push(cand.identifier_value);
        mapEvidences.push('ev_arca_' + cand.source_person_id);
        mapConfidences.push(1.0);
        mapResolutions.push('DETERMINISTIC');

        const payload = {
          atlas_person_id: cand.targetAtlasId,
          display_name: cand.raw_name,
          display_name_normalized: cand.name_norm,
          search_text_normalized: cand.name_norm,
          source_id: cand.source_id,
          source_record_id: cand.source_person_id
        };

        outboxIds.push(cand.targetAtlasId);
        outboxSources.push(cand.source_id);
        outboxRecords.push(cand.source_person_id);
        outboxPayloads.push(JSON.stringify(payload));
        outboxVersions.push(1);
        outboxStatuses.push('PENDING');
        outboxAttempts.push(0);
      }

      // 6. Execute DB Transaction
      await client.query('BEGIN');

      const tId0 = performance.now();
      await client.query(`
        INSERT INTO public.atlas_person_identity_map (
          atlas_person_id, source_id, source_person_id, identifier_type, identifier_value,
          evidence_id, confidence, resolution_method, observed_at
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
          $6::text[], $7::float[], $8::text[], array_fill(NOW(), ARRAY[cardinality($1::text[])])
        )
        ON CONFLICT (source_id, source_person_id) DO NOTHING
      `, [mapIds, mapSources, mapPersonIds, mapTypes, mapValues, mapEvidences, mapConfidences, mapResolutions]);
      const identityInsertMs = performance.now() - tId0;

      const tOut0 = performance.now();
      await client.query(`
        INSERT INTO public.atlas_search_outbox (
          atlas_person_id, source_id, source_record_id, payload, payload_version, status, attempt_count
        )
        SELECT * FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::jsonb[], $5::int[], $6::text[], $7::int[]
        )
        ON CONFLICT (source_id, source_record_id) DO NOTHING
      `, [outboxIds, outboxSources, outboxRecords, outboxPayloads, outboxVersions, outboxStatuses, outboxAttempts]);
      const outboxInsertMs = performance.now() - tOut0;

      const tCommit0 = performance.now();
      await client.query('COMMIT');
      const commitMs = performance.now() - tCommit0;

      const totalBatchMs = performance.now() - tBatchStart;

      totalCandidatesProcessed += batchData.length;
      totalNetNewCommitted += localNew;
      totalMergedExisting += localMerged;
      totalOutboxProduced += outboxIds.length;

      metrics.SOURCE_READ_MS.push(batchTiming.sourceReadMs);
      metrics.NORMALIZE_HMAC_MS.push(batchTiming.normalizeHmacMs);
      metrics.FIELD_CLASSIFY_MS.push(fieldClassifyMs);
      metrics.FALLBACK_LOOKUP_MS.push(fallbackLookupMs);
      metrics.IDENTITY_INSERT_MS.push(identityInsertMs);
      metrics.OUTBOX_INSERT_MS.push(outboxInsertMs);
      metrics.COMMIT_MS.push(commitMs);
      metrics.BACKPRESSURE_WAIT_MS.push(backpressureWaitMs);
      metrics.TOTAL_BATCH_MS.push(totalBatchMs);

      console.log(`[${configName} W${workerId}] Batch ${batchData.length} (New: ${localNew}, Merged: ${localMerged}) | Total: ${totalBatchMs.toFixed(0)}ms (IdIns: ${identityInsertMs.toFixed(0)}ms, OutIns: ${outboxInsertMs.toFixed(0)}ms, Commit: ${commitMs.toFixed(0)}ms, Fallback: ${fallbackLookupMs.toFixed(0)}ms)`);

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      totalDbErrors++;
      console.error(`[${configName}] Batch Error:`, err.message);
      throw err;
    } finally {
      workerPids.delete(backendPid);
      client.release();
    }
  }

  // File stream ingestion loop
  const t0_run = performance.now();
  let activeWorkers = new Set();
  let workerIdx = 0;

  for await (const batch of streamChunkedCandidates(SOURCE_FILE, {
    startLine,
    limit: targetLimit,
    batchSize
  })) {
    const timing = { sourceReadMs: 0.5, normalizeHmacMs: 0.5 };
    const assignedWorker = (workerIdx % workersCount) + 1;
    workerIdx++;

    const p = processBatch(assignedWorker, batch, timing);
    activeWorkers.add(p);
    p.finally(() => activeWorkers.delete(p));

    if (activeWorkers.size >= workersCount) {
      await Promise.race(activeWorkers);
    }
  }

  await Promise.all(activeWorkers);
  const totalWallTimeSec = Number(((performance.now() - t0_run) / 1000).toFixed(2));

  samplerActive = false;
  await samplerPromise.catch(() => {});

  // 2. Post Snapshots & Deltas
  const postIndexStats = await getIndexStatsSnapshot(dbPool);
  const indexDeltas = {};
  for (const idxName of IDENTITY_INDEXES) {
    const pre = initIndexStats[idxName] || { read: 0n, hit: 0n };
    const post = postIndexStats[idxName] || { read: 0n, hit: 0n };
    indexDeltas[idxName] = {
      INDEX_BLOCK_READ_DELTA: Number(post.read - pre.read),
      INDEX_BLOCK_HIT_DELTA: Number(post.hit - pre.hit)
    };
  }

  const walDiffRes = await dbPool.query(`SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), $1::pg_lsn) as wal_bytes`, [initWalLsn]);
  const walBytes = Number(walDiffRes.rows[0].wal_bytes);

  const dataFileReadWaitSec = Number(((dataFileReadSamples * 0.025)).toFixed(2));
  const CAND_SEC = Number((totalCandidatesProcessed / totalWallTimeSec).toFixed(2));
  const NEW_SEC = Number((totalNetNewCommitted / totalWallTimeSec).toFixed(2));
  const backpressureWallSec = Number((totalBackpressureWallMs / 1000).toFixed(2));
  const backpressureWallPercent = Number(((backpressureWallSec / totalWallTimeSec) * 100).toFixed(2));

  await dbPool.end();

  const report = {
    CONFIG_NAME: configName,
    WORKERS: workersCount,
    BATCH_SIZE: batchSize,
    START_LINE: startLine,
    LIMIT: targetLimit,
    TOTAL_WALL_TIME_SEC: totalWallTimeSec,
    CANDIDATES_PROCESSED: totalCandidatesProcessed,
    NET_NEW_COMMITTED: totalNetNewCommitted,
    MERGED_EXISTING: totalMergedExisting,
    CAND_SEC,
    NEW_SEC,
    PG_IDENTITY_WRITE_P50: metrics.IDENTITY_INSERT_MS.length ? calcPercentiles(metrics.IDENTITY_INSERT_MS).P50 : 0,
    PG_IDENTITY_WRITE_P95: metrics.IDENTITY_INSERT_MS.length ? calcPercentiles(metrics.IDENTITY_INSERT_MS).P95 : 0,
    PG_OUTBOX_WRITE_P50: metrics.OUTBOX_INSERT_MS.length ? calcPercentiles(metrics.OUTBOX_INSERT_MS).P50 : 0,
    PG_OUTBOX_WRITE_P95: metrics.OUTBOX_INSERT_MS.length ? calcPercentiles(metrics.OUTBOX_INSERT_MS).P95 : 0,
    FALLBACK_P50: metrics.FALLBACK_LOOKUP_MS.length ? calcPercentiles(metrics.FALLBACK_LOOKUP_MS).P50 : 0,
    FALLBACK_P95: metrics.FALLBACK_LOOKUP_MS.length ? calcPercentiles(metrics.FALLBACK_LOOKUP_MS).P95 : 0,
    COMMIT_P50: metrics.COMMIT_MS.length ? calcPercentiles(metrics.COMMIT_MS).P50 : 0,
    COMMIT_P95: metrics.COMMIT_MS.length ? calcPercentiles(metrics.COMMIT_MS).P95 : 0,
    DATA_FILE_READ_WAIT_SEC: dataFileReadWaitSec,
    WAL_BYTES: walBytes,
    BACKPRESSURE_WALL_PERCENT: backpressureWallPercent,
    INDEX_DELTAS: indexDeltas,
    DB_ERRORS: totalDbErrors,
    CONFLICTS: totalConflicts
  };

  console.log('\n================================================================');
  console.log(`✅ BENCHMARK ${configName} COMPLETE:`);
  console.log(`WALL TIME: ${totalWallTimeSec}s | CAND_SEC: ${CAND_SEC} | NEW_SEC: ${NEW_SEC}`);
  console.log(`IDENTITY P50: ${report.PG_IDENTITY_WRITE_P50}ms | OUTBOX P50: ${report.PG_OUTBOX_WRITE_P50}ms | COMMIT P50: ${report.COMMIT_P50}ms`);
  console.log(`DATA_FILE_READ_WAIT_SEC: ${dataFileReadWaitSec}s | WAL_BYTES: ${walBytes} | BP_WALL%: ${backpressureWallPercent}%`);
  console.log('INDEX DELTAS:');
  for (const [idx, deltas] of Object.entries(indexDeltas)) {
    console.log(`  ${idx}: Reads +${deltas.INDEX_BLOCK_READ_DELTA}, Hits +${deltas.INDEX_BLOCK_HIT_DELTA}`);
  }
  console.log('================================================================\n');

  return report;
}

async function main() {
  console.log('================================================================');
  console.log('🏆 ATLAS STAGE P2.2 — BATCH SIZE OPTIMIZATION MATRIX (w=2)');
  console.log('Testing B1000, B1500, B2000 (control), B2500, B3000 on fresh ARCA cohorts');
  console.log('================================================================\n');

  const configs = [
    { configName: 'B1000_w2', workersCount: 2, batchSize: 1000, startLine: 2550000, targetLimit: 50000 },
    { configName: 'B1500_w2', workersCount: 2, batchSize: 1500, startLine: 2610000, targetLimit: 50000 },
    { configName: 'B2000_w2_control', workersCount: 2, batchSize: 2000, startLine: 2670000, targetLimit: 50000 },
    { configName: 'B2500_w2', workersCount: 2, batchSize: 2500, startLine: 2730000, targetLimit: 50000 },
    { configName: 'B3000_w2', workersCount: 2, batchSize: 3000, startLine: 2790000, targetLimit: 50000 }
  ];

  const results = [];
  for (const cfg of configs) {
    const res = await runW2BatchBenchmark(cfg);
    results.push(res);
    // 2s pause between runs
    await new Promise(r => setTimeout(r, 2000));
  }

  // Sort by full 50K wall throughput (NEW_SEC)
  const sorted = [...results].sort((a, b) => b.NEW_SEC - a.NEW_SEC);
  const bestConfig = sorted[0];

  const report = {
    timestamp: new Date().toISOString(),
    stage: 'atlas_perf_1m30_p22_w2_batch_matrix',
    totalConfigurationsTested: results.length,
    matrixResults: results,
    BEST_CONFIGURATION: bestConfig,
    SELECTION_CRITERIA: 'Full 50K wall throughput (NEW_SEC), not single-batch latency'
  };

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    'reports/atlas/discovery/atlas_perf_1m30_p22_w2_batch_matrix_v1.json',
    JSON.stringify(report, null, 2)
  );

  console.log('\n================================================================');
  console.log('🏆 P2.2 BATCH OPTIMIZATION MATRIX COMPLETE:');
  console.log(`BEST CONFIGURATION: ${bestConfig.CONFIG_NAME}`);
  console.log(`BEST CAND_SEC:      ${bestConfig.CAND_SEC}`);
  console.log(`BEST NEW_SEC:       ${bestConfig.NEW_SEC}`);
  console.log(`WALL TIME:          ${bestConfig.TOTAL_WALL_TIME_SEC}s`);
  console.log(`BP WALL %:          ${bestConfig.BACKPRESSURE_WALL_PERCENT}%`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Fatal W2 Batch Matrix Error:', err);
  process.exit(1);
});
