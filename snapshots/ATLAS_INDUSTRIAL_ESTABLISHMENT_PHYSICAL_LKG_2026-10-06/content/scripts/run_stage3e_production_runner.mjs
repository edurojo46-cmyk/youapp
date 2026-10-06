import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { assertMutationAllowed, verifyPreWriteFingerprint } from './production_safety_guard.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
if (!HMAC_SECRET) throw new Error('MISSING_HMAC_SECRET');

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';

function normalizeName(rawName) {
  return rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCandidate(line) {
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  const dni = String(parseInt(cuit.slice(2, 10), 10));
  const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    cuit,
    raw_name: rawName,
    normalized_name: normalizeName(rawName),
    cuit_masked: `${cuit.slice(0, 2)}***${cuit.slice(-2)}`,
    identifier_value: identifierValue,
    candidate_atlas_person_id: atlasPersonId,
    source_id: 'ARCA_CONDICION_TRIBUTARIA',
    source_person_id: cuit
  };
}

async function loadRangeCandidates(startOffset, count) {
  console.log(`Loading ${count} candidates from physical offset ${startOffset}...`);
  const candidates = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (idx >= startOffset) {
      if (line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
        candidates.push(parseCandidate(line));
        if (candidates.length >= count) break;
      }
    }
    idx++;
  }
  return candidates;
}

/**
 * Execute a production run with live concurrent publishers
 */
