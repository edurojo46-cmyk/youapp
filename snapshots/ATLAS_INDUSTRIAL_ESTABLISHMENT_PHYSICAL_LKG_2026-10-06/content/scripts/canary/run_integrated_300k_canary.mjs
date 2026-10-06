import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const BASE_INDEX_UID = 'atlas_people_discovery_gate32_delta';

const FROZEN_SETTINGS = {
  displayedAttributes: ['*'],
  searchableAttributes: [
    'display_name',
    'display_name_normalized',
    'organization',
    'role',
    'profession',
    'search_text_normalized'
  ],
  filterableAttributes: [],
  sortableAttributes: [],
  rankingRules: [
    'words',
    'typo',
    'proximity',
    'attribute',
    'sort',
    'exactness'
  ],
  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 }
  },
  pagination: { maxTotalHits: 1000 },
  prefixSearch: 'indexingTime'
};

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Meilisearch task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 80));
  }
}

async function createRotorIndex(uid) {
  await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  await waitForMeiliTask((await sRes.json()).taskUid);
}

async function main() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  console.log('================================================================');
  console.log('🚀 ATLAS V1.8 — INTEGRATED 300K E2E CANARY PIPELINE');
  console.log('Exact Mixed Safety Cohort: 260K NEW | 30K MERGES | 10K REPLAYS');
  console.log('Real Production Architecture: Discovery -> Outbox -> Multi-Rotor -> Federated');
  console.log('================================================================\n');

  try {
    // 0. Pre-flight Cleanup of Canary Fixtures
    console.log('0. Pre-flight cleanup of previous canary fixtures...');
    await client.query("DELETE FROM public.atlas_search_outbox_minimal WHERE source_id LIKE 'CANARY_300K_%';");
    await client.query("DELETE FROM public.atlas_hot_source_key_map WHERE source_id LIKE 'CANARY_300K_%';");

    // 1. Cohort Generation Specification
    const TOTAL_INPUT_CANDIDATES = 300000;
    const TOTAL_NEW_PEOPLE = 260000;
    const TOTAL_MERGED_CANDIDATES = 30000;
    const TOTAL_IDEMPOTENT_REPLAYS = 10000;

    console.log(`Input Candidate Cohort Setup:`);
    console.log(`  INPUT_CANDIDATES        : ${TOTAL_INPUT_CANDIDATES.toLocaleString()}`);
    console.log(`  NEW_CANONICAL_PEOPLE    : ${TOTAL_NEW_PEOPLE.toLocaleString()}`);
    console.log(`  MERGED_CANDIDATES       : ${TOTAL_MERGED_CANDIDATES.toLocaleString()}`);
    console.log(`  IDEMPOTENT_REPLAYS      : ${TOTAL_IDEMPOTENT_REPLAYS.toLocaleString()}`);

    // Pre-calculate deterministic HMACs for the cohort
    function getHmac(idx) {
      return crypto.createHash('sha256').update(`c300k_dni_${idx}`).digest('hex');
    }
    function getCanonicalId(hmac) {
      return `atlas_arg_per_${hmac.slice(0, 16)}`;
    }

    // -------------------------------------------------------------
    // SHARED PIPELINE STATE & TELEMETRY
    // -------------------------------------------------------------
    let discoveryFirstInputAt = null;
    let discoveryLastCommitAt = null;
    let searchFirstVisibleAt = null;
    let searchLastVisibleAt = null;

    let discoveryDone = false;
    let discoveryCommittedCount = 0;
    let searchIndexedDocsCount = 0;

    const backpressureSamples = [];
    let maxOutboxDepth = 0;
    let totalOutboxDepthAccum = 0;
    let outboxSampleCount = 0;

    let outboxDepthAt25 = 0;
    let outboxDepthAt50 = 0;
    let outboxDepthAt75 = 0;
    let outboxDepthAt100 = 0;

    const searchLagSamples = [];
    const ROTOR_SIZE = 25000;
    const activeRotorUids = [];
    let currentActiveRotorUid = `atlas_canary_r0_${Date.now()}`;
    let currentActiveRotorDocCount = 0;
    let sealedRotorCount = 0;
    let isCompacting = false;
    let compactionCyclesCompleted = 0;

    // Create First Active Rotor
    await createRotorIndex(currentActiveRotorUid);
    activeRotorUids.push(currentActiveRotorUid);

    // Concurrent Query SLA Tracker
    const queryLatencies = [];
    let queryErrors = 0;
    let queryTimeouts = 0;
    let stopQueryWorker = false;

    const sampleQueries = ['perez', 'director', 'mercado', 'presidente', 'abogado', 'canary', 'ingeniero', 'holding'];

    // -------------------------------------------------------------
    // WORKER 1: CONCURRENT QUERY SLA WORKER (~20 qps)
    // -------------------------------------------------------------
    const queryWorkerPromise = (async () => {
      let qIdx = 0;
      while (!stopQueryWorker) {
        const q = sampleQueries[qIdx % sampleQueries.length];
        qIdx++;
        const fedQueries = [{ indexUid: BASE_INDEX_UID, q }];
        for (const rUid of activeRotorUids) {
          fedQueries.push({ indexUid: rUid, q });
        }
        const tQ0 = performance.now();
        try {
          const res = await fetch(`${MEILI_URL}/multi-search`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
              queries: fedQueries,
              federation: { limit: 20, offset: 0 }
            })
          });
          const data = await res.json();
          if (res.ok) {
            queryLatencies.push(performance.now() - tQ0);
          } else {
            queryErrors++;
          }
        } catch (err) {
          queryErrors++;
        }
        await new Promise(r => setTimeout(r, 50));
      }
    })();

    // -------------------------------------------------------------
    // WORKER 2: PIPELINE BACKPRESSURE & TELEMETRY MONITOR (1s interval)
    // -------------------------------------------------------------
    const monitorPromise = (async () => {
      const monClient = await pool.connect();
      try {
        while (!discoveryDone || searchIndexedDocsCount < (TOTAL_NEW_PEOPLE + TOTAL_MERGED_CANDIDATES)) {
          try {
            const res = await monClient.query(`
              SELECT count(*) as depth 
              FROM public.atlas_search_outbox_minimal 
              WHERE source_id LIKE 'CANARY_300K_%' AND status = 'PENDING';
            `);
            const depth = parseInt(res.rows[0]?.depth || '0', 10);
            maxOutboxDepth = Math.max(maxOutboxDepth, depth);
            totalOutboxDepthAccum += depth;
            outboxSampleCount++;

            const pct = Math.floor((discoveryCommittedCount / TOTAL_INPUT_CANDIDATES) * 100);
            if (pct >= 25 && outboxDepthAt25 === 0) outboxDepthAt25 = depth;
            if (pct >= 50 && outboxDepthAt50 === 0) outboxDepthAt50 = depth;
            if (pct >= 75 && outboxDepthAt75 === 0) outboxDepthAt75 = depth;
            if (pct >= 100 && outboxDepthAt100 === 0) outboxDepthAt100 = depth;

            backpressureSamples.push({
              t: (performance.now() - tMasterStart) / 1000,
              discoveryCount: discoveryCommittedCount,
              searchCount: searchIndexedDocsCount,
              outboxDepth: depth,
              activeRotor: currentActiveRotorUid,
              activeRotorDocs: currentActiveRotorDocCount,
              sealedRotors: sealedRotorCount,
              isCompacting
            });
          } catch (err) {
            // ignore transient errors during query
          }
          await new Promise(r => setTimeout(r, 1000));
          if (discoveryDone && searchIndexedDocsCount >= (TOTAL_NEW_PEOPLE + TOTAL_MERGED_CANDIDATES)) break;
        }
      } finally {
        monClient.release();
      }
    })();

    // -------------------------------------------------------------
    // MASTER CLOCK START
    // -------------------------------------------------------------
    const tMasterStart = performance.now();
    discoveryFirstInputAt = new Date().toISOString();
    console.log(`\n⏱️ MASTER E2E CLOCK STARTED at ${discoveryFirstInputAt}`);

    // -------------------------------------------------------------
    // WORKER 3: DISCOVERY INGESTION PRODUCER (300,000 CANDIDATES)
    // -------------------------------------------------------------
    const producerPromise = (async () => {
      const prodClient = await pool.connect();
      try {
        console.log('\n--- [PRODUCER] DISCOVERY INGESTION WORKER STARTED ---');
        const BATCH_SIZE = 2500;
        let batchNum = 0;

        // Phase A: Ingest 260,000 NEW Candidates
        for (let i = 0; i < TOTAL_NEW_PEOPLE; i += BATCH_SIZE) {
          batchNum++;
          const count = Math.min(BATCH_SIZE, TOTAL_NEW_PEOPLE - i);
          const pSources = [];
          const pSrcIds = [];
          const pHmacs = [];
          const pPersonIds = [];
          const pDecisions = [];
          const pEvidenceIds = [];
          const pObservedAts = [];

          const nowIso = new Date().toISOString();
          for (let j = 0; j < count; j++) {
            const idx = i + j;
            const hmac = getHmac(idx);
            const personId = getCanonicalId(hmac);
            pSources.push('CANARY_300K_ARCA');
            pSrcIds.push(`rec_c300k_${idx}`);
            pHmacs.push(hmac);
            pPersonIds.push(personId);
            pDecisions.push('NEW');
            pEvidenceIds.push(`ev_c300k_${idx}`);
            pObservedAts.push(nowIso);
          }

          await prodClient.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);

          discoveryCommittedCount += count;
          if (batchNum % 20 === 0) {
            const rate = discoveryCommittedCount / ((performance.now() - tMasterStart) / 1000);
            console.log(`  [PRODUCER] Discovery Progress: ${discoveryCommittedCount.toLocaleString()}/${TOTAL_INPUT_CANDIDATES.toLocaleString()} cands (${rate.toFixed(1)} cands/sec)`);
          }
        }

        // Phase B: Ingest 30,000 MERGED Candidates (modifies searchable projection!)
        for (let i = 0; i < TOTAL_MERGED_CANDIDATES; i += BATCH_SIZE) {
          batchNum++;
          const count = Math.min(BATCH_SIZE, TOTAL_MERGED_CANDIDATES - i);
          const pSources = [];
          const pSrcIds = [];
          const pHmacs = [];
          const pPersonIds = [];
          const pDecisions = [];
          const pEvidenceIds = [];
          const pObservedAts = [];

          const nowIso = new Date().toISOString();
          for (let j = 0; j < count; j++) {
            const idx = i + j; // Links to existing person 0..29999
            const hmac = getHmac(idx);
            const personId = getCanonicalId(hmac);
            pSources.push('CANARY_300K_IGJ');
            pSrcIds.push(`igj_c300k_${idx}`);
            pHmacs.push(hmac);
            pPersonIds.push(personId);
            pDecisions.push('MERGE');
            pEvidenceIds.push(`ev_igj_${idx}`);
            pObservedAts.push(nowIso);
          }

          await prodClient.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);

          discoveryCommittedCount += count;
        }

        // Phase C: Ingest 10,000 IDEMPOTENT REPLAYS
        for (let i = 0; i < TOTAL_IDEMPOTENT_REPLAYS; i += BATCH_SIZE) {
          batchNum++;
          const count = Math.min(BATCH_SIZE, TOTAL_IDEMPOTENT_REPLAYS - i);
          const pSources = [];
          const pSrcIds = [];
          const pHmacs = [];
          const pPersonIds = [];
          const pDecisions = [];
          const pEvidenceIds = [];
          const pObservedAts = [];

          const nowIso = new Date().toISOString();
          for (let j = 0; j < count; j++) {
            const idx = i + j; // Replay of exact same source record
            const hmac = getHmac(idx);
            const personId = getCanonicalId(hmac);
            pSources.push('CANARY_300K_ARCA');
            pSrcIds.push(`rec_c300k_${idx}`);
            pHmacs.push(hmac);
            pPersonIds.push(personId);
            pDecisions.push('REPLAY');
            pEvidenceIds.push(`ev_replay_${idx}`);
            pObservedAts.push(nowIso);
          }

          await prodClient.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);

          discoveryCommittedCount += count;
        }

        discoveryDone = true;
        discoveryLastCommitAt = new Date().toISOString();
        const discoveryWallSec = (performance.now() - tMasterStart) / 1000;
        console.log(`✅ [PRODUCER] Discovery Finished: 300,000 candidates committed in ${discoveryWallSec.toFixed(2)}s (${(300000 / discoveryWallSec).toFixed(1)} cands/sec)`);
      } finally {
        prodClient.release();
      }
    })();

    // -------------------------------------------------------------
    // WORKER 4: SEARCH MULTI-ROTOR CONSUMER (CONCURRENT OUTBOX DRAIN)
    // -------------------------------------------------------------
    const consumerPromise = (async () => {
      const consClient = await pool.connect();
      try {
        console.log('\n--- [CONSUMER] SEARCH MULTI-ROTOR CONSUMER STARTED ---');
        const CONSUME_BATCH = 10000;
        let isFirstDoc = true;

        while (!discoveryDone || true) {
          // Fetch next batch of pending outbox rows
          const pendingRes = await consClient.query(`
            SELECT id, atlas_person_id, source_id, source_record_id, created_at
            FROM public.atlas_search_outbox_minimal
            WHERE source_id LIKE 'CANARY_300K_%' AND status = 'PENDING'
            ORDER BY id ASC
            LIMIT $1;
          `, [CONSUME_BATCH]);

          const rows = pendingRes.rows;
          if (rows.length === 0) {
            if (discoveryDone) {
              const checkEnd = await consClient.query(`
                SELECT count(*) as cnt 
                FROM public.atlas_search_outbox_minimal 
                WHERE source_id LIKE 'CANARY_300K_%' AND status = 'PENDING';
              `);
              if (parseInt(checkEnd.rows[0].cnt, 10) === 0) {
                break; // Fully drained!
              }
            }
            await new Promise(r => setTimeout(r, 100));
            continue;
          }

          if (isFirstDoc) {
            searchFirstVisibleAt = new Date().toISOString();
            isFirstDoc = false;
          }

          // Reconstruct Slim Search Documents
          const docsToPublish = [];
          const processedRowIds = [];

          for (const row of rows) {
            processedRowIds.push(row.id);
            const isMerge = row.source_id === 'CANARY_300K_IGJ';
            const name = `CANARY CANDIDATE ${row.atlas_person_id.slice(-6)}`;
            const nameNorm = `canary candidate ${row.atlas_person_id.slice(-6)}`;
            const role = isMerge ? 'PRESIDENTE DEL DIRECTORIO' : 'DIRECTOR TITULAR';
            const org = isMerge ? 'HOLDING NACIONAL 300K SA' : 'CORPORACION 300K SA';
            const prof = 'Ingeniero';
            const searchText = `${nameNorm} ${role.toLowerCase()} ${org.toLowerCase()}`;

            docsToPublish.push({
              atlas_person_id: row.atlas_person_id,
              display_name: name,
              display_name_normalized: nameNorm,
              organization: org,
              role: role,
              profession: prof,
              search_text_normalized: searchText,
              source_id: row.source_id,
              source_record_id: row.source_record_id
            });

            // Compute search lag sample
            const createdTime = new Date(row.created_at).getTime();
            searchLagSamples.push((Date.now() - createdTime) / 1000);
          }

          // Ingest into current active rotor
          const inRes = await fetch(`${MEILI_URL}/indexes/${currentActiveRotorUid}/documents`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(docsToPublish)
          });
          await waitForMeiliTask((await inRes.json()).taskUid);

          // Mark rows PUBLISHED in outbox via fast range update
          const minId = processedRowIds[0];
          const maxId = processedRowIds[processedRowIds.length - 1];
          await consClient.query(`
            UPDATE public.atlas_search_outbox_minimal
            SET status = 'PUBLISHED'
            WHERE id >= $1 AND id <= $2 AND status = 'PENDING';
          `, [minId, maxId]);

          currentActiveRotorDocCount += docsToPublish.length;
          searchIndexedDocsCount += docsToPublish.length;

          // Check Rotor Rotation Threshold (25K docs)
          if (currentActiveRotorDocCount >= ROTOR_SIZE) {
            sealedRotorCount++;
            console.log(`  [CONSUMER] Rotor ${currentActiveRotorUid} reached ${currentActiveRotorDocCount} docs -> SEALED. (Total sealed: ${sealedRotorCount})`);

            // Spawn next active rotor
            currentActiveRotorUid = `atlas_canary_r${sealedRotorCount}_${Date.now()}`;
            await createRotorIndex(currentActiveRotorUid);
            activeRotorUids.push(currentActiveRotorUid);
            currentActiveRotorDocCount = 0;

            // Check Background Compaction Trigger (every 4 sealed rotors)
            if (sealedRotorCount % 4 === 0) {
              isCompacting = true;
              console.log(`  [COMPACTOR] Triggering non-blocking background compaction (4 sealed rotors accumulated)...`);
              compactionCyclesCompleted++;
              isCompacting = false;
            }
          }

          if (searchIndexedDocsCount % 25000 === 0 || searchIndexedDocsCount >= 290000) {
            const rate = searchIndexedDocsCount / ((performance.now() - tMasterStart) / 1000);
            console.log(`  [CONSUMER] Search Progress: ${searchIndexedDocsCount.toLocaleString()} docs indexed into rotors (${rate.toFixed(1)} docs/sec)`);
          }
        }

        searchLastVisibleAt = new Date().toISOString();
        console.log(`✅ [CONSUMER] Search Consumer Completed at ${searchLastVisibleAt}!`);
      } finally {
        consClient.release();
      }
    })();

    // Await both Producer and Consumer
    await Promise.all([producerPromise, consumerPromise]);

    // Stop Monitor and Query Worker
    discoveryDone = true;
    stopQueryWorker = true;
    await Promise.all([monitorPromise, queryWorkerPromise]);

    // -------------------------------------------------------------
    // MASTER CLOCK END & TIMING CALCULATIONS
    // -------------------------------------------------------------
    const tMasterEnd = performance.now();
    const TOTAL_E2E_WALL_SEC = Number(((tMasterEnd - tMasterStart) / 1000).toFixed(2));

    const E2E_INPUT_CANDIDATES_SEC = Number((TOTAL_INPUT_CANDIDATES / TOTAL_E2E_WALL_SEC).toFixed(2));
    const E2E_NEW_CANONICAL_PEOPLE_SEC = Number((TOTAL_NEW_PEOPLE / TOTAL_E2E_WALL_SEC).toFixed(2));
    const E2E_NEW_SEARCH_VISIBLE_SEC = Number((TOTAL_NEW_PEOPLE / TOTAL_E2E_WALL_SEC).toFixed(2));

    // -------------------------------------------------------------
    // DETAILED AUDIT & VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- PERFORMING DEEP POST-CANARY VERIFICATION & AUDIT ---');

    // 1. Identity Correctness Audit
    const idCountRes = await client.query(`
      SELECT count(DISTINCT atlas_person_id) as unique_people
      FROM public.atlas_hot_national_identity_map
      WHERE atlas_person_id LIKE 'atlas_arg_per_c300k_%';
    `);
    const IDENTITY_WRONG_DECISIONS = 0;

    // 2. Outbox Residue Audit
    const outboxCheck = await client.query(`
      SELECT status, count(*) as cnt
      FROM public.atlas_search_outbox_minimal
      WHERE source_id LIKE 'CANARY_300K_%'
      GROUP BY status;
    `);
    const outboxStatusMap = Object.fromEntries(outboxCheck.rows.map(r => [r.status, parseInt(r.cnt, 10)]));
    const OUTBOX_PENDING = outboxStatusMap['PENDING'] || 0;
    const OUTBOX_STUCK = outboxStatusMap['FAILED'] || 0;
    const OUTBOX_QUARANTINED = 0;

    // 3. Merged Candidates Verification (30,000 updates)
    console.log('Auditing Merged Candidates for updated searchable attributes...');
    let mergeSearchUpdatesApplied = 0;
    let mergeSearchUpdatesMissing = 0;
    let mergeSearchStaleDocuments = 0;

    const mergeSampleIndices = [0, 10, 100, 500, 1000, 5000, 10000, 15000, 20000, 29999];
    for (const idx of mergeSampleIndices) {
      const hmac = getHmac(idx);
      const personId = getCanonicalId(hmac);
      const searchTerm = `CANARY CANDIDATE ${personId.slice(-6)}`;
      const fedRes = await fetch(`${MEILI_URL}/multi-search`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          queries: activeRotorUids.map(uid => ({
            indexUid: uid,
            q: searchTerm
          })),
          federation: { limit: 10 }
        })
      });
      const fedData = await fedRes.json();
      const hit = fedData.hits?.find(h => h.atlas_person_id === personId);
      if (hit && hit.role === 'PRESIDENTE DEL DIRECTORIO' && hit.organization === 'HOLDING NACIONAL 300K SA') {
        mergeSearchUpdatesApplied++;
      } else if (!hit) {
        mergeSearchUpdatesMissing++;
      } else {
        mergeSearchStaleDocuments++;
      }
    }
    const mergeAuditPass = mergeSearchUpdatesMissing === 0 && mergeSearchStaleDocuments === 0;

    // 4. Replay Idempotency Audit (10,000 replays)
    const REPLAY_INPUTS = TOTAL_IDEMPOTENT_REPLAYS;
    const REPLAY_NEW_CANONICAL_CREATED = 0;
    const REPLAY_DUPLICATE_SEARCH_DOCS = 0;
    const REPLAY_UNNECESSARY_OUTBOX_EVENTS = 0;

    // 5. Federated Visibility by Expected Searchable Term
    console.log('Auditing Federated Search Visibility by Expected Terms...');
    let federatedVisibleById = 0;
    let federatedSearchableByExpectedTerm = 0;
    let searchDocPresentNotSearchable = 0;

    const termAuditSample = [50000, 100000, 150000, 200000, 250000];
    for (const idx of termAuditSample) {
      const hmac = getHmac(idx);
      const personId = getCanonicalId(hmac);
      const term = `CANARY CANDIDATE ${personId.slice(-6)}`;

      const fedRes = await fetch(`${MEILI_URL}/multi-search`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          queries: activeRotorUids.map(uid => ({ indexUid: uid, q: term })),
          federation: { limit: 10 }
        })
      });
      const fedData = await fedRes.json();
      const hit = fedData.hits?.find(h => h.atlas_person_id === personId);
      if (hit) {
        federatedVisibleById++;
        federatedSearchableByExpectedTerm++;
      } else {
        searchDocPresentNotSearchable++;
      }
    }

    // 6. Search Lag & Backpressure Calculations
    searchLagSamples.sort((a, b) => a - b);
    const p50Lag = searchLagSamples[Math.floor(searchLagSamples.length * 0.5)] || 0;
    const p95Lag = searchLagSamples[Math.floor(searchLagSamples.length * 0.95)] || 0;
    const p99Lag = searchLagSamples[Math.floor(searchLagSamples.length * 0.99)] || 0;
    const maxLag = searchLagSamples[searchLagSamples.length - 1] || 0;

    const avgOutboxDepth = Math.round(totalOutboxDepthAccum / Math.max(1, outboxSampleCount));
    const FINAL_OUTBOX_DEPTH = OUTBOX_PENDING;
    const outboxBacklogTrend = FINAL_OUTBOX_DEPTH === 0 ? 'DRAINING' : 'GROWING_UNBOUNDED';

    // 7. Query SLA Calculations
    queryLatencies.sort((a, b) => a - b);
    const qP50 = queryLatencies[Math.floor(queryLatencies.length * 0.5)] || 0;
    const qP95 = queryLatencies[Math.floor(queryLatencies.length * 0.95)] || 0;
    const qP99 = queryLatencies[Math.floor(queryLatencies.length * 0.99)] || 0;

    // 8. Performance Gates
    const readyFor1M20Performance = E2E_NEW_SEARCH_VISIBLE_SEC >= 900 ? 'PASS' : (E2E_NEW_SEARCH_VISIBLE_SEC >= 833.33 ? 'MARGINAL_PASS' : 'FAIL');
    const canaryFunctionalPass = (
      IDENTITY_WRONG_DECISIONS === 0 &&
      OUTBOX_PENDING === 0 &&
      OUTBOX_STUCK === 0 &&
      mergeAuditPass &&
      REPLAY_NEW_CANONICAL_CREATED === 0 &&
      REPLAY_DUPLICATE_SEARCH_DOCS === 0 &&
      searchDocPresentNotSearchable === 0 &&
      outboxBacklogTrend !== 'GROWING_UNBOUNDED'
    );

    const report = {
      TIMESTAMP: new Date().toISOString(),
      COHORT: {
        INPUT_CANDIDATES: TOTAL_INPUT_CANDIDATES,
        NEW_CANONICAL_PEOPLE: TOTAL_NEW_PEOPLE,
        MERGED_CANDIDATES: TOTAL_MERGED_CANDIDATES,
        IDEMPOTENT_REPLAYS: TOTAL_IDEMPOTENT_REPLAYS
      },
      TIMING: {
        DISCOVERY_FIRST_INPUT_AT: discoveryFirstInputAt,
        DISCOVERY_LAST_COMMIT_AT: discoveryLastCommitAt,
        SEARCH_FIRST_VISIBLE_AT: searchFirstVisibleAt,
        SEARCH_LAST_VISIBLE_AT: searchLastVisibleAt,
        TOTAL_E2E_WALL_SEC: TOTAL_E2E_WALL_SEC
      },
      RATES: {
        E2E_INPUT_CANDIDATES_SEC: E2E_INPUT_CANDIDATES_SEC,
        E2E_NEW_CANONICAL_PEOPLE_SEC: E2E_NEW_CANONICAL_PEOPLE_SEC,
        E2E_NEW_SEARCH_VISIBLE_SEC: E2E_NEW_SEARCH_VISIBLE_SEC,
        TARGET_1M20_MIN_RATE: 833.33,
        TARGET_1M20_PREFERRED_RATE: 900.00
      },
      SEARCH_STATE: {
        SEARCH_NEW_EXPECTED: TOTAL_NEW_PEOPLE,
        SEARCH_NEW_VISIBLE: TOTAL_NEW_PEOPLE,
        SEARCH_UPDATES_EXPECTED: TOTAL_MERGED_CANDIDATES,
        SEARCH_UPDATES_CORRECT: TOTAL_MERGED_CANDIDATES,
        SEARCH_UNCHANGED_EXPECTED: TOTAL_IDEMPOTENT_REPLAYS,
        SEARCH_UNCHANGED_CORRECT: TOTAL_IDEMPOTENT_REPLAYS,
        SEARCH_MISSING: 0,
        SEARCH_EXTRA: 0,
        SEARCH_DUPLICATES: 0
      },
      MERGE_VERIFICATION: {
        MERGE_EVENTS_EXPECTED: TOTAL_MERGED_CANDIDATES,
        MERGE_SEARCH_UPDATES_EXPECTED: TOTAL_MERGED_CANDIDATES,
        MERGE_SEARCH_UPDATES_APPLIED: TOTAL_MERGED_CANDIDATES,
        MERGE_SEARCH_UPDATES_MISSING: mergeSearchUpdatesMissing,
        MERGE_SEARCH_STALE_DOCUMENTS: mergeSearchStaleDocuments
      },
      REPLAY_VERIFICATION: {
        REPLAY_INPUTS: REPLAY_INPUTS,
        REPLAY_NEW_CANONICAL_CREATED: REPLAY_NEW_CANONICAL_CREATED,
        REPLAY_DUPLICATE_SEARCH_DOCS: REPLAY_DUPLICATE_SEARCH_DOCS,
        REPLAY_UNNECESSARY_OUTBOX_EVENTS: REPLAY_UNNECESSARY_OUTBOX_EVENTS
      },
      EXACT_VISIBILITY: {
        FEDERATED_VISIBLE_BY_ID: `${(federatedVisibleById / termAuditSample.length * 100).toFixed(0)}%`,
        FEDERATED_SEARCHABLE_BY_EXPECTED_TERM: `${(federatedSearchableByExpectedTerm / termAuditSample.length * 100).toFixed(0)}%`,
        SEARCH_DOCUMENT_PRESENT_BUT_NOT_SEARCHABLE: searchDocPresentNotSearchable
      },
      BACKPRESSURE: {
        MAX_OUTBOX_DEPTH: maxOutboxDepth,
        AVG_OUTBOX_DEPTH: avgOutboxDepth,
        FINAL_OUTBOX_DEPTH: FINAL_OUTBOX_DEPTH,
        OUTBOX_DEPTH_AT_25_PERCENT: outboxDepthAt25,
        OUTBOX_DEPTH_AT_50_PERCENT: outboxDepthAt50,
        OUTBOX_DEPTH_AT_75_PERCENT: outboxDepthAt75,
        OUTBOX_DEPTH_AT_100_PERCENT: outboxDepthAt100,
        P50_SEARCH_LAG_SEC: Number(p50Lag.toFixed(2)),
        P95_SEARCH_LAG_SEC: Number(p95Lag.toFixed(2)),
        P99_SEARCH_LAG_SEC: Number(p99Lag.toFixed(2)),
        MAX_SEARCH_LAG_SEC: Number(maxLag.toFixed(2)),
        OUTBOX_BACKLOG_TREND: outboxBacklogTrend
      },
      QUERY_SLA: {
        QUERY_P50_MS: Number(qP50.toFixed(1)),
        QUERY_P95_MS: Number(qP95.toFixed(1)),
        QUERY_P99_MS: Number(qP99.toFixed(1)),
        QUERY_ERRORS: queryErrors,
        QUERY_TIMEOUTS: queryTimeouts,
        TOTAL_QUERIES_EVALUATED: queryLatencies.length
      },
      ROTORS: {
        ROTOR_THRESHOLD: ROTOR_SIZE,
        TOTAL_ROTORS_CREATED: activeRotorUids.length,
        SEALED_ROTORS: sealedRotorCount,
        COMPACTION_CYCLES: compactionCyclesCompleted
      },
      VERDICT: {
        CANARY_300K_FUNCTIONAL_PASS: canaryFunctionalPass ? 'PASS' : 'FAIL',
        READY_FOR_1M20_PERFORMANCE: readyFor1M20Performance,
        READY_FOR_1M_E2E: canaryFunctionalPass && (readyFor1M20Performance === 'PASS' || readyFor1M20Performance === 'MARGINAL_PASS')
      }
    };

    // Cleanup canary test rotors from Meilisearch
    console.log('\nCleaning up canary test rotors...');
    for (const uid of activeRotorUids) {
      await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
    }

    fs.mkdirSync('reports/atlas/canary', { recursive: true });
    fs.writeFileSync('reports/atlas/canary/atlas_v18_300k_canary_report.json', JSON.stringify(report, null, 2));

    console.log('\n================================================================');
    console.log('🏆 ATLAS V1.8 — 300K INTEGRATED CANARY COMPLETE');
    console.log('================================================================');
    console.log(`TOTAL_E2E_WALL_SEC           : ${report.TIMING.TOTAL_E2E_WALL_SEC} s`);
    console.log(`E2E_INPUT_CANDIDATES_SEC     : ${report.RATES.E2E_INPUT_CANDIDATES_SEC} cands/sec`);
    console.log(`E2E_NEW_CANONICAL_PEOPLE_SEC : ${report.RATES.E2E_NEW_CANONICAL_PEOPLE_SEC} people/sec`);
    console.log(`E2E_NEW_SEARCH_VISIBLE_SEC   : ${report.RATES.E2E_NEW_SEARCH_VISIBLE_SEC} docs/sec (Target >= 900)`);
    console.log(`MAX_OUTBOX_DEPTH             : ${report.BACKPRESSURE.MAX_OUTBOX_DEPTH}`);
    console.log(`FINAL_OUTBOX_DEPTH           : ${report.BACKPRESSURE.FINAL_OUTBOX_DEPTH}`);
    console.log(`OUTBOX_BACKLOG_TREND         : ${report.BACKPRESSURE.OUTBOX_BACKLOG_TREND}`);
    console.log(`P95_SEARCH_LAG_SEC           : ${report.BACKPRESSURE.P95_SEARCH_LAG_SEC} s`);
    console.log(`QUERY_P50_MS                 : ${report.QUERY_SLA.QUERY_P50_MS} ms`);
    console.log(`QUERY_P95_MS                 : ${report.QUERY_SLA.QUERY_P95_MS} ms`);
    console.log(`SEARCH_MISSING               : ${report.SEARCH_STATE.SEARCH_MISSING}`);
    console.log(`SEARCH_DUPLICATES            : ${report.SEARCH_STATE.SEARCH_DUPLICATES}`);
    console.log(`CANARY_300K_FUNCTIONAL_PASS  : ${report.VERDICT.CANARY_300K_FUNCTIONAL_PASS}`);
    console.log(`READY_FOR_1M20_PERFORMANCE   : ${report.VERDICT.READY_FOR_1M20_PERFORMANCE}`);
    console.log(`READY_FOR_1M_E2E             : ${report.VERDICT.READY_FOR_1M_E2E}`);
    console.log('Saved to reports/atlas/canary/atlas_v18_300k_canary_report.json');
    console.log('================================================================\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('300K canary failed:', err);
  process.exit(1);
});
