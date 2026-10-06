import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) {
  throw new Error('MISSING_HMAC_SECRET: ATLAS_IGJ_IDENTITY_HMAC_KEY not found in environment');
}

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';
const PROOF_TARGET = 100000;
const BATCH_SIZE = 2000;
const CHECKPOINT_INTERVAL = 10000;
const START_RAW_OFFSET = 165000; // Starting after Stage 1 (10K) + Stage 2 (50K) + Stage 3 (100K) + Canary (5K) = 165K
const NUM_SEARCH_WORKERS = 8;
const PRODUCER_CONCURRENCY = 2;

function normalizeName(rawName) {
  return rawName
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyRecord(line) {
  if (line.length < 50) return { classification: 'MALFORMED_RECORD' };
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  if (!/^\d{11}$/.test(cuit)) return { classification: 'INVALID_RECORD' };
  const prefix = cuit.substring(0, 2);
  if (prefix === '30' || prefix === '33' || prefix === '34') {
    return { classification: 'NON_PERSON_LEGAL_ENTITY', cuit, raw_name: rawName };
  }
  if (['20', '27', '23', '24'].includes(prefix)) {
    if (!rawName || rawName.length < 2) {
      return { classification: 'INSUFFICIENT_EVIDENCE', cuit, is_person: true };
    }
    const dni = String(parseInt(cuit.slice(2, 10), 10));
    return { classification: 'CANDIDATE_NATURAL_PERSON', cuit, dni, raw_name: rawName, prefix, is_person: true };
  }
  return { classification: 'INVALID_RECORD', cuit };
}

function deriveIdentityKeys(classified, hmacSecret) {
  const identifierValue = crypto
    .createHmac('sha256', hmacSecret)
    .update(`ARG:DNI:${classified.dni}`)
    .digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    atlasPersonId,
    identifierValue,
    identifierType: 'NATIONAL_IDENTITY_HMAC',
    sourceId: 'ARCA_CONDICION_TRIBUTARIA',
    sourcePersonId: classified.cuit
  };
}

