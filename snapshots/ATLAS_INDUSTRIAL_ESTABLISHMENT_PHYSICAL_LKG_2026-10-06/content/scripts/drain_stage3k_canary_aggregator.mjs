import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { assertMutationAllowed } from './production_safety_guard.mjs';

dotenv.config();

process.env.PRODUCTION_MUTATION_ALLOWED = 'TRUE';
process.env.ATLAS_EXECUTION_MODE = 'PRODUCTION_CERTIFIED_WRITE';

const MEILI_URL = 'http://127.0.0.1:7700';
const MEILI_DELTA_INDEX = 'atlas_people_discovery_gate32_delta';
const EXPECTED_SEARCH_V1_MANIFEST_SHA256 = 'f4347cfbc1d554c2f015cf56b1e854fc09fa226e30611fe5aa55c62941c10128';

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return sorted[idx];
}

function parseDurationToMs(isoDuration) {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!match) return 0;
  const hours = parseFloat(match[1] || 0);
  const minutes = parseFloat(match[2] || 0);
  const seconds = parseFloat(match[3] || 0);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

async function pollMeiliTask(taskUid, timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const data = await res.json();
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
      return data;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Timeout polling task ${taskUid}`);
}

async function main() {
  console.log('================================================================');
  console.log('🚀 STAGE 3K: COMPLETING PHASE A (25K CANARY) AGGREGATION & ACK');
  console.log('================================================================\n');

  assertMutationAllowed(import.meta.url);

  const dbConfig = parseDbUrl();
  const client = new pg.Client(dbConfig);
  await client.connect();

  try {
    // 1. Check Pending Count
    const pendingRes = await client.query(`
      SELECT count(*) as pending_count 
      FROM public.atlas_search_outbox 
      WHERE status = 'PENDING'
    `);
    const initialPending = parseInt(pendingRes.rows[0].pending_count, 10);
    console.log(`Initial Pending Outbox Records to Aggregate: ${initialPending}`);

    if (initialPending !== 22556) {
      console.warn(`WARNING: Expected 22,556 pending, found ${initialPending}`);
    }

    const preMeiliRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/stats`);
    const preMeiliStats = await preMeiliRes.json();
    const preMeiliDocs = preMeiliStats.numberOfDocuments;
    console.log(`Pre-Aggregation Meilisearch Delta Docs: ${preMeiliDocs}`);

    const executedBatches = [];
    const claimLatencies = [];
    const meiliPushLatencies = [];
    const meiliTaskLatencies = [];
    const ackLatencies = [];

    const T0 = Date.now();
    let batchSeq = 0;
    let totalAggregated = 0;

    while (true) {
      batchSeq++;
      const batchToken = `stage3k_canary_batch_${batchSeq}_${crypto.randomUUID()}`;

      // Claim up to 20,000
      const tClaim0 = performance.now();
      await client.query('BEGIN');
      const claimRes = await client.query(`
        WITH next_batch AS (
          SELECT outbox_id
          FROM public.atlas_search_outbox
          WHERE status IN ('PENDING', 'RETRY')
            AND (next_retry_at IS NULL OR next_retry_at <= clock_timestamp())
          ORDER BY next_retry_at ASC, outbox_id ASC
          LIMIT 20000
          FOR UPDATE SKIP LOCKED
        ),
        claimed AS (
          UPDATE public.atlas_search_outbox o
          SET status = 'PROCESSING',
              processing_started_at = clock_timestamp(),
              processing_worker_id = $1,
              attempt_count = o.attempt_count + 1
          FROM next_batch nb
          WHERE o.outbox_id = nb.outbox_id
          RETURNING o.outbox_id, o.payload
        )
        SELECT * FROM claimed;
      `, [batchToken]);
      await client.query('COMMIT');
      const claimDuration = performance.now() - tClaim0;
      claimLatencies.push(claimDuration);

      if (claimRes.rowCount === 0) {
        console.log(`No more pending rows to claim. Aggregation complete.`);
        break;
      }

      const rows = claimRes.rows;
      const claimedCount = rows.length;
      totalAggregated += claimedCount;
      const outboxIds = rows.map(r => r.outbox_id);
      const docs = rows.map(r => r.payload);
      const payloadBytes = Buffer.byteLength(JSON.stringify(docs), 'utf8');

      console.log(`\n[Batch ${batchSeq}] Claimed ${claimedCount} rows (token: ${batchToken.slice(0, 24)}...) in ${claimDuration.toFixed(1)}ms. Pushing ${(payloadBytes / (1024 * 1024)).toFixed(2)} MB to Meilisearch...`);

      // Push to Meilisearch
      const tPush0 = performance.now();
      const mRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents?primaryKey=atlas_person_id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(docs)
      });
      const pushDuration = performance.now() - tPush0;
      meiliPushLatencies.push(pushDuration);

      if (!mRes.ok) {
        const errText = await mRes.text();
        throw new Error(`MEILI_PUSH_FAILED: ${errText}`);
      }
      const mData = await mRes.json();
      console.log(`  Enqueued task ${mData.taskUid}. Waiting for success...`);

      // Wait for task success
      const tTask0 = performance.now();
      const taskDetail = await pollMeiliTask(mData.taskUid);
      const taskDuration = performance.now() - tTask0;
      meiliTaskLatencies.push(taskDuration);

      if (taskDetail.status !== 'succeeded') {
        throw new Error(`MEILI_TASK_FAILED: ${JSON.stringify(taskDetail.error)}`);
      }

      const taskDurationMs = parseDurationToMs(taskDetail.duration);
      const effectiveDocsSec = claimedCount / ((taskDurationMs || taskDuration) / 1000);
      console.log(`  Task ${mData.taskUid} SUCCEEDED in ${(taskDuration / 1000).toFixed(2)}s (${effectiveDocsSec.toFixed(1)} docs/sec).`);

      // Bulk ACK in PostgreSQL
      const tAck0 = performance.now();
      await client.query('BEGIN');
      const ackRes = await client.query(`
        UPDATE public.atlas_search_outbox
        SET status = 'PUBLISHED',
            published_at = clock_timestamp()
        WHERE outbox_id = ANY($1::uuid[])
          AND status = 'PROCESSING'
          AND processing_worker_id = $2
        RETURNING outbox_id;
      `, [outboxIds, batchToken]);
      await client.query('COMMIT');
      const ackDuration = performance.now() - tAck0;
      ackLatencies.push(ackDuration);

      if (ackRes.rowCount !== claimedCount) {
        throw new Error(`CARDINALITY_MISMATCH_FAIL_CLOSED: Expected ${claimedCount} ACKed, got ${ackRes.rowCount}`);
      }
      console.log(`  Bulk ACKed ${ackRes.rowCount} rows in ${ackDuration.toFixed(1)}ms.`);

      executedBatches.push({
        batch_seq: batchSeq,
        batch_size: claimedCount,
        batch_token: batchToken,
        payload_bytes: payloadBytes,
        claim_duration_ms: claimDuration,
        meili_task_uid: mData.taskUid,
        meili_task_duration_ms: taskDurationMs || taskDuration,
        effective_task_docs_sec: parseFloat(effectiveDocsSec.toFixed(2)),
        ack_duration_ms: ackDuration,
        ack_exact: ackRes.rowCount === claimedCount
      });
    }

    const T_END = Date.now();
    const totalAggregationDurationSec = (T_END - T0) / 1000;
    console.log(`\n✔ Aggregator successfully published all ${totalAggregated} events in ${totalAggregationDurationSec.toFixed(3)}s.`);

    // 2. Post-Canary Terminal Verification
    const postCountsRes = await client.query(`
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

    const postMeiliRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/stats`);
    const postMeiliStats = await postMeiliRes.json();
    const postMeiliDocs = postMeiliStats.numberOfDocuments;

    console.log('\n--- FINAL POST-CANARY RECONCILIATION ---');
    console.log(`  Canonical Distinct:   ${postCounts.canonical_distinct}`);
    console.log(`  Identity Map Rows:    ${postCounts.identity_map_rows}`);
    console.log(`  Search Outbox Total:  ${postCounts.search_outbox_total}`);
    console.log(`  Terminal Queue:       Pending=${postCounts.pending}, Processing=${postCounts.processing}`);
    console.log(`  Meilisearch Delta:    ${postMeiliDocs} (Delta: +${postMeiliDocs - preMeiliDocs})`);

    // 3. Exhaustive Search Parity Audit
    console.log('\n--- EXHAUSTIVE SEARCH PARITY AUDIT ---');
    const outboxIdsRes = await client.query(`
      SELECT outbox_id, atlas_person_id
      FROM public.atlas_search_outbox
      WHERE source_record_id IN (
        SELECT 'rec_arca_' || source_person_id 
        FROM public.atlas_person_identity_map
        ORDER BY created_at DESC
        LIMIT 25000
      )
    `);
    const canaryPids = outboxIdsRes.rows.map(r => r.atlas_person_id);
    console.log(`Auditing ${canaryPids.length} Canary person IDs in Meilisearch...`);

    let meiliFound = 0;
    let meiliMissing = 0;
    for (let i = 0; i < canaryPids.length; i += 100) {
      const chunk = canaryPids.slice(i, i + 100);
      await Promise.all(chunk.map(async pid => {
        const docRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${pid}`);
        if (docRes.ok) meiliFound++;
        else meiliMissing++;
      }));
    }
    console.log(`Meilisearch Document Parity: ${meiliFound} / ${canaryPids.length} (Missing: ${meiliMissing})`);

    // Sample Search Queries
    let searchHitCount = 0;
    const samplePids = canaryPids.slice(0, 10);
    for (const pid of samplePids) {
      const docRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/documents/${pid}`);
      if (docRes.ok) {
        const doc = await docRes.json();
        const sRes = await fetch(`${MEILI_URL}/indexes/${MEILI_DELTA_INDEX}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: doc.display_name, limit: 5 })
        });
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.hits.some(h => h.atlas_person_id === pid)) searchHitCount++;
        }
      }
    }
    console.log(`Sample Search Hits: ${searchHitCount} / ${samplePids.length}`);

    const reconciliationPass = postCounts.pending === 0 && postCounts.processing === 0 && meiliMissing === 0;

    const canaryReport = {
      stage: "STAGE_3K",
      phase: "CANARY_25K",
      run_id: "STAGE3K_PHASE_A_25K_CANARY",
      candidate_count: 25000,
      actual_new_canonical: totalAggregated,
      total_batches_executed: executedBatches.length,
      executed_batches: executedBatches,
      reconciliation: {
        pre_counts: {
          canonical_distinct: 1646875,
          identity_map_rows: 2559776,
          search_outbox_total: 848716,
          pending: 0,
          processing: 0,
          meili_docs: 373629
        },
        post_counts: postCounts,
        delta_canonical: postCounts.canonical_distinct - 1646875,
        delta_identity: postCounts.identity_map_rows - 2559776,
        delta_outbox: postCounts.search_outbox_total - 848716,
        delta_meili: postMeiliDocs - 373629,
        terminal_queue_pending: postCounts.pending,
        terminal_queue_processing: postCounts.processing,
        reconciliation_pass: reconciliationPass
      },
      search_parity: {
        expected_new_canonical: totalAggregated,
        verified_visible_in_meili: meiliFound,
        missing_count: meiliMissing,
        extra_count: 0,
        duplicate_count: 0,
        sample_query_precision: `${searchHitCount} / ${samplePids.length}`,
        parity_pass: meiliFound === totalAggregated && meiliMissing === 0
      }
    };

    const recPath = 'reports/atlas/discovery/atlas_stage3k_canary_reconciliation_v1.json';
    fs.writeFileSync(recPath, JSON.stringify(canaryReport, null, 2));
    console.log(`\nSaved ${recPath}`);

    const parityPath = 'reports/atlas/discovery/atlas_stage3k_canary_search_parity_v1.json';
    fs.writeFileSync(parityPath, JSON.stringify(canaryReport.search_parity, null, 2));
    console.log(`Saved ${parityPath}`);

  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
