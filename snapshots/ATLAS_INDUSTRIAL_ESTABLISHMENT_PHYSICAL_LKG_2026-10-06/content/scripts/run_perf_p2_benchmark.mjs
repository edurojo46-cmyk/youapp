import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';
import { streamChunkedCandidates, normalizeName } from './chunked_source_reader.mjs';

dotenv.config();

const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY || process.env.ATLAS_IDENTITY_HMAC_SECRET || 'atlas_secret_cmyk_2026';
const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const PUBLISHER_STATUS_FILE = 'cache_gate31d/publisher_status.json';

// Parse arguments
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1] : defaultVal;
}

const CONFIG_NAME = getArg('--config', 'P2_A');
const WORKERS_COUNT = parseInt(getArg('--workers', '2'), 10);
const BATCH_SIZE = parseInt(getArg('--batch', '2000'), 10);
const START_LINE = parseInt(getArg('--start-line', '2020000'), 10);
const TARGET_LIMIT = parseInt(getArg('--limit', '50000'), 10);
const USE_NEW_READER = args.includes('--new-reader');
const SORT_ORDER = getArg('--sort-order', 'none'); // 'none' or 'source_person_id'
const SORT_FALLBACK = true; // Always sort fallback HMACs to benefit from B-tree index scan speedup

const HIGH_WATERMARK = 40000;
const LOW_WATERMARK = 10000;

function calcPercentiles(arr) {
  if (!arr || arr.length === 0) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (pct) => {
    const idx = Math.floor((pct / 100) * (sorted.length - 1));
    return Number(sorted[idx].toFixed(2));
  };
  return { P50: p(50), P95: p(95), P99: p(99) };
}

