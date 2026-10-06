import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import pg from 'pg';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { IdentityInductionField } from './lib/identity_field.mjs';

dotenv.config();

const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) {
  console.error('FATAL: ATLAS_IGJ_IDENTITY_HMAC_KEY missing');
  process.exit(1);
}

// Parse arguments
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
  const idx = args.indexOf(flag);
  return (idx !== -1 && idx + 1 < args.length) ? args[idx + 1] : defaultVal;
}

const WORKERS_COUNT = parseInt(getArg('--workers', '2'), 10);
const BATCH_SIZE = parseInt(getArg('--batch-size', '2000'), 10);
const START_LINE = parseInt(getArg('--start-line', '1700000'), 10);
const TARGET_LIMIT = parseInt(getArg('--limit', '50000'), 10);
const CONFIG_NAME = getArg('--config-name', `W${WORKERS_COUNT}_B${BATCH_SIZE}`);
const HIGH_WATERMARK = parseInt(getArg('--high-watermark', '25000'), 10);
const LOW_WATERMARK = parseInt(getArg('--low-watermark', '10000'), 10);
const FIELD_PATH = getArg('--field-path', 'cache_gate31d/identity_field_perf_1m30.bin');
const PUBLISHER_STATUS_FILE = 'cache_gate31d/publisher_status.json';

function normalizeName(rawName) {
  return rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return Number((sorted[lower] * (1 - weight) + sorted[upper] * weight).toFixed(2));
}

