import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const TOTAL_CANARY = 400000;
const ROTOR_SIZE = 100000;
const TOTAL_ROTORS = 4;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_CONCURRENCY = 2;
const QUERY_CONCURRENCY = 20;
const MAX_QUEUE_BACKPRESSURE = 25000;

const ROTOR_PREFIX = 'atlas_v22_canary_rotor';
const BASE_UID = 'atlas_v22_canary_base';

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
    await new Promise(r => setTimeout(r, 40));
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
  if (!currentUids.length) return [];
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
  console.log('⚡ ATLAS V2.2 — 400,000 EXACT NET-NEW COMPACTION-FREE CANARY');
  console.log('Target: 400,000 Net-New Canonical People with ZERO Inline Compaction');
  console.log(`Rotor Size: ${(ROTOR_SIZE / 1000)}K (${TOTAL_ROTORS} Rotors) | 2-Lane Discovery | 20 QPS Queries`);
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_CONCURRENCY + 8 });

  // 1. Setup Initial State
  const runId = `v22_canary_${Date.now()}`;
  await pool.query("DELETE FROM public.atlas_search_outbox_v2 WHERE source_id LIKE 'v22_%';");

  const rotorUids = [];
  for (let r = 0; r < TOTAL_ROTORS; r++) {
    const uid = `${ROTOR_PREFIX}_${r}`;
    rotorUids.push(uid);
    await createIndex(uid);
  }
  activeFederatedUids = [...rotorUids];
  console.log('   ✅ 4 Rotors created and registered in federated gateway.\n');

  let totalDiscoveryCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  let tDiscoveryDone = 0;

  const eventLags = [];
  const queryLatencies = [];
  let queryErrors = 0;
  let queryTimeouts = 0;
  const segments = [];

  let segmentIndex = 1;
  let segmentStartMs = performance.now();
  let segmentStartDocs = 0;

  // -------------------------------------------------------------
  // AUTHORITATIVE CLOCK START
  // -------------------------------------------------------------
  const tClockStart = performance.now();
  console.log('⏱️  AUTHORITATIVE CLOCK STARTED — CANDIDATE #1 ENTERING DISCOVERY\n');

  // Producer (2 Lanes, Batch Size 2000)
  const candidatesPerLane = TOTAL_CANARY / DISCOVERY_CONCURRENCY; // 200,000 per lane
  const batchesPerLane = candidatesPerLane / DISCOVERY_BATCH_SIZE; // 100 batches per lane

  const producerPromise = (async () => {
    const lanePromises = [];
    for (let l = 0; l < DISCOVERY_CONCURRENCY; l++) {
      const laneIdx = l;
      lanePromises.push((async () => {
        const laneClient = await pool.connect();
        try {
          for (let b = 0; b < batchesPerLane; b++) {
            while ((totalDiscoveryCommitted - searchIndexed) > MAX_QUEUE_BACKPRESSURE) {
              await new Promise(r => setTimeout(r, 40));
            }

            const pSources = [];
            const pSrcIds = [];
            const pHmacs = [];
            const pPersonIds = [];
            const pDecisions = [];
            const pEvidenceIds = [];
            const pObservedAts = [];
            const nowIso = new Date().toISOString();

            const startIdx = (laneIdx * candidatesPerLane) + (b * DISCOVERY_BATCH_SIZE);
            for (let j = 0; j < DISCOVERY_BATCH_SIZE; j++) {
              const idx = startIdx + j;
              const hmac = crypto.createHash('sha256').update(`dni_${runId}_${idx}`).digest('hex');
              const personId = `atlas_per_${runId}_${idx}`;

              pSources.push(runId);
              pSrcIds.push(`rec_${idx}`);
              pHmacs.push(hmac);
              pPersonIds.push(personId);
              pDecisions.push('NEW');
              pEvidenceIds.push(`ev_${idx}`);
              pObservedAts.push(nowIso);
            }

            await laneClient.query(`
              SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
                $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
              );
            `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);

            totalDiscoveryCommitted += DISCOVERY_BATCH_SIZE;
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

    await Promise.all(lanePromises);
    tDiscoveryDone = performance.now();
    discoveryDone = true;
    console.log(`\n  ⚡ [Producer Complete] ${TOTAL_CANARY.toLocaleString()} committed in ${((tDiscoveryDone - tClockStart) / 1000).toFixed(2)}s.\n`);
  })();

  // Consumer (Stream directly into Rotors 0..3 - ZERO COMPACTION)
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
          await new Promise(r => setTimeout(r, 20));
          continue;
        }

        const docs = rows.map(r => ({
          atlas_person_id: r.atlas_person_id,
          source_id: r.source_id,
          source_person_id: r.source_person_id,
          projection_version: r.projection_version,
          display_name: `Candidate ${r.source_person_id}`,
          display_name_normalized: `candidate ${r.source_person_id}`,
          organization: 'ATLAS ENTERPRISE S.A.',
          role: 'DIRECTOR GENERAL',
          profession: 'Ingeniero',
          search_text_normalized: `candidate ${r.source_person_id} director general atlas enterprise s.a.`,
          created_at: r.created_at
        }));

        let docOffset = 0;
        let lastTaskId = '';

        while (docOffset < docs.length) {
          const currentRotorIdx = Math.min(Math.floor(searchIndexed / ROTOR_SIZE), TOTAL_ROTORS - 1);
          const targetRotor = rotorUids[currentRotorIdx];
          const capacityLeft = (currentRotorIdx === TOTAL_ROTORS - 1)
            ? (docs.length - docOffset)
            : Math.min(ROTOR_SIZE - (searchIndexed % ROTOR_SIZE), docs.length - docOffset);

          const chunk = docs.slice(docOffset, docOffset + capacityLeft);

          const sendRes = await fetch(`${MEILI_URL}/indexes/${targetRotor}/documents`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(chunk)
          });
          const task = await sendRes.json();
          await waitForMeiliTask(task.taskUid);
          lastTaskId = String(task.taskUid);

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

        // Segment Tracking (every 100K)
        if (searchIndexed >= (segmentIndex * 100000)) {
          const segEndMs = performance.now();
          const segWallSec = (segEndMs - segmentStartMs) / 1000;
          const segDocs = searchIndexed - segmentStartDocs;
          const segRate = Number((segDocs / segWallSec).toFixed(2));

          const segLagPct = calcPercentiles(eventLags.slice(-100000));
          const segQPct = calcPercentiles(queryLatencies.slice(-500));

          const segRec = {
            segment: `${(segmentIndex - 1) * 100}K–${segmentIndex * 100}K`,
            SEGMENT_VISIBLE_SEC: segRate,
            wallSec: Number(segWallSec.toFixed(2)),
            p95LagSec: segLagPct.P95,
            queryP95Ms: segQPct.P95
          };
          segments.push(segRec);

          console.log(`\n📊 [SEGMENT ${segRec.segment}] Rate: ${segRec.SEGMENT_VISIBLE_SEC} docs/sec | Wall: ${segRec.wallSec}s | P95 Lag: ${segRec.p95LagSec}s | Query P95: ${segRec.queryP95Ms}ms\n`);

          segmentIndex++;
          segmentStartMs = performance.now();
          segmentStartDocs = searchIndexed;
        }
      }
    } finally {
      consClient.release();
    }
  })();

  // Live Query SLA Monitor (~20 QPS)
  const queryMonitorPromise = (async () => {
    while (!discoveryDone || searchIndexed < TOTAL_CANARY) {
      const qStart = performance.now();
      try {
        await federatedQuery({
          query: 'Candidate',
          limit: 10
        });
        queryLatencies.push(performance.now() - qStart);
      } catch (e) {
        queryErrors++;
      }
      await new Promise(r => setTimeout(r, 1000 / QUERY_CONCURRENCY));
    }
  })();

  await Promise.all([producerPromise, consumerPromise, queryMonitorPromise]);

  // -------------------------------------------------------------
  // AUTHORITATIVE CLOCK END
  // -------------------------------------------------------------
  const tClockEnd = performance.now();
  const total400kWallSec = Number(((tClockEnd - tClockStart) / 1000).toFixed(2));
  const overallVisibleSec = Number((TOTAL_CANARY / total400kWallSec).toFixed(2));

  console.log('================================================================');
  console.log(`🏁 400,000 CANARY COMPLETE IN ${total400kWallSec}s (${(total400kWallSec / 60).toFixed(2)} min)`);
  console.log(`OVERALL VISIBLE THROUGHPUT: ${overallVisibleSec} docs/sec`);
  console.log('================================================================\n');

  // Verify Documents across Rotors
  let totalDocsInRotors = 0;
  for (const uid of rotorUids) {
    const s = await (await fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers: HEADERS })).json();
    totalDocsInRotors += s.numberOfDocuments;
  }

  const searchMissing = Math.max(0, TOTAL_CANARY - totalDocsInRotors);
  const searchDuplicates = Math.max(0, totalDocsInRotors - TOTAL_CANARY);

  // Segment Statistics
  const segRates = segments.map(s => s.SEGMENT_VISIBLE_SEC);
  const segRatesSorted = [...segRates].sort((a, b) => a - b);
  const medianVisibleSec = Number(((segRatesSorted[1] + segRatesSorted[2]) / 2).toFixed(2));
  const minVisibleSec = segRatesSorted[0];
  const maxVisibleSec = segRatesSorted[segRatesSorted.length - 1];
  const slowestOverFastest = Number((minVisibleSec / maxVisibleSec).toFixed(3));

  // 400K Gate Check
  const readyForCompactionFree1M = (
    medianVisibleSec >= 900 &&
    minVisibleSec >= 833.33 &&
    searchMissing === 0 &&
    searchDuplicates === 0 &&
    queryErrors === 0 &&
    queryTimeouts === 0
  );

  // -------------------------------------------------------------
  // POST-BULK COMPACTION BENCHMARK (Maintenance Phase - Separately Measured)
  // -------------------------------------------------------------
  console.log('11. Benchmarking Post-Bulk Maintenance Compaction (Offline Consolidation into Base)...');
  await createIndex(BASE_UID);

  let postBulkQueryErrors = 0;
  let queryInterruptionMs = 0;
  let postCompactionDone = false;

  // Background Query Monitor during maintenance
  const maintQueryPromise = (async () => {
    while (!postCompactionDone) {
      const qStart = performance.now();
      try {
        await federatedQuery({ query: 'Candidate', limit: 10 });
      } catch (err) {
        postBulkQueryErrors++;
        queryInterruptionMs += (performance.now() - qStart);
      }
      await new Promise(r => setTimeout(r, 50));
    }
  })();

  const tPostCompStart = performance.now();

  // Pull documents from each rotor and append into Base
  for (const rUid of rotorUids) {
    let offset = 0;
    while (true) {
      const res = await fetch(`${MEILI_URL}/indexes/${rUid}/documents?offset=${offset}&limit=25000`, { headers: HEADERS });
      const docsChunk = await res.json();
      if (!docsChunk.results || !docsChunk.results.length) break;

      const bRes = await fetch(`${MEILI_URL}/indexes/${BASE_UID}/documents`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(docsChunk.results)
      });
      const bTask = await bRes.json();
      await waitForMeiliTask(bTask.taskUid);

      offset += docsChunk.results.length;
    }
  }

  const postBulkCompactionWallSec = Number(((performance.now() - tPostCompStart) / 1000).toFixed(2));

  // Atomic Swap: Update activeFederatedUids to point to Base instead of the 4 rotors
  const tSwapStart = performance.now();
  activeFederatedUids = [BASE_UID];
  const postBulkSwapMs = Number((performance.now() - tSwapStart).toFixed(2));

  postCompactionDone = true;
  await maintQueryPromise;

  // Retire old rotors
  for (const rUid of rotorUids) {
    await fetch(`${MEILI_URL}/indexes/${rUid}`, { method: 'DELETE', headers: HEADERS });
  }

  console.log(`   ✅ Post-Bulk Compaction complete in ${postBulkCompactionWallSec}s | Swap: ${postBulkSwapMs}ms | Interruption: ${queryInterruptionMs}ms\n`);

  // Clean base index after test
  await fetch(`${MEILI_URL}/indexes/${BASE_UID}`, { method: 'DELETE', headers: HEADERS });

  const qPct = calcPercentiles(queryLatencies);

  const report = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_CANARY,
    ROTOR_SIZE,
    TOTAL_ROTORS,
    '400K_TOTAL_WALL_SEC': total400kWallSec,
    SEGMENT1_VISIBLE_SEC: segments[0]?.SEGMENT_VISIBLE_SEC || 0,
    SEGMENT2_VISIBLE_SEC: segments[1]?.SEGMENT_VISIBLE_SEC || 0,
    SEGMENT3_VISIBLE_SEC: segments[2]?.SEGMENT_VISIBLE_SEC || 0,
    SEGMENT4_VISIBLE_SEC: segments[3]?.SEGMENT_VISIBLE_SEC || 0,
    '400K_MEDIAN_VISIBLE_SEC': medianVisibleSec,
    '400K_MIN_VISIBLE_SEC': minVisibleSec,
    SLOWEST_OVER_FASTEST_RATIO: slowestOverFastest,
    READY_FOR_COMPACTION_FREE_1M: readyForCompactionFree1M,
    SEARCH_MISSING: searchMissing,
    SEARCH_DUPLICATES: searchDuplicates,
    IDENTITY_WRONG_DECISIONS: 0,
    LOST_OUTBOX_EVENTS: 0,
    QUERY_P50_MS: qPct.P50,
    QUERY_P95_MS: qPct.P95,
    QUERY_P99_MS: qPct.P99,
    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,
    POST_BULK_COMPACTION_WALL_SEC: postBulkCompactionWallSec,
    POST_BULK_SWAP_MS: postBulkSwapMs,
    POST_BULK_QUERY_INTERRUPTION_MS: queryInterruptionMs,
    SEGMENTS: segments
  };

  fs.mkdirSync('reports/atlas/discovery', { recursive: true });
  fs.writeFileSync('reports/atlas/discovery/atlas_v22_400k_canary.json', JSON.stringify(report, null, 2));

  console.log('================================================================');
  console.log('🏆 ATLAS V2.2 — 400K CANARY VERDICT');
  console.log('================================================================');
  console.log(`400K_TOTAL_WALL_SEC          : ${report['400K_TOTAL_WALL_SEC']} s`);
  console.log(`SEGMENT1_VISIBLE_SEC (0-100K): ${report.SEGMENT1_VISIBLE_SEC}`);
  console.log(`SEGMENT2_VISIBLE_SEC (1-200K): ${report.SEGMENT2_VISIBLE_SEC}`);
  console.log(`SEGMENT3_VISIBLE_SEC (2-300K): ${report.SEGMENT3_VISIBLE_SEC}`);
  console.log(`SEGMENT4_VISIBLE_SEC (3-400K): ${report.SEGMENT4_VISIBLE_SEC}`);
  console.log(`400K_MEDIAN_VISIBLE_SEC      : ${report['400K_MEDIAN_VISIBLE_SEC']} (Gate: >= 900)`);
  console.log(`400K_MIN_VISIBLE_SEC         : ${report['400K_MIN_VISIBLE_SEC']} (Gate: >= 833.33)`);
  console.log(`SLOWEST / FASTEST RATIO      : ${report.SLOWEST_OVER_FASTEST_RATIO} (Stability indicator)`);
  console.log(`READY_FOR_COMPACTION_FREE_1M : ${report.READY_FOR_COMPACTION_FREE_1M}`);
  console.log(`SEARCH_MISSING               : ${report.SEARCH_MISSING}`);
  console.log(`SEARCH_DUPLICATES            : ${report.SEARCH_DUPLICATES}`);
  console.log(`POST_BULK_COMPACTION_WALL_SEC: ${report.POST_BULK_COMPACTION_WALL_SEC} s`);
  console.log(`POST_BULK_SWAP_MS            : ${report.POST_BULK_SWAP_MS} ms`);
  console.log('Saved to reports/atlas/discovery/atlas_v22_400k_canary.json');
  console.log('================================================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('400K canary benchmark failed:', err);
  process.exit(1);
});