export async function executeProductionRun(options) {
  const {
    runName,
    startOffset,
    candidateCount,
    producerConcurrency,
    producerBatch,
    publisherWorkers,
    publisherBatch,
    checkpointInterval = 20000
  } = options;

  console.log(`\n================================================================`);
  console.log(`🚀 EXECUTING PRODUCTION RUN: ${runName}`);
  console.log(`   Candidate Count: ${candidateCount} (Offset: ${startOffset} -> ${startOffset + candidateCount})`);
  console.log(`   Producers: ${producerConcurrency} workers (batch ${producerBatch})`);
  console.log(`   Publishers: ${publisherWorkers} workers (batch ${publisherBatch})`);
  console.log(`   Checkpoint Interval: ${checkpointInterval}`);
  console.log(`================================================================\n`);

  // 1. Layer A & B Safety Guard
  assertMutationAllowed(import.meta.url);

  const dbConfig = parseDbUrl();
  const preClient = new pg.Client(dbConfig);
  await preClient.connect();

  // 2. Layer D Fingerprint Verification
  const fingerprint = await verifyPreWriteFingerprint(preClient, { runId: runName });
  const preCounts = fingerprint.currentCounts;
  await preClient.end();

  // 3. Load candidates into memory
  const candidates = await loadRangeCandidates(startOffset, candidateCount);
  if (candidates.length !== candidateCount) {
    throw new Error(`CANDIDATE_COUNT_MISMATCH: Loaded ${candidates.length}, expected ${candidateCount}`);
  }

  // 4. Divide into producer batches
  const batches = [];
  for (let i = 0; i < candidates.length; i += producerBatch) {
    batches.push(candidates.slice(i, i + producerBatch));
  }

  // 5. Initialize client pools
  const producerClients = [];
  for (let i = 0; i < producerConcurrency; i++) {
    const c = new pg.Client(dbConfig);
    await c.connect();
    producerClients.push(c);
  }

  const publisherClients = [];
  for (let i = 0; i < publisherWorkers; i++) {
    const c = new pg.Client(dbConfig);
    await c.connect();
    publisherClients.push(c);
  }

  const monitorClient = new pg.Client(dbConfig);
  await monitorClient.connect();

  let batchIdx = 0;
  let producerDone = false;
  let maxQueueObserved = 0;

  let totalNewCanonical = 0;
  let totalMergeExisting = 0;
  let totalCreateEvents = 0;
  let totalUpdateEvents = 0;
  let totalSuppressedEvents = 0;
  let totalPublishedByWorkers = 0;

  // Authoritative Timers
  const T0 = Date.now();
  let T_PRODUCER_END = 0;

  let inFlightEvents = 0;
  let abortError = null;

  // Producer Worker
  async function producerWorker(workerId, client) {
    while (true) {
      if (abortError) throw abortError;
      if (batchIdx >= batches.length) break;

      // Exact in-memory backpressure: throttle producers when publishers have >= 2,500 in flight
      while (inFlightEvents >= 2500) {
        if (abortError) throw abortError;
        await new Promise(r => setTimeout(r, 20));
      }

      const currentBatch = batches[batchIdx++];

      const res = await client.query(
        'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
        [JSON.stringify(currentBatch)]
      );
      const r = res.rows[0].result;
      if (!r.ok) throw new Error(`RPC_FAILED: ${JSON.stringify(r)}`);

      const batchNewEvents = (r.create_events || 0) + (r.update_events || 0);
      inFlightEvents += batchNewEvents;

      totalNewCanonical += r.new_canonical || 0;
      totalMergeExisting += r.merge_existing || 0;
      totalCreateEvents += r.create_events || 0;
      totalUpdateEvents += r.update_events || 0;
      totalSuppressedEvents += r.suppressed_events || 0;
    }
  }

  // Publisher Worker
  async function publisherWorker(workerId, client) {
    const workerTag = `stage3e_pub_${workerId}`;
    while (true) {
      if (abortError) throw abortError;
      // 1. Claim Batch with FOR UPDATE SKIP LOCKED
      const claimRes = await client.query(`
        UPDATE public.atlas_search_outbox
        SET status = 'PROCESSING', processing_started_at = clock_timestamp(), processing_worker_id = $2
        WHERE outbox_id IN (
          SELECT outbox_id
          FROM public.atlas_search_outbox
          WHERE status = 'PENDING'
          ORDER BY outbox_id ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING outbox_id, atlas_person_id, payload
      `, [publisherBatch, workerTag]);

      if (claimRes.rowCount === 0) {
        if (producerDone) {
          const rem = await client.query("SELECT 1 FROM public.atlas_search_outbox WHERE status = 'PENDING' LIMIT 1");
          if (rem.rowCount === 0) break;
        }
        await new Promise(r => setTimeout(r, 40));
        continue;
      }

      const rows = claimRes.rows;
      const outboxIds = rows.map(r => r.outbox_id);
      const docs = rows.map(r => r.payload);

      // 2. Push to Meilisearch Delta Index
      const mRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?primaryKey=atlas_person_id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });
      if (!mRes.ok) {
        const errText = await mRes.text();
        throw new Error(`MEILI_PUSH_FAILED (${mRes.status}): ${errText}`);
      }
      const mData = await mRes.json();
      if (!mData.taskUid) throw new Error(`MEILI_PUSH_NO_UID: ${JSON.stringify(mData)}`);

      // 3. Wait for Meili Task Success
      while (true) {
        const tRes = await fetch(`${MEILI_URL}/tasks/${mData.taskUid}`);
        const t = await tRes.json();
        if (t.status === 'succeeded') break;
        if (t.status === 'failed') throw new Error(`MEILI_TASK_FAILED: ${JSON.stringify(t.error)}`);
        await new Promise(r => setTimeout(r, 15));
      }

      // 4. Bulk Set-Based ACK Published
      await client.query(`
        UPDATE public.atlas_search_outbox
        SET status = 'PUBLISHED', published_at = clock_timestamp(), processing_worker_id = NULL
        WHERE outbox_id = ANY($1::uuid[])
      `, [outboxIds]);

      inFlightEvents = Math.max(0, inFlightEvents - rows.length);
      totalPublishedByWorkers += rows.length;
    }
  }

  // Monitor Queue Loop
  let monitoring = true;
  const monitorLoop = (async () => {
    while (monitoring) {
      if (inFlightEvents > maxQueueObserved) maxQueueObserved = inFlightEvents;
      if (inFlightEvents >= 15000) {
        abortError = new Error(`ABORT_CONDITION_TRIGGERED: In-flight queue exceeded 15,000 (${inFlightEvents})!`);
        console.error(`\n🚨 [MONITOR TRIGGERED ABORT]: ${abortError.message}\n`);
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }
  })();

  // Execute Producers and Publishers
  const producerPromises = Promise.all(producerClients.map((c, i) => producerWorker(i, c))).then(() => {
    producerDone = true;
    T_PRODUCER_END = Date.now();
    console.log(`  Producers finished at ${( (T_PRODUCER_END - T0) / 1000 ).toFixed(3)}s. Waiting for publisher queue drain...`);
  });

  const publisherPromises = Promise.all(publisherClients.map((c, i) => publisherWorker(i, c)));

  await producerPromises;
  await publisherPromises;
  monitoring = false;
  await monitorLoop;
  if (abortError) throw abortError;

  // Poll Meilisearch delta index until isIndexing === false
  console.log('  Waiting for Meilisearch indexing to reach idle...');
  while (true) {
    const statsRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/stats`);
    const s = await statsRes.json();
    if (!s.isIndexing) break;
    await new Promise(r => setTimeout(r, 20));
  }

  // Sample Query Visibility Check (50 documents from outbox published during run)
  console.log('  Verifying query visibility sample...');
  const sampleOutboxRes = await monitorClient.query(`
    SELECT DISTINCT atlas_person_id 
    FROM public.atlas_search_outbox 
    WHERE status = 'PUBLISHED' 
      AND published_at >= $1
    LIMIT 50
  `, [new Date(T0).toISOString()]);
  const samplePids = sampleOutboxRes.rows.map(r => r.atlas_person_id);
  let visibleCount = 0;
  for (const pid of samplePids) {
    const qRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${pid}`);
    if (qRes.ok) visibleCount++;
  }
  console.log(`  Sample query visibility: ${visibleCount} / ${samplePids.length}`);
  if (samplePids.length === 0 || visibleCount < samplePids.length) {
    throw new Error(`QUERY_VISIBILITY_FAILED: Only ${visibleCount}/${samplePids.length} visible in search queries!`);
  }

  const T_END = Date.now();

  for (const c of producerClients) await c.end();
  for (const c of publisherClients) await c.end();
  await monitorClient.end();

  // Durations
  const producerDurationSec = (T_PRODUCER_END - T0) / 1000;
  const totalDurationSec = (T_END - T0) / 1000;
  const drainTailSec = (T_END - T_PRODUCER_END) / 1000;

  // Physical Rates
  const actualCandidateRate = candidateCount / producerDurationSec;
  const actualProducerNewRate = totalNewCanonical / producerDurationSec;
  const actualSearchArrivalRate = (totalCreateEvents + totalUpdateEvents) / producerDurationSec;
  const actualPublisherRate = (totalCreateEvents + totalUpdateEvents) / totalDurationSec;
  const actualNetNewSearchableRate = totalNewCanonical / totalDurationSec;
  const actualNewYield = totalNewCanonical / candidateCount;

  // Post-run SSOT counts verification
  const postClient = new pg.Client(dbConfig);
  await postClient.connect();
  const postCountsRes = await postClient.query(`
    SELECT 
      (SELECT count(DISTINCT atlas_person_id) FROM public.atlas_person_identity_map) as canonical_distinct,
      (SELECT count(*) FROM public.atlas_person_identity_map) as identity_map_rows,
      (SELECT count(*) FROM public.atlas_search_outbox) as search_outbox_total,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PENDING') as pending,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PROCESSING') as processing,
      (SELECT count(*) FROM public.atlas_search_outbox WHERE status = 'PUBLISHED') as published
  `);
  const postCounts = {
    canonical_distinct: parseInt(postCountsRes.rows[0].canonical_distinct, 10),
    identity_map_rows: parseInt(postCountsRes.rows[0].identity_map_rows, 10),
    search_outbox_total: parseInt(postCountsRes.rows[0].search_outbox_total, 10),
    pending: parseInt(postCountsRes.rows[0].pending, 10),
    processing: parseInt(postCountsRes.rows[0].processing, 10),
    published: parseInt(postCountsRes.rows[0].published, 10)
  };
  await postClient.end();

  // Reconciliation Deltas
  const deltaCanonical = postCounts.canonical_distinct - preCounts.canonical_distinct;
  const deltaMap = postCounts.identity_map_rows - preCounts.identity_map_rows;
  const deltaOutbox = postCounts.search_outbox_total - preCounts.search_outbox_total;

  console.log('\n--- RECONCILIATION DELTAS ---');
  console.log(`  Canonical Increase:    ${deltaCanonical} (Expected: ${totalNewCanonical})`);
  console.log(`  Identity Map Increase: ${deltaMap} (Expected: ${candidateCount})`);
  console.log(`  Outbox Increase:       ${deltaOutbox} (Expected: ${totalCreateEvents + totalUpdateEvents})`);
  console.log(`  Terminal Queue:        Pending=${postCounts.pending}, Processing=${postCounts.processing}`);

  if (deltaCanonical !== totalNewCanonical || deltaMap !== candidateCount || deltaOutbox !== (totalCreateEvents + totalUpdateEvents)) {
    throw new Error('RECONCILIATION_MISMATCH: Live database deltas do not match candidate evaluation totals!');
  }
  if (postCounts.pending > 0 || postCounts.processing > 0) {
    throw new Error(`UNFINISHED_QUEUE: Queue not fully drained (${postCounts.pending} pending, ${postCounts.processing} processing)!`);
  }

  const runSummary = {
    runName,
    startOffset,
    candidateCount,
    producerConcurrency,
    producerBatch,
    publisherWorkers,
    publisherBatch,
    checkpointInterval,
    outcomes: {
      actualNewCanonical: totalNewCanonical,
      actualMergeExisting: totalMergeExisting,
      actualCreateEvents: totalCreateEvents,
      actualUpdateEvents: totalUpdateEvents,
      actualSuppressedEvents: totalSuppressedEvents,
      actualNewYield: parseFloat(actualNewYield.toFixed(4))
    },
    timing: {
      T0: new Date(T0).toISOString(),
      T_PRODUCER_END: new Date(T_PRODUCER_END).toISOString(),
      T_END: new Date(T_END).toISOString(),
      producerDurationSec: parseFloat(producerDurationSec.toFixed(3)),
      searchConcurrentDurationSec: parseFloat(producerDurationSec.toFixed(3)),
      drainTailSec: parseFloat(drainTailSec.toFixed(3)),
      totalDurationSec: parseFloat(totalDurationSec.toFixed(3))
    },
    rates: {
      candidateRatePerSec: parseFloat(actualCandidateRate.toFixed(1)),
      producerNewPerSec: parseFloat(actualProducerNewRate.toFixed(1)),
      searchArrivalRatePerSec: parseFloat(actualSearchArrivalRate.toFixed(1)),
      publisherRatePerSec: parseFloat(actualPublisherRate.toFixed(1)),
      actualNetNewSearchablePerSec: parseFloat(actualNetNewSearchableRate.toFixed(2)),
      projected1mTimeMinutes: parseFloat(((1000000 / actualNetNewSearchableRate) / 60).toFixed(1))
    },
    queue: {
      maxQueueDepth: maxQueueObserved,
      terminalPending: postCounts.pending,
      terminalProcessing: postCounts.processing
    },
    reconciliation: {
      preCounts,
      postCounts,
      deltaCanonical,
      deltaMap,
      deltaOutbox,
      verifiedExact: true
    }
  };

  console.log(`\n🎉 RUN ${runName} COMPLETE:`);
  console.log(`   ACTUAL_NET_NEW_CANONICAL_SEARCHABLE_RATE: ${actualNetNewSearchableRate.toFixed(2)} NEW/sec`);
  console.log(`   PRODUCER_NEW_RATE:                       ${actualProducerNewRate.toFixed(1)} NEW/sec`);
  console.log(`   FINAL_DRAIN_TAIL:                        ${drainTailSec.toFixed(3)}s`);
  console.log(`   PROJECTED_1M_TIME:                       ${runSummary.rates.projected1mTimeMinutes} minutes`);
  console.log(`   RECONCILIATION:                          EXACT_100%`);

  return runSummary;
}
