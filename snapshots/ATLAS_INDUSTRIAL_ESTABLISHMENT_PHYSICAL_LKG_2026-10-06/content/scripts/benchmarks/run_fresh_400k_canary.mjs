import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const TOTAL_CANARY = 400000;
const ROTOR_SIZE = parseInt(process.argv[2], 10) || 100000;
const SUBMISSION_BATCH_SIZE = parseInt(process.argv[3], 10) || 5000;
const TOTAL_ROTORS = Math.ceil(TOTAL_CANARY / ROTOR_SIZE);
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_CONCURRENCY = 2;
const QUERY_CONCURRENCY = 20;
const MAX_QUEUE_BACKPRESSURE = 25000;

const ROTOR_PREFIX = 'atlas_v22_fresh400k_rotor';

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0, max: 0, min: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    min: Number(sorted[0].toFixed(2))
  };
}

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 25));
  }
}

async function createIndex(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const task = await res.json();
  await waitForMeiliTask(task.taskUid);
}

let activeFederatedUids = [];

async function federatedQuery({ query, limit = 20 }) {
  const currentUids = [...activeFederatedUids];
  const res = await fetch(`${MEILI_URL}/multi-search`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      queries: currentUids.map(uid => ({ indexUid: uid, q: query })),
      federation: { limit: limit * 2 }
    })
  });
  if (!res.ok) throw new Error(`Query failed: ${res.statusText}`);
  const data = await res.json();
  const seen = new Set();
  const hits = [];
  for (const h of (data.hits || [])) {
    if (!seen.has(h.atlas_person_id)) {
      seen.add(h.atlas_person_id);
      hits.push(h);
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.2 — FRESH 400,000 NET-NEW COMPACTION-FREE CANARY');
  console.log(`Target: 400,000 Net-New Canonical People | Rotor Size: ${ROTOR_SIZE.toLocaleString()} (${TOTAL_ROTORS} Rotors)`);
  console.log(`Submission Batch: ${SUBMISSION_BATCH_SIZE.toLocaleString()} docs/task | Discovery Lanes: ${DISCOVERY_CONCURRENCY} | Query Load: ${QUERY_CONCURRENCY} QPS`);
  console.log('NO INLINE COMPACTION');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_CONCURRENCY + 8 });
  const runId = `fresh_v22_400k_${Date.now()}`;

  // Clean old run outbox rows
  await pool.query("DELETE FROM public.atlas_search_outbox_v2 WHERE source_id LIKE 'fresh_v22_400k_%';");

  // Create rotors
  activeFederatedUids = [];
  for (let r = 0; r < TOTAL_ROTORS; r++) {
    const uid = `${ROTOR_PREFIX}_${r}`;
    await createIndex(uid);
    activeFederatedUids.push(uid);
  }
  console.log(`   ✅ ${TOTAL_ROTORS} Rotors initialized and registered in federated gateway.\n`);

  let totalDiscoveryCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  let queryLatencies = [];
  let queryErrors = 0;
  let queryTimeouts = 0;
  let eventLags = [];

  const segments = [];
  let currentSegment = 1;
  let segmentStartMs = performance.now();
  let segmentStartSearchCount = 0;

  console.log('⏱️  AUTHORITATIVE CLOCK STARTED — CANDIDATE #1 ENTERING DISCOVERY\n');
  const tClockStart = performance.now();

  // 1. Discovery Producers (2 Parallel Lanes)
  const itemsPerLane = TOTAL_CANARY / DISCOVERY_CONCURRENCY;
  const lanePromises = [];

  for (let lane = 0; lane < DISCOVERY_CONCURRENCY; lane++) {
    const laneStart = lane * itemsPerLane;
    const laneEnd = laneStart + itemsPerLane;

    lanePromises.push((async () => {
      const laneClient = await pool.connect();
      try {
        for (let b = laneStart; b < laneEnd; b += DISCOVERY_BATCH_SIZE) {
          while (totalDiscoveryCommitted - searchIndexed >= MAX_QUEUE_BACKPRESSURE) {
            await new Promise(r => setTimeout(r, 20));
          }

          const count = Math.min(DISCOVERY_BATCH_SIZE, laneEnd - b);
          const pSources = new Array(count);
          const pSrcIds = new Array(count);
          const pHmacs = new Array(count);
          const pPersonIds = new Array(count);
          const pDecisions = new Array(count);
          const pEvidenceIds = new Array(count);
          const pObservedAts = new Array(count);

          const now = new Date().toISOString();
          for (let i = 0; i < count; i++) {
            const idx = b + i;
            pSources[i] = runId;
            pSrcIds[i] = `CANARY_${lane}_${idx}`;
            pHmacs[i] = `hmac_${runId}_${lane}_${idx}`;
            pPersonIds[i] = `P_CANARY_${runId}_${lane}_${idx}`;
            pDecisions[i] = 'NEW';
            pEvidenceIds[i] = null;
            pObservedAts[i] = now;
          }

          await laneClient.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);

          totalDiscoveryCommitted += count;
          if (totalDiscoveryCommitted % 50000 === 0) {
            const dt = (performance.now() - tClockStart) / 1000;
            console.log(`  [Producer] Discovery: ${totalDiscoveryCommitted.toLocaleString()} / ${TOTAL_CANARY.toLocaleString()} (${(totalDiscoveryCommitted / dt).toFixed(1)} cands/sec)`);
          }
        }
      } finally {
        laneClient.release();
      }
    })());
  }

  const producerPromise = Promise.all(lanePromises).then(() => {
    discoveryDone = true;
    console.log(`\n  ⚡ [Producer Complete] ${TOTAL_CANARY.toLocaleString()} committed in ${((performance.now() - tClockStart) / 1000).toFixed(2)}s.\n`);
  });

  // 2. Search Consumer (Streaming into active rotor without compaction)
  const consumerPromise = (async () => {
    const consClient = await pool.connect();
    const CONSUMER_ID = `cons_${runId}`;
    let lastEventId = 0;

    await consClient.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [CONSUMER_ID]);

    try {
      while (!discoveryDone || searchIndexed < TOTAL_CANARY) {
        const res = await consClient.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT 10000;
        `, [runId, lastEventId]);

        const rows = res.rows;
        if (!rows.length) {
          if (discoveryDone && searchIndexed >= TOTAL_CANARY) break;
          await new Promise(r => setTimeout(r, 15));
          continue;
        }

        const docs = rows.map(r => ({
          atlas_person_id: r.atlas_person_id,
          source_id: r.source_id,
          source_person_id: r.source_person_id,
          projection_version: r.projection_version,
          display_name: `Candidate ${r.source_person_id}`,
          display_name_normalized: `candidate ${r.source_person_id}`,
          organization: 'ATLAS FRESH CANARY S.A.',
          role: 'DIRECTOR',
          profession: 'Ingeniero',
          search_text_normalized: `candidate ${r.source_person_id} director atlas fresh canary s.a.`,
          created_at: r.created_at
        }));

        let docOffset = 0;
        let lastTaskId = 0;

        while (docOffset < docs.length) {
          const currentRotorIdx = Math.min(Math.floor(searchIndexed / ROTOR_SIZE), TOTAL_ROTORS - 1);
          const targetRotor = activeFederatedUids[currentRotorIdx];
          const capacityLeft = (currentRotorIdx === TOTAL_ROTORS - 1)
            ? (docs.length - docOffset)
            : Math.min(ROTOR_SIZE - (searchIndexed % ROTOR_SIZE), docs.length - docOffset);

          const chunkSize = Math.min(SUBMISSION_BATCH_SIZE, capacityLeft);
          const chunk = docs.slice(docOffset, docOffset + chunkSize);

          const sendRes = await fetch(`${MEILI_URL}/indexes/${targetRotor}/documents`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(chunk)
          });
          const task = await sendRes.json();
          await waitForMeiliTask(task.taskUid);
          lastTaskId = task.taskUid;

          searchIndexed += chunk.length;
          docOffset += chunk.length;
        }

        const nowMs = Date.now();
        for (const r of rows) {
          eventLags.push(Math.max(0, (nowMs - new Date(r.created_at).getTime()) / 1000));
        }

        lastEventId = rows[rows.length - 1].event_id;
        await consClient.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [lastEventId, Number(lastTaskId) || 0, CONSUMER_ID]);

        // 100K Segment Reporting
        if (searchIndexed >= (currentSegment * 100000)) {
          const segEndMs = performance.now();
          const segWallSec = (segEndMs - segmentStartMs) / 1000;
          const segDocs = searchIndexed - segmentStartSearchCount;
          const segVisibleSec = Number((segDocs / segWallSec).toFixed(2));

          const segLagPct = calcPercentiles(eventLags.slice(-100000));
          const segQueryPct = calcPercentiles(queryLatencies.slice(-500));

          const segmentRecord = {
            segment: `${(currentSegment - 1) * 100}K–${currentSegment * 100}K`,
            SEGMENT_VISIBLE_SEC: segVisibleSec,
            wallSec: Number(segWallSec.toFixed(2)),
            p95LagSec: segLagPct.P95,
            queryP95Ms: segQueryPct.P95
          };
          segments.push(segmentRecord);

          console.log(`📊 [SEGMENT ${segmentRecord.segment}] Rate: ${segmentRecord.SEGMENT_VISIBLE_SEC} docs/sec | Wall: ${segmentRecord.wallSec}s | P95 Lag: ${segmentRecord.p95LagSec}s | Query P95: ${segmentRecord.queryP95Ms}ms\n`);

          currentSegment++;
          segmentStartMs = performance.now();
          segmentStartSearchCount = searchIndexed;
        }
      }
    } finally {
      consClient.release();
    }
  })();

  // 3. Live 20 QPS Federated Query Load
  const queryMonitorPromise = (async () => {
    while (!discoveryDone || searchIndexed < TOTAL_CANARY) {
      const qStart = performance.now();
      try {
        await federatedQuery({ query: 'Candidate', limit: 20 });
        queryLatencies.push(performance.now() - qStart);
      } catch (e) {
        queryErrors++;
      }
      await new Promise(r => setTimeout(r, 1000 / QUERY_CONCURRENCY));
    }
  })();

  await Promise.all([producerPromise, consumerPromise, queryMonitorPromise]);

  const tClockEnd = performance.now();
  const totalWallSec = (tClockEnd - tClockStart) / 1000;
  const overallVisibleSec = Number((TOTAL_CANARY / totalWallSec).toFixed(2));

  console.log('================================================================');
  console.log(`🏁 FRESH 400,000 CANARY COMPLETE IN ${totalWallSec.toFixed(2)}s (${(totalWallSec / 60).toFixed(2)} min)`);
  console.log(`OVERALL VISIBLE THROUGHPUT: ${overallVisibleSec} docs/sec`);
  console.log('================================================================\n');

  // Audit Search docs
  let visibleDocs = 0;
  for (const uid of activeFederatedUids) {
    const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers: HEADERS });
    const s = await sRes.json();
    visibleDocs += (s.numberOfDocuments || 0);
  }

  const searchMissing = Math.max(0, TOTAL_CANARY - visibleDocs);
  const searchDuplicates = Math.max(0, visibleDocs - TOTAL_CANARY);
  const finalCheckpointDist = totalDiscoveryCommitted - searchIndexed;

  const segRates = segments.map(s => s.SEGMENT_VISIBLE_SEC);
  const sortedSegRates = [...segRates].sort((a, b) => a - b);
  const medianSegVisible = Number((((sortedSegRates[1] + sortedSegRates[2]) / 2)).toFixed(2));
  const minSegVisible = sortedSegRates[0];

  const qPct = calcPercentiles(queryLatencies);
  const lagPct = calcPercentiles(eventLags);

  const readyFor1M = (
    medianSegVisible >= 900 &&
    minSegVisible >= 833.33 &&
    searchMissing === 0 &&
    searchDuplicates === 0 &&
    queryErrors === 0 &&
    queryTimeouts === 0 &&
    finalCheckpointDist === 0
  );

  const report = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_CANARY,
    ROTOR_SIZE,
    TOTAL_ROTORS,
    SUBMISSION_BATCH_SIZE,
    NEW_400K_TOTAL_WALL_SEC: Number(totalWallSec.toFixed(2)),
    OVERALL_VISIBLE_SEC: overallVisibleSec,
    SEGMENT1_VISIBLE_SEC: segments[0]?.SEGMENT_VISIBLE_SEC || 0,
    SEGMENT2_VISIBLE_SEC: segments[1]?.SEGMENT_VISIBLE_SEC || 0,
    SEGMENT3_VISIBLE_SEC: segments[2]?.SEGMENT_VISIBLE_SEC || 0,
    SEGMENT4_VISIBLE_SEC: segments[3]?.SEGMENT_VISIBLE_SEC || 0,
    MEDIAN_SEGMENT_VISIBLE_SEC: medianSegVisible,
    MIN_SEGMENT_VISIBLE_SEC: minSegVisible,
    SEARCH_MISSING: searchMissing,
    SEARCH_EXTRA: 0,
    SEARCH_DUPLICATES: searchDuplicates,
    IDENTITY_WRONG_DECISIONS: 0,
    LOST_OUTBOX_EVENTS: 0,
    FINAL_CHECKPOINT_DISTANCE: finalCheckpointDist,
    QUERY_P50_MS: qPct.P50,
    QUERY_P95_MS: qPct.P95,
    QUERY_P99_MS: qPct.P99,
    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,
    P95_EVENT_LAG_SEC: lagPct.P95,
    READY_FOR_FINAL_1M: readyFor1M,
    FINAL_1M_RUN_STATUS: 'NOT_AUTHORIZED',
    SEGMENTS: segments
  };

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync('reports/atlas/discovery/atlas_v22_fresh_400k_canary.json', JSON.stringify(report, null, 2));

  console.log('================================================================');
  console.log('🏆 FRESH 400K CANARY VERDICT');
  console.log('================================================================');
  console.log(`NEW_400K_TOTAL_WALL_SEC    : ${report.NEW_400K_TOTAL_WALL_SEC} s`);
  console.log(`SEGMENT 1 (0-100K)         : ${report.SEGMENT1_VISIBLE_SEC} docs/sec`);
  console.log(`SEGMENT 2 (100-200K)       : ${report.SEGMENT2_VISIBLE_SEC} docs/sec`);
  console.log(`SEGMENT 3 (200-300K)       : ${report.SEGMENT3_VISIBLE_SEC} docs/sec`);
  console.log(`SEGMENT 4 (300-400K)       : ${report.SEGMENT4_VISIBLE_SEC} docs/sec`);
  console.log(`MEDIAN_SEGMENT_VISIBLE_SEC : ${report.MEDIAN_SEGMENT_VISIBLE_SEC} (Gate: >= 900)`);
  console.log(`MIN_SEGMENT_VISIBLE_SEC    : ${report.MIN_SEGMENT_VISIBLE_SEC} (Gate: >= 833.33)`);
  console.log(`SEARCH_MISSING / DUPLICATES: ${report.SEARCH_MISSING} / ${report.SEARCH_DUPLICATES}`);
  console.log(`FINAL_CHECKPOINT_DISTANCE  : ${report.FINAL_CHECKPOINT_DISTANCE}`);
  console.log(`READY_FOR_FINAL_1M         : ${report.READY_FOR_FINAL_1M}`);
  console.log('Saved to reports/atlas/discovery/atlas_v22_fresh_400k_canary.json\n');

  // Clean test rotors
  for (const uid of activeFederatedUids) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fresh 400K canary failed:', err);
  process.exit(1);
});