async function main() {
  console.log('================================================================');
  console.log(`⚡ ATLAS PERF 50K BENCHMARK: ${CONFIG_NAME}`);
  console.log(`WORKERS: ${WORKERS_COUNT} | BATCH_SIZE: ${BATCH_SIZE} | START_LINE: ${START_LINE} | LIMIT: ${TARGET_LIMIT}`);
  console.log(`HIGH_WATERMARK: ${HIGH_WATERMARK} | LOW_WATERMARK: ${LOW_WATERMARK}`);
  console.log('================================================================\n');

  console.log(`Loading Identity Induction Field from ${FIELD_PATH}...`);
  const tField0 = performance.now();
  const field = IdentityInductionField.loadFromFile(FIELD_PATH);
  console.log(`Identity Induction Field loaded in ${(performance.now() - tField0).toFixed(1)} ms.`);

  const dbPool = new pg.Pool({ ...parseDbUrl(), max: WORKERS_COUNT + 4 });

  // Verify baseline connectivity
  const preCheckClient = await dbPool.connect();
  await preCheckClient.query('SELECT 1');
  console.log('Database connection pool verified.');
  preCheckClient.release();

  // Shared atomic counters & state
  let totalCandidatesProcessed = 0;
  let totalNetNewCommitted = 0;
  let totalMergedExisting = 0;
  let totalFastPathCount = 0;
  let totalFallbackCount = 0;
  let totalFieldDefinitelyAbsent = 0;
  let totalFieldPossiblyPresent = 0;
  let totalDbErrors = 0;
  let totalConflicts = 0;
  let totalBackpressureWaitMs = 0;

  // Telemetry metrics arrays across all batches
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

  // Helper to read publisher published count
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
  let totalOutboxProduced = 0;

  // Single Worker Execution
  async function processBatch(workerId, batchData, batchTiming) {
    const workerTag = `worker_${workerId}`;
    const client = await dbPool.connect();
    const tBatchStart = performance.now();

    try {
      // 1. Backpressure Check
      let backpressureWaitMs = 0;
      const tBp0 = performance.now();
      while (true) {
        const publishedNow = getPublisherPublishedCount() - initialPublisherPublished;
        const pendingEstimate = totalOutboxProduced - publishedNow;
        if (pendingEstimate < HIGH_WATERMARK) break;

        // Throttled
        await new Promise(r => setTimeout(r, 50));
      }
      backpressureWaitMs = performance.now() - tBp0;
      totalBackpressureWaitMs += backpressureWaitMs;

      // 2. Field Classification & In-flight Reservation (Section 7 Hot Path Rule)
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
          cand.targetAtlasId = null; // will resolve via bulk fallback
          cand.isNew = false;
          possiblyPresentList.push(cand);
        }
      }
      const fieldClassifyMs = performance.now() - tClass0;

      // 3. Fallback Lookup (ONLY if possiblyPresentList.length > 0)
      const tFallback0 = performance.now();
      let fallbackLookupMs = 0;
      const existingMap = new Map();

      if (possiblyPresentList.length > 0) {
        const hmacs = possiblyPresentList.map(c => c.identifier_value);
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

      // 5. Prepare Bulk UNNEST Arrays (Section 8 Database Bulk Shape)
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

      // 6. Execute Transaction
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
      totalFieldDefinitelyAbsent += definitelyAbsentList.length;
      totalFieldPossiblyPresent += possiblyPresentList.length;
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

      console.log(`[${CONFIG_NAME} Worker ${workerId}] Batch of ${batchData.length} (New: ${localNew}, Merged: ${localMerged}) | TotalBatch: ${totalBatchMs.toFixed(0)}ms (IdIns: ${identityInsertMs.toFixed(0)}ms, OutIns: ${outboxInsertMs.toFixed(0)}ms, Commit: ${commitMs.toFixed(0)}ms, Fallback: ${fallbackLookupMs.toFixed(0)}ms)`);

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`[${CONFIG_NAME} Worker ${workerId}] Batch Error:`, err.message);
      totalDbErrors++;
      throw err;
    } finally {
      client.release();
    }
  }

  // File Stream Reader
  console.log(`Streaming candidate batches starting at line ${START_LINE}...`);
  const t0_run = performance.now();
  const fileStream = fs.createReadStream('cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp');
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineOrdinal = 0;
  let currentBatch = [];
  let tReadBatch0 = performance.now();
  let tNormTotalMs = 0;
  let activeWorkers = new Set();
  let workerIdx = 0;

  for await (const line of rl) {
    lineOrdinal++;
    if (lineOrdinal < START_LINE) continue;
    if (totalCandidatesProcessed + currentBatch.length >= TARGET_LIMIT) break;

    // Filter eligible individuals (same as frozen contract)
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

      if (currentBatch.length >= BATCH_SIZE) {
        const sourceReadMs = (performance.now() - tReadBatch0) - tNormTotalMs;
        const timing = { sourceReadMs: Math.max(sourceReadMs, 0), normalizeHmacMs: tNormTotalMs };
        const batchToDispatch = currentBatch;
        currentBatch = [];
        tNormTotalMs = 0;
        tReadBatch0 = performance.now();

        const assignedWorker = (workerIdx % WORKERS_COUNT) + 1;
        workerIdx++;

        const p = processBatch(assignedWorker, batchToDispatch, timing);
        activeWorkers.add(p);
        p.finally(() => activeWorkers.delete(p));

        if (activeWorkers.size >= WORKERS_COUNT) {
          await Promise.race(activeWorkers);
        }
      }
    }
  }

  // Drain remaining batch
  if (currentBatch.length > 0 && (totalCandidatesProcessed + currentBatch.length <= TARGET_LIMIT)) {
    const sourceReadMs = (performance.now() - tReadBatch0) - tNormTotalMs;
    const timing = { sourceReadMs: Math.max(sourceReadMs, 0), normalizeHmacMs: tNormTotalMs };
    const assignedWorker = (workerIdx % WORKERS_COUNT) + 1;
    const p = processBatch(assignedWorker, currentBatch, timing);
    activeWorkers.add(p);
    p.finally(() => activeWorkers.delete(p));
  }

  await Promise.all(activeWorkers);
  const t1_run = performance.now();

  const totalWallTimeSec = (t1_run - t0_run) / 1000;
  const CAND_SEC = Number((totalCandidatesProcessed / totalWallTimeSec).toFixed(2));
  const NEW_SEC = Number((totalNetNewCommitted / totalWallTimeSec).toFixed(2));
  const BACKPRESSURE_PAUSE_SEC = Number((totalBackpressureWaitMs / 1000).toFixed(2));
  const BACKPRESSURE_PAUSE_PERCENT = Number(((totalBackpressureWaitMs / 1000) / totalWallTimeSec * 100).toFixed(2));

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

  // Result object
  const report = {
    CONFIG_NAME,
    WORKERS: WORKERS_COUNT,
    BATCH_SIZE,
    START_LINE,
    LIMIT: TARGET_LIMIT,
    TOTAL_WALL_TIME_SEC: Number(totalWallTimeSec.toFixed(2)),
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
    BACKPRESSURE_PAUSE_SEC,
    BACKPRESSURE_PAUSE_PERCENT,
    OUTBOX_PENDING_DELTA: outboxPendingDelta,
    PERCENTILES: {
      TOTAL_BATCH: {
        P50: percentile(metrics.TOTAL_BATCH_MS, 50),
        P95: percentile(metrics.TOTAL_BATCH_MS, 95),
        P99: percentile(metrics.TOTAL_BATCH_MS, 99)
      },
      COMMIT: {
        P50: percentile(metrics.COMMIT_MS, 50),
        P95: percentile(metrics.COMMIT_MS, 95),
        P99: percentile(metrics.COMMIT_MS, 99)
      },
      IDENTITY_INSERT: {
        P50: percentile(metrics.IDENTITY_INSERT_MS, 50),
        P95: percentile(metrics.IDENTITY_INSERT_MS, 95),
        P99: percentile(metrics.IDENTITY_INSERT_MS, 99)
      },
      OUTBOX_INSERT: {
        P50: percentile(metrics.OUTBOX_INSERT_MS, 50),
        P95: percentile(metrics.OUTBOX_INSERT_MS, 95),
        P99: percentile(metrics.OUTBOX_INSERT_MS, 99)
      },
      FALLBACK_LOOKUP: {
        P50: percentile(metrics.FALLBACK_LOOKUP_MS, 50),
        P95: percentile(metrics.FALLBACK_LOOKUP_MS, 95),
        P99: percentile(metrics.FALLBACK_LOOKUP_MS, 99)
      },
      FIELD_CLASSIFY: {
        P50: percentile(metrics.FIELD_CLASSIFY_MS, 50),
        P95: percentile(metrics.FIELD_CLASSIFY_MS, 95),
        P99: percentile(metrics.FIELD_CLASSIFY_MS, 99)
      },
      NORMALIZE_HMAC: {
        P50: percentile(metrics.NORMALIZE_HMAC_MS, 50),
        P95: percentile(metrics.NORMALIZE_HMAC_MS, 95),
        P99: percentile(metrics.NORMALIZE_HMAC_MS, 99)
      },
      SOURCE_READ: {
        P50: percentile(metrics.SOURCE_READ_MS, 50),
        P95: percentile(metrics.SOURCE_READ_MS, 95),
        P99: percentile(metrics.SOURCE_READ_MS, 99)
      }
    },
    STAGE_ACCUMULATED_MS: {
      SOURCE_READ: Number(metrics.SOURCE_READ_MS.reduce((a, b) => a + b, 0).toFixed(1)),
      NORMALIZATION_HMAC: Number(metrics.NORMALIZE_HMAC_MS.reduce((a, b) => a + b, 0).toFixed(1)),
      FIELD: Number(metrics.FIELD_CLASSIFY_MS.reduce((a, b) => a + b, 0).toFixed(1)),
      FALLBACK: Number(metrics.FALLBACK_LOOKUP_MS.reduce((a, b) => a + b, 0).toFixed(1)),
      PG_IDENTITY_WRITE: Number(metrics.IDENTITY_INSERT_MS.reduce((a, b) => a + b, 0).toFixed(1)),
      PG_OUTBOX_WRITE: Number(metrics.OUTBOX_INSERT_MS.reduce((a, b) => a + b, 0).toFixed(1)),
      COMMIT: Number(metrics.COMMIT_MS.reduce((a, b) => a + b, 0).toFixed(1)),
      BACKPRESSURE: Number(totalBackpressureWaitMs.toFixed(1))
    }
  };

  const reportPath = `reports/atlas/discovery/atlas_perf_1m30_bench_${CONFIG_NAME.toLowerCase()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log(`✅ BENCHMARK COMPLETE: ${CONFIG_NAME}`);
  console.log(`CAND_SEC: ${CAND_SEC} | NEW_SEC: ${NEW_SEC}`);
  console.log(`WALL_TIME: ${report.TOTAL_WALL_TIME_SEC}s | NET_NEW: ${totalNetNewCommitted.toLocaleString()}`);
  console.log(`TOTAL_BATCH P50: ${report.PERCENTILES.TOTAL_BATCH.P50}ms | P95: ${report.PERCENTILES.TOTAL_BATCH.P95}ms`);
  console.log(`COMMIT P50: ${report.PERCENTILES.COMMIT.P50}ms | P95: ${report.PERCENTILES.COMMIT.P95}ms`);
  console.log(`BACKPRESSURE_PAUSE: ${BACKPRESSURE_PAUSE_SEC}s (${BACKPRESSURE_PAUSE_PERCENT}%)`);
  console.log(`Report saved to: ${reportPath}`);
  console.log('================================================================\n');

  return report;
}

main().catch(err => {
  console.error('FATAL BENCHMARK ERROR:', err);
  process.exit(1);
});