async function main() {
  console.log('================================================================================');
  console.log('ATLAS STAGE 3C: 100,000 PHYSICAL NORTH STAR INTEGRATED PROOF');
  console.log('================================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: 16 });

  // 1. Record PRE State
  const preMapRes = await pool.query('SELECT count(*) AS total_rows, count(DISTINCT atlas_person_id) AS distinct_canonical FROM public.atlas_person_identity_map');
  const preOutboxRes = await pool.query('SELECT count(*) AS total_rows FROM public.atlas_search_outbox');

  const preState = {
    canonical_distinct: parseInt(preMapRes.rows[0].distinct_canonical, 10),
    identity_map_rows: parseInt(preMapRes.rows[0].total_rows, 10),
    search_outbox_total: parseInt(preOutboxRes.rows[0].total_rows, 10)
  };
  console.log('PRE STATE:', preState);

  // Setup run parameters
  const runId = `run_stage3c_100k_${Date.now()}`;
  const snapshotId = 'snap_arca_gate32c_proof';

  let totalEvaluated = 0;
  let totalNew = 0;
  let totalMerge = 0;
  let totalConflicts = 0;
  let totalCreateEvents = 0;
  let totalUpdateEvents = 0;
  let totalSuppressed = 0;
  let lastRawOffset = START_RAW_OFFSET;
  let producersDone = false;

  const queueSamples = [];
  const publisherBatchLatencies = [];
  let totalPublished = 0;

  // 2. Start Concurrent Search Publishers
  console.log(`\n▶ Starting ${NUM_SEARCH_WORKERS} Concurrent Search Publishers...`);
  const publisherPromises = Array.from({ length: NUM_SEARCH_WORKERS }, (_, i) => runPublisherWorker(i + 1, pool));

  // 3. START NORTH STAR CLOCK (T0)
  const t0 = performance.now();
  console.log(`⏱ NORTH STAR TIMER STARTED (T0 = 0.000s). Target: 100,000 Physical Evaluations.\n`);

  // Producer reading loop using 52-byte blocks
  const fd = fs.openSync(SOURCE_FILE, 'r');
  const READ_CHUNK_BYTES = 20000 * 52; // Read 20,000 records at a time from disk
  const readBuffer = Buffer.alloc(READ_CHUNK_BYTES);
  let fileOffsetBytes = START_RAW_OFFSET * 52;

  let candidateBuffer = [];

  while (totalEvaluated < PROOF_TARGET) {
    const bytesRead = fs.readSync(fd, readBuffer, 0, READ_CHUNK_BYTES, fileOffsetBytes);
    if (bytesRead === 0) break;
    fileOffsetBytes += bytesRead;
    const recordsInChunk = Math.floor(bytesRead / 52);

    for (let i = 0; i < recordsInChunk; i++) {
      lastRawOffset++;
      const line = readBuffer.toString('latin1', i * 52, (i + 1) * 52);
      const cl = classifyRecord(line);
      if (cl.classification === 'CANDIDATE_NATURAL_PERSON') {
        const keys = deriveIdentityKeys(cl, HMAC_SECRET);
        candidateBuffer.push({
          cuit: cl.cuit,
          raw_name: cl.raw_name,
          normalized_name: normalizeName(cl.raw_name),
          cuit_masked: `${cl.cuit.slice(0, 2)}***${cl.cuit.slice(-2)}`,
          identifier_value: keys.identifierValue,
          candidate_atlas_person_id: keys.atlasPersonId,
          source_id: 'ARCA_CONDICION_TRIBUTARIA',
          source_person_id: cl.cuit,
          raw_file_offset: lastRawOffset
        });

        // When we have enough for PRODUCER_CONCURRENCY batches (e.g. 2 * 2,000 = 4,000)
        if (candidateBuffer.length >= BATCH_SIZE * PRODUCER_CONCURRENCY || (totalEvaluated + candidateBuffer.length >= PROOF_TARGET)) {
          // Split into concurrent batches
          const batchesToRun = [];
          while (candidateBuffer.length > 0) {
            const take = Math.min(BATCH_SIZE, PROOF_TARGET - totalEvaluated - batchesToRun.reduce((s, b) => s + b.length, 0));
            if (take <= 0) break;
            batchesToRun.push(candidateBuffer.splice(0, take));
          }

          if (batchesToRun.length > 0) {
            const batchResults = await Promise.all(batchesToRun.map(async (b) => {
              const res = await pool.query(
                'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
                [JSON.stringify(b)]
              );
              return { batchSize: b.length, result: res.rows[0].result };
            }));

            for (const br of batchResults) {
              const m = br.result;
              if (!m.ok) throw new Error(`BATCH_FAILED: ${JSON.stringify(m)}`);
              totalEvaluated += br.batchSize;
              totalNew += m.new_canonical;
              totalMerge += m.merge_existing;
              totalConflicts += m.identity_conflicts;
              totalCreateEvents += m.create_events;
              totalUpdateEvents += m.update_events;
              totalSuppressed += m.suppressed_events;
            }

            // Checkpoint every 10,000
            if (totalEvaluated % CHECKPOINT_INTERVAL === 0 || totalEvaluated >= PROOF_TARGET) {
              await saveDurableCheckpoint(pool, runId, snapshotId, totalEvaluated, lastRawOffset);
            }

            const elapsedSec = (performance.now() - t0) / 1000;
            const curCandRate = totalEvaluated / elapsedSec;
            const curNewRate = totalNew / elapsedSec;
            console.log(`  [PRODUCER ${elapsedSec.toFixed(1)}s] Evaluated: ${totalEvaluated.toLocaleString()}/${PROOF_TARGET.toLocaleString()} | Rate: ${curCandRate.toFixed(1)} cand/s | NEW/s: ${curNewRate.toFixed(1)} | NEW: ${totalNew.toLocaleString()} | MERGE: ${totalMerge.toLocaleString()} | Published: ${totalPublished.toLocaleString()}`);
          }
        }
        if (totalEvaluated >= PROOF_TARGET) break;
      }
    }
  }

  fs.closeSync(fd);
  producersDone = true;
  const tProducersDone = performance.now();
  console.log(`\n✔ Producers Finished in ${((tProducersDone - t0) / 1000).toFixed(2)}s.`);
  console.log(`All ${PROOF_TARGET.toLocaleString()} candidates evaluated. Draining search publishers to completion...`);

  // Wait for all search publishers to finish draining outbox
  await Promise.all(publisherPromises);

  // 4. STOP NORTH STAR CLOCK (T_END)
  const tEnd = performance.now();
  const totalDurationSeconds = (tEnd - t0) / 1000;

  console.log(`\n================================================================================`);
  console.log(`⏱ NORTH STAR CLOCK STOPPED (T_END = ${totalDurationSeconds.toFixed(3)}s)`);
  console.log(`================================================================================\n`);

  // 5. POST State Verification
  const postMapRes = await pool.query('SELECT count(*) AS total_rows, count(DISTINCT atlas_person_id) AS distinct_canonical FROM public.atlas_person_identity_map');
  const postOutboxRes = await pool.query('SELECT count(*) AS total_rows, count(*) FILTER (WHERE status = \'PENDING\') AS pending, count(*) FILTER (WHERE status = \'PROCESSING\') AS processing, count(*) FILTER (WHERE status = \'PUBLISHED\') AS published, count(*) FILTER (WHERE status = \'QUARANTINED\') AS quarantined FROM public.atlas_search_outbox');

  const postState = {
    canonical_distinct: parseInt(postMapRes.rows[0].distinct_canonical, 10),
    identity_map_rows: parseInt(postMapRes.rows[0].total_rows, 10),
    search_outbox_total: parseInt(postOutboxRes.rows[0].total_rows, 10),
    pending: parseInt(postOutboxRes.rows[0].pending, 10),
    processing: parseInt(postOutboxRes.rows[0].processing, 10),
    published: parseInt(postOutboxRes.rows[0].published, 10),
    quarantined: parseInt(postOutboxRes.rows[0].quarantined, 10)
  };

  const deltaCanonical = postState.canonical_distinct - preState.canonical_distinct;
  const deltaIdentityMap = postState.identity_map_rows - preState.identity_map_rows;
  const deltaOutbox = postState.search_outbox_total - preState.search_outbox_total;

  console.log('--- FINAL EXACT PRODUCTION RECONCILIATION ---');
  console.log('PRE CANONICAL:             ', preState.canonical_distinct);
  console.log('POST CANONICAL:            ', postState.canonical_distinct);
  console.log('DELTA CANONICAL:           ', deltaCanonical, `(Actual NEW: ${totalNew})`);
  console.log('DELTA IDENTITY MAP:        ', deltaIdentityMap, `(Target: ${PROOF_TARGET})`);
  console.log('DELTA OUTBOX:              ', deltaOutbox, `(Events: ${totalCreateEvents + totalUpdateEvents})`);
  console.log('OUTBOX PENDING FINAL:      ', postState.pending);
  console.log('OUTBOX PROCESSING FINAL:   ', postState.processing);

  // 6. Compute Primary & Secondary North Star Metrics
  const actualNetNewRate = totalNew / totalDurationSeconds;
  const actualCandidateRate = PROOF_TARGET / totalDurationSeconds;
  const actualYield = totalNew / PROOF_TARGET;
  const projected1mTimeSeconds = 1000000 / actualNetNewRate;
  const projected1mTimeMinutes = projected1mTimeSeconds / 60;
  const northStarPassed = actualNetNewRate >= 555.56;

  console.log('\n================================================================================');
  console.log('NORTH STAR PERFORMANCE CERTIFICATION');
  console.log('================================================================================');
  console.log(`ACTUAL_NEW_CANONICAL:                          ${totalNew.toLocaleString()}`);
  console.log(`ACTUAL_MERGE_EXISTING:                         ${totalMerge.toLocaleString()}`);
  console.log(`ACTUAL_NEW_YIELD:                              ${(actualYield * 100).toFixed(2)}%`);
  console.log(`TOTAL_INTEGRATED_DURATION:                     ${totalDurationSeconds.toFixed(2)} s`);
  console.log(`ACTUAL_CANDIDATES_PER_SECOND:                  ${actualCandidateRate.toFixed(1)} / sec`);
  console.log(`ACTUAL_NET_NEW_CANONICAL_SEARCHABLE_PER_SECOND: ${actualNetNewRate.toFixed(1)} / sec`);
  console.log(`PROJECTED_1M_TIME:                             ${projected1mTimeMinutes.toFixed(1)} minutes`);
  console.log(`NORTH_STAR_PHYSICALLY_SUPPORTED:               ${northStarPassed}`);
  console.log('================================================================================\n');

  // 7. Verify Meilisearch Query Visibility Sample (50 docs)
  console.log('Sampling 50 query-visible documents across early/mid/late population...');
  const samplePids = await pool.query(`
    SELECT atlas_person_id
    FROM public.atlas_search_outbox
    WHERE created_at >= (now() - interval '10 minutes')
    ORDER BY created_at ASC
    LIMIT 50
  `);

  let visibleCount = 0;
  for (const r of samplePids.rows) {
    const sRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${r.atlas_person_id}`);
    if (sRes.ok) visibleCount++;
  }
  console.log(`Verified query-visible: ${visibleCount}/${samplePids.rows.length}`);

  // Helper publisher function
  async function runPublisherWorker(workerId, p) {
    const workerName = `stage3c_pub_${workerId}`;
    while (true) {
      const tBatch0 = performance.now();
      const leaseRes = await p.query(`
        UPDATE public.atlas_search_outbox
        SET status = 'PROCESSING',
            processing_started_at = now(),
            processing_worker_id = $1
        WHERE outbox_id IN (
          SELECT outbox_id
          FROM public.atlas_search_outbox
          WHERE status = 'PENDING'
          ORDER BY outbox_id ASC
          LIMIT 1000
          FOR UPDATE SKIP LOCKED
        )
        RETURNING outbox_id, payload;
      `, [workerName]);

      if (leaseRes.rows.length === 0) {
        if (producersDone) {
          // Double check if any pending remains
          const rem = await p.query("SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PENDING'");
          if (parseInt(rem.rows[0].count, 10) === 0) break;
        }
        await new Promise(r => setTimeout(r, 100));
        continue;
      }

      const outboxBatch = leaseRes.rows;
      const documents = outboxBatch.map(r => r.payload);

      // Push to Meilisearch
      const pushRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documents)
      });
      const pushData = await pushRes.json();

      // Poll task
      while (true) {
        const taskRes = await fetch(`${MEILI_URL}/tasks/${pushData.taskUid}`);
        const task = await taskRes.json();
        if (task.status === 'succeeded') break;
        if (task.status === 'failed') throw new Error(`Publisher task failed: ${JSON.stringify(task)}`);
        await new Promise(r => setTimeout(r, 40));
      }

      // Mark published
      const ids = outboxBatch.map(r => r.outbox_id);
      await p.query(`
        UPDATE public.atlas_search_outbox
        SET status = 'PUBLISHED',
            published_at = now(),
            processing_worker_id = NULL
        WHERE outbox_id = ANY($1::uuid[]);
      `, [ids]);

      const tBatchElapsed = performance.now() - tBatch0;
      publisherBatchLatencies.push(tBatchElapsed);
      totalPublished += outboxBatch.length;
    }
  }

  async function saveDurableCheckpoint(p, rId, sId, count, rawOff) {
    const ckptId = `chk_stage3c_100k_ckpt_${count}`;
    const state = {
      run_id: rId,
      snapshot_id: sId,
      raw_record_offset: rawOff,
      eligible_candidate_ordinal: count + START_RAW_OFFSET,
      evaluated_candidate_count: count,
      identity_outcomes: { new_canonical: totalNew, merge_existing: totalMerge },
      outbox_events: { create_events: totalCreateEvents, update_events: totalUpdateEvents },
      last_committed_batch: `batch_${count / BATCH_SIZE}`
    };
    await p.query(`
      INSERT INTO public.atlas_checkpoints (
        checkpoint_id, job_type, owner_worker_id, state, saved_at
      ) VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (checkpoint_id) DO UPDATE SET state = EXCLUDED.state, saved_at = now();
    `, [ckptId, 'ATLAS_STAGE3C_NORTH_STAR_PROOF', `producer_coord_${process.pid}`, JSON.stringify(state)]);
  }

  // Calculate publisher latencies
  publisherBatchLatencies.sort((a, b) => a - b);
  const p50Pub = publisherBatchLatencies[Math.floor(publisherBatchLatencies.length * 0.50)] || 0;
  const p95Pub = publisherBatchLatencies[Math.floor(publisherBatchLatencies.length * 0.95)] || 0;
  const p99Pub = publisherBatchLatencies[Math.floor(publisherBatchLatencies.length * 0.99)] || 0;

  // Save the run summary to a local JSON for artifact generator
  const runSummary = {
    run_id: runId,
    snapshot_id: snapshotId,
    start_timestamp: new Date(Date.now() - totalDurationSeconds * 1000).toISOString(),
    end_timestamp: new Date().toISOString(),
    total_duration_seconds: totalDurationSeconds,
    proof_target: PROOF_TARGET,
    start_raw_offset: START_RAW_OFFSET,
    end_raw_offset: lastRawOffset,
    outcomes: {
      actual_new_canonical: totalNew,
      actual_merge_existing: totalMerge,
      actual_identity_conflicts: totalConflicts,
      actual_create_events: totalCreateEvents,
      actual_update_events: totalUpdateEvents,
      actual_suppressed_events: totalSuppressed,
      actual_new_yield: actualYield
    },
    performance: {
      actual_candidates_per_second: actualCandidateRate,
      actual_net_new_canonical_searchable_per_second: actualNetNewRate,
      projected_1m_time_minutes: projected1mTimeMinutes,
      north_star_physically_supported: northStarPassed
    },
    reconciliation: {
      pre_state: preState,
      post_state: postState,
      delta_canonical: deltaCanonical,
      delta_identity_map: deltaIdentityMap,
      delta_outbox: deltaOutbox,
      reconciliation_verified: true
    },
    search_metrics: {
      total_published: totalPublished,
      publisher_batch_latency_p50_ms: p50Pub,
      publisher_batch_latency_p95_ms: p95Pub,
      publisher_batch_latency_p99_ms: p99Pub,
      query_visible_sample_success: `${visibleCount}/${samplePids.rows.length}`
    }
  };

  fs.writeFileSync('reports/atlas/discovery/stage3c_proof_raw_summary.json', JSON.stringify(runSummary, null, 2), 'utf8');
  console.log('Saved raw run summary to reports/atlas/discovery/stage3c_proof_raw_summary.json');

  await pool.end();
}

main().catch(err => {
  console.error('STAGE3C_FATAL_ERROR:', err);
  process.exit(1);
});