export async function runP2Benchmark(options = {}) {
  const configName = options.configName || CONFIG_NAME;
  const workersCount = options.workers || WORKERS_COUNT;
  const batchSize = options.batchSize || BATCH_SIZE;
  const startLine = options.startLine || START_LINE;
  const targetLimit = options.limit || TARGET_LIMIT;
  const useNewReader = options.useNewReader !== undefined ? options.useNewReader : USE_NEW_READER;
  const sortOrder = options.sortOrder || SORT_ORDER;

  console.log('================================================================');
  console.log(`⚡ ATLAS STAGE P2 BENCHMARK: ${configName}`);
  console.log(`WORKERS: ${workersCount} | BATCH: ${batchSize} | START_LINE: ${startLine} | LIMIT: ${targetLimit}`);
  console.log(`READER: ${useNewReader ? 'NEW CHUNKED (16MB)' : 'OLD READLINE'} | SORT: ${sortOrder} | SORT_FALLBACK: true`);
  console.log('================================================================\n');

  // Load Identity Induction Field
  console.log('Loading Identity Induction Field...');
  const tField0 = performance.now();
  const field = IdentityInductionField.loadFromFile('cache_gate31d/identity_field_perf_1m30.bin');
  console.log(`Identity Induction Field loaded in ${(performance.now() - tField0).toFixed(1)} ms.`);

  const dbPool = new pg.Pool({ ...parseDbUrl(), max: workersCount + 4 });

  // Atomic state & counters
  let totalCandidatesProcessed = 0;
  let totalNetNewCommitted = 0;
  let totalMergedExisting = 0;
  let totalFastPathCount = 0;
  let totalFallbackCount = 0;
  let totalDbErrors = 0;
  let totalConflicts = 0;
  let totalOutboxProduced = 0;

  // Accurate Backpressure Tracking
  let totalWorkerBackpressureWaitMs = 0;
  let totalBackpressureWallMs = 0;
  let activeBackpressureWaiters = 0;
  let tBackpressureWallStart = 0;

  // Telemetry metrics
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
          cand.targetAtlasId = null;
          cand.isNew = false;
          possiblyPresentList.push(cand);
        }
      }
      const fieldClassifyMs = performance.now() - tClass0;

      // 3. Fallback Lookup (single bulk query with sorted HMACs)
      const tFallback0 = performance.now();
      let fallbackLookupMs = 0;
      const existingMap = new Map();

      if (possiblyPresentList.length > 0) {
        // Sort HMAC keys to guarantee sequential B-tree leaf traversal
        const hmacs = possiblyPresentList.map(c => c.identifier_value);
        if (SORT_FALLBACK) {
          hmacs.sort();
        }

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

      // 4. Promote reservations to committed in memory
      const nowIso = new Date().toISOString();
      for (const cand of batchData) {
        field.promoteReservationToCommitted(workerTag, {
          source_id: cand.source_id,
          source_person_id: cand.source_person_id,
          identifier_value: cand.identifier_value
        }, nowIso);
      }

      // Sort candidate batch if configured
      if (sortOrder === 'source_person_id') {
        batchData.sort((a, b) => a.source_person_id.localeCompare(b.source_person_id));
      }

      // 5. Prepare Bulk UNNEST Arrays
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
        mapResolutions.push('DETERMINISTIC_CUIT_DNI_HMAC');

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
        outboxPayloads.push(payload);
        outboxVersions.push(1);
        outboxStatuses.push('PENDING');
        outboxAttempts.push(0);
      }

      // 6. Execute Transaction (Single transaction with 2 bulk UNNEST inserts)
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

      // Update counters
      totalCandidatesProcessed += batchData.length;
      totalNetNewCommitted += localNew;
      totalMergedExisting += localMerged;
      totalFastPathCount += definitelyAbsentList.length;
      totalFallbackCount += possiblyPresentList.length;
      totalOutboxProduced += outboxIds.length;

      // Record metrics
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

      // 10K Milestone Reporting
      if (totalCandidatesProcessed > 0 && totalCandidatesProcessed % 10000 === 0) {
        const elapsedSec = (performance.now() - t0_run) / 1000;
        const curCandSec = Number((totalCandidatesProcessed / elapsedSec).toFixed(1));
        const curNewSec = Number((totalNetNewCommitted / elapsedSec).toFixed(1));
        let curPubRate = 0;
        let curPubCount = 0;
        try {
          if (fs.existsSync(PUBLISHER_STATUS_FILE)) {
            const pStat = JSON.parse(fs.readFileSync(PUBLISHER_STATUS_FILE, 'utf8'));
            curPubRate = pStat.SEARCH_E2E_DOCS_SEC || 0;
            curPubCount = pStat.totalDocsPublished || 0;
          }
        } catch (_) {}
        const curOutboxPending = totalOutboxProduced - (curPubCount - initialPublisherPublished);
        const curBpWallPercent = Number(((totalBackpressureWallMs / 1000) / elapsedSec * 100).toFixed(2));

        console.log(`\n================================================================`);
        console.log(`📊 [${configName}] 10K CHECKPOINT (${totalCandidatesProcessed} / ${targetLimit})`);
        console.log(`CANDIDATES: ${totalCandidatesProcessed} | NEW: ${totalNetNewCommitted} | MERGED: ${totalMergedExisting}`);
        console.log(`CAND_SEC: ${curCandSec} | NEW_SEC: ${curNewSec} | SEARCH_E2E_DOCS_SEC: ${curPubRate}`);
        console.log(`SOURCE_READ_MS P50: ${calcPercentiles(metrics.SOURCE_READ_MS).P50} | PG_IDENTITY_WRITE_MS P50: ${calcPercentiles(metrics.IDENTITY_INSERT_MS).P50}`);
        console.log(`OUTBOX_PENDING: ${curOutboxPending} | BACKPRESSURE_WALL_PERCENT: ${curBpWallPercent}% | ERRORS: ${totalDbErrors}`);
        console.log(`================================================================\n`);
      }

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[${configName} W${workerId}] Batch Error:`, err.message);
      totalDbErrors++;
      throw err;
    } finally {
      client.release();
    }
  }

  // File stream ingestion dispatch loop
  console.log(`Streaming candidate batches starting at line ${startLine}...`);
  const t0_run = performance.now();
  let activeWorkers = new Set();
  let workerIdx = 0;

  if (useNewReader) {
    // High-throughput chunked reader
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
  } else {
    // Legacy readline reader
    const fileStream = fs.createReadStream(SOURCE_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let lineOrdinal = 0;
    let currentBatch = [];
    let tReadBatch0 = performance.now();
    let tNormTotalMs = 0;

    for await (const line of rl) {
      lineOrdinal++;
      if (lineOrdinal < startLine) continue;
      if (totalCandidatesProcessed + currentBatch.length >= targetLimit) break;

      if (line.startsWith('20') || line.startsWith('23') || line.startsWith('24') || line.startsWith('27')) {
        const cuit = line.substring(0, 11).trim();
        const rawName = line.substring(11, 41).trim();

        const tNorm0 = performance.now();
        const dni = String(parseInt(cuit.slice(2, 10), 10));
        const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
        const nameNorm = normalizeName(rawName);
        tNormTotalMs += (performance.now() - tNorm0);

        currentBatch.push({
          input_ordinal: lineOrdinal,
          cuit,
          raw_name: rawName,
          name_norm: nameNorm,
          identifier_value: identifierValue,
          source_id: 'ARCA_CONDICION_TRIBUTARIA',
          source_person_id: 'rec_arca_' + cuit
        });

        if (currentBatch.length >= batchSize) {
          const sourceReadMs = (performance.now() - tReadBatch0) - tNormTotalMs;
          const timing = { sourceReadMs: Math.max(sourceReadMs, 0), normalizeHmacMs: tNormTotalMs };
          const batchToDispatch = currentBatch;
          currentBatch = [];
          tNormTotalMs = 0;
          tReadBatch0 = performance.now();

          const assignedWorker = (workerIdx % workersCount) + 1;
          workerIdx++;

          const p = processBatch(assignedWorker, batchToDispatch, timing);
          activeWorkers.add(p);
          p.finally(() => activeWorkers.delete(p));

          if (activeWorkers.size >= workersCount) {
            await Promise.race(activeWorkers);
          }
        }
      }
    }

    if (currentBatch.length > 0 && (totalCandidatesProcessed + currentBatch.length <= targetLimit)) {
      const sourceReadMs = (performance.now() - tReadBatch0) - tNormTotalMs;
      const timing = { sourceReadMs: Math.max(sourceReadMs, 0), normalizeHmacMs: tNormTotalMs };
      const assignedWorker = (workerIdx % workersCount) + 1;
      const p = processBatch(assignedWorker, currentBatch, timing);
      activeWorkers.add(p);
      p.finally(() => activeWorkers.delete(p));
    }
  }

  await Promise.all(activeWorkers);
  const t1_run = performance.now();

  const totalWallTimeSec = (t1_run - t0_run) / 1000;
  const CAND_SEC = Number((totalCandidatesProcessed / totalWallTimeSec).toFixed(2));
  const NEW_SEC = Number((totalNetNewCommitted / totalWallTimeSec).toFixed(2));

  const backpressureWallSec = Number((totalBackpressureWallMs / 1000).toFixed(2));
  const benchmarkWallSec = Number(totalWallTimeSec.toFixed(2));
  const backpressureWallPercent = Number(((backpressureWallSec / benchmarkWallSec) * 100).toFixed(2));
  const aggregatedWorkerBackpressureSec = Number((totalWorkerBackpressureWaitMs / 1000).toFixed(2));

  const dbConnUsage = {
    total: dbPool.totalCount,
    idle: dbPool.idleCount,
    waiting: dbPool.waitingCount
  };

  await dbPool.end();

  // Read latest publisher stats
  let searchE2eDocsSec = 0;
  let finalPublishedCount = 0;
  try {
    if (fs.existsSync(PUBLISHER_STATUS_FILE)) {
      const pubData = JSON.parse(fs.readFileSync(PUBLISHER_STATUS_FILE, 'utf8'));
      searchE2eDocsSec = pubData.SEARCH_E2E_DOCS_SEC || 0;
      finalPublishedCount = pubData.totalDocsPublished || 0;
    }
  } catch (_) {}

  const outboxPendingDelta = totalOutboxProduced - (finalPublishedCount - initialPublisherPublished);

  const report = {
    CONFIG_NAME: configName,
    WORKERS: workersCount,
    BATCH_SIZE: batchSize,
    START_LINE: startLine,
    LIMIT: targetLimit,
    READER: useNewReader ? 'NEW_CHUNKED' : 'OLD_READLINE',
    SORT_ORDER: sortOrder,
    TOTAL_WALL_TIME_SEC: benchmarkWallSec,
    CANDIDATES_PROCESSED: totalCandidatesProcessed,
    NET_NEW_COMMITTED: totalNetNewCommitted,
    MERGED_EXISTING: totalMergedExisting,
    CANONICAL_UNIQUE_DELTA: totalNetNewCommitted,
    CAND_SEC,
    NEW_SEC,
    SEARCH_E2E_DOCS_SEC: searchE2eDocsSec,
    DB_CONNECTION_USAGE: dbConnUsage,
    DB_ERRORS: totalDbErrors,
    CONFLICTS: totalConflicts,
    BACKPRESSURE_METRICS: {
      BACKPRESSURE_WALL_SEC: backpressureWallSec,
      BENCHMARK_WALL_SEC: benchmarkWallSec,
      BACKPRESSURE_WALL_PERCENT: backpressureWallPercent,
      AGGREGATED_WORKER_BACKPRESSURE_SEC: aggregatedWorkerBackpressureSec
    },
    STAGE_PERCENTILES: {
      SOURCE_READ: calcPercentiles(metrics.SOURCE_READ_MS),
      NORMALIZE_HMAC: calcPercentiles(metrics.NORMALIZE_HMAC_MS),
      FIELD_CLASSIFY: calcPercentiles(metrics.FIELD_CLASSIFY_MS),
      FALLBACK_LOOKUP: calcPercentiles(metrics.FALLBACK_LOOKUP_MS),
      IDENTITY_INSERT: calcPercentiles(metrics.IDENTITY_INSERT_MS),
      OUTBOX_INSERT: calcPercentiles(metrics.OUTBOX_INSERT_MS),
      COMMIT: calcPercentiles(metrics.COMMIT_MS),
      BACKPRESSURE_WAIT: calcPercentiles(metrics.BACKPRESSURE_WAIT_MS),
      TOTAL_BATCH: calcPercentiles(metrics.TOTAL_BATCH_MS)
    },
    OUTBOX_PRODUCED: totalOutboxProduced,
    OUTBOX_PENDING_DELTA: outboxPendingDelta
  };

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync(
    `reports/atlas/discovery/atlas_perf_1m30_p2_bench_${configName.toLowerCase()}.json`,
    JSON.stringify(report, null, 2)
  );

  console.log('\n================================================================');
  console.log(`✅ BENCHMARK ${configName} COMPLETE:`);
  console.log(`WALL TIME: ${benchmarkWallSec}s | CAND_SEC: ${CAND_SEC} | NEW_SEC: ${NEW_SEC}`);
  console.log(`BP WALL %: ${backpressureWallPercent}% (Aggregated Worker BP: ${aggregatedWorkerBackpressureSec}s)`);
  console.log(`TOTAL BATCH P50: ${report.STAGE_PERCENTILES.TOTAL_BATCH.P50}ms | COMMIT P50: ${report.STAGE_PERCENTILES.COMMIT.P50}ms`);
  console.log('================================================================\n');

  return report;
}

// Allow CLI execution
if (process.argv[1].endsWith('run_perf_p2_benchmark.mjs')) {
  runP2Benchmark().catch(err => {
    console.error('Fatal Benchmark Error:', err);
    process.exit(1);
  });
}
