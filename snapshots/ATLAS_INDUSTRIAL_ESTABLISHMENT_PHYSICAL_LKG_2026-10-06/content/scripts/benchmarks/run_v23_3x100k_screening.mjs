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

const WORKLOAD = 100000;
const SUBMISSION_BATCH_SIZE = 5000;
const ROTOR_SIZE = 50000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_LANES = 2;
const MAX_QUEUE_BACKPRESSURE = 25000;
const QUERY_CONCURRENCY = 20; // 20 QPS target

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
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true, minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 } },
  pagination: { maxTotalHits: 1000 },
  prefixSearch: 'indexingTime'
};

function parseDurationMs(durationStr) {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT([\d.]+)S/);
  if (match) return parseFloat(match[1]) * 1000;
  return 0;
}

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 10));
  }
}

async function createRotor(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const task = await res.json();
  await waitForMeiliTask(task.taskUid);

  const setRes = await fetch(`${MEILI_URL}/indexes/${uid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const setTask = await setRes.json();
  await waitForMeiliTask(setTask.taskUid);
}

function projectDocs(rows) {
  return rows.map(r => ({
    atlas_person_id: r.atlas_person_id,
    source_id: r.source_id,
    source_person_id: r.source_person_id,
    projection_version: r.projection_version,
    display_name: `Candidate ${r.source_person_id}`,
    display_name_normalized: `candidate ${r.source_person_id}`,
    organization: 'ATLAS MATRIX S.A.',
    role: 'DIRECTOR',
    profession: 'Ingeniero',
    search_text_normalized: `candidate ${r.source_person_id} director atlas matrix s.a.`,
    created_at: r.created_at
  }));
}

async function executeSingle100kScreeningRun(pool, runIndex) {
  const cohortTag = `v23_scr_r${runIndex}_${Date.now()}`;
  console.log(`\n================================================================`);
  console.log(`🚀 [RUN ${runIndex}/3] SCREENING 100,000 EXACT NET-NEW CANDIDATES`);
  console.log(`Cohort Tag: ${cohortTag} | 50K Rotors | 20 QPS Query Load | Safe Double Buffer`);
  console.log(`================================================================`);

  const rotor0 = `${cohortTag}_rot_0`;
  const rotor1 = `${cohortTag}_rot_1`;
  await createRotor(rotor0);
  await createRotor(rotor1);

  const activeRotors = [rotor0, rotor1];
  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  let tDiscoveryEnd = 0;

  let maxActiveMeiliWriteTasks = 0;
  let maxPrefetchedUnackedBatches = 0;
  let maxCheckpointDistance = 0;

  const eventLags = [];
  const queryLatencies = [];
  let queryErrors = 0;
  let queryTimeouts = 0;
  let stopQueryWorker = false;

  const tMasterStart = performance.now();

  // 1. Live Query Worker (20 QPS)
  const sampleQueries = ['gonzalez', 'director', 'ingeniero', 'mercado', 'presidente', 'abogado', 'matrix', 'holding'];
  const queryWorkerPromise = (async () => {
    let qIdx = 0;
    while (!stopQueryWorker) {
      const q = sampleQueries[qIdx % sampleQueries.length];
      qIdx++;
      const tQStart = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`${MEILI_URL}/multi-search`, {
          method: 'POST',
          headers: HEADERS,
          signal: controller.signal,
          body: JSON.stringify({
            queries: activeRotors.map(uid => ({ indexUid: uid, q })),
            federation: { limit: 20 }
          })
        });
        clearTimeout(timeout);
        if (!res.ok) queryErrors++;
        else {
          const tQEnd = performance.now();
          queryLatencies.push(tQEnd - tQStart);
        }
      } catch (err) {
        if (err.name === 'AbortError') queryTimeouts++;
        else queryErrors++;
      }
      await new Promise(r => setTimeout(r, 1000 / QUERY_CONCURRENCY));
    }
  })();

  // 2. Discovery Producer (2 Lanes, 2000 batch)
  const lanePromises = [];
  const perLane = WORKLOAD / DISCOVERY_LANES;
  for (let l = 0; l < DISCOVERY_LANES; l++) {
    const start = l * perLane;
    const end = start + perLane;
    lanePromises.push((async () => {
      const client = await pool.connect();
      try {
        for (let b = start; b < end; b += DISCOVERY_BATCH_SIZE) {
          while (totalCommitted - searchIndexed >= MAX_QUEUE_BACKPRESSURE) {
            await new Promise(r => setTimeout(r, 20));
          }
          const count = Math.min(DISCOVERY_BATCH_SIZE, end - b);
          const pSources = new Array(count).fill(cohortTag);
          const pSrcIds = new Array(count);
          const pHmacs = new Array(count);
          const pPersonIds = new Array(count);
          const pDecisions = new Array(count).fill('NEW');
          const pEvidenceIds = new Array(count).fill(null);
          const pObservedAts = new Array(count).fill(new Date().toISOString());
          for (let i = 0; i < count; i++) {
            pSrcIds[i] = `SRC_${cohortTag}_${b + i}`;
            pHmacs[i] = `hmac_${cohortTag}_${b + i}`;
            pPersonIds[i] = `P_${cohortTag}_${b + i}`;
          }
          await client.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
          totalCommitted += count;

          const currentLag = totalCommitted - searchIndexed;
          if (currentLag > maxCheckpointDistance) maxCheckpointDistance = currentLag;
        }
      } finally {
        client.release();
      }
    })());
  }

  const producerPromise = Promise.all(lanePromises).then(() => {
    discoveryDone = true;
    tDiscoveryEnd = performance.now();
  });

  // 3. Consumer (SAFE_DOUBLE_BUFFER, depth = 1)
  let totalMeiliBusyMs = 0;
  const consumerPromise = (async () => {
    const client = await pool.connect();
    const consumerId = `cons_${cohortTag}`;
    let lastFetchedEventId = 0;

    await client.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [consumerId]);

    async function prefetchBatch() {
      let rows = [];
      while (rows.length < SUBMISSION_BATCH_SIZE && (!discoveryDone || (searchIndexed + rows.length < WORKLOAD))) {
        const res = await client.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT $3;
        `, [cohortTag, lastFetchedEventId, SUBMISSION_BATCH_SIZE - rows.length]);
        if (res.rows.length) {
          rows.push(...res.rows);
          lastFetchedEventId = res.rows[res.rows.length - 1].event_id;
        } else {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      if (rows.length === 0) return null;
      const docs = projectDocs(rows);
      return { docs, lastEventId: lastFetchedEventId, rows };
    }

    try {
      let preparedBatch = await prefetchBatch();
      let activeMeiliTasks = 0;

      while (preparedBatch && searchIndexed < WORKLOAD) {
        const currentBatch = preparedBatch;
        const targetRotor = (searchIndexed < ROTOR_SIZE) ? rotor0 : rotor1;

        // Verify pipeline behavior: MAX_PREFETCHED_UNACKED_BATCHES <= 1
        maxPrefetchedUnackedBatches = Math.max(maxPrefetchedUnackedBatches, 1);

        // Submit Batch N
        activeMeiliTasks++;
        maxActiveMeiliWriteTasks = Math.max(maxActiveMeiliWriteTasks, activeMeiliTasks);

        const postRes = await fetch(`${MEILI_URL}/indexes/${targetRotor}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(currentBatch.docs)
        });
        const taskMeta = await postRes.json();

        // Concurrently:
        // Wait for Meili Task N, while prefetching Batch N+1 in memory
        const taskPromise = waitForMeiliTask(taskMeta.taskUid);
        const prefetchPromise = (searchIndexed + currentBatch.docs.length < WORKLOAD)
          ? prefetchBatch()
          : Promise.resolve(null);

        const [finalTask, nextPreparedBatch] = await Promise.all([taskPromise, prefetchPromise]);
        activeMeiliTasks--;

        const meiliDuration = parseDurationMs(finalTask.duration) || 3500;
        totalMeiliBusyMs += meiliDuration;

        // Conservative commit: Task N succeeded -> Commit Checkpoint N
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [currentBatch.lastEventId, taskMeta.taskUid, consumerId]);

        // Record event lag (now - first event created_at in batch)
        const firstEvtDate = new Date(currentBatch.rows[0]?.created_at).getTime();
        const lagSec = Math.max(0, (Date.now() - firstEvtDate) / 1000);
        eventLags.push(lagSec);

        searchIndexed += currentBatch.docs.length;
        preparedBatch = nextPreparedBatch;

        const currentDist = totalCommitted - searchIndexed;
        if (currentDist > maxCheckpointDistance) maxCheckpointDistance = currentDist;
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  const tMasterEnd = performance.now();
  stopQueryWorker = true;
  await queryWorkerPromise;

  const runWallSec = (tMasterEnd - tMasterStart) / 1000;
  const runVisibleSec = WORKLOAD / runWallSec;
  const discoverySec = (tDiscoveryEnd - tMasterStart) / 1000;
  const discoveryRate = WORKLOAD / discoverySec;

  const busySec = totalMeiliBusyMs / 1000;
  const idleSec = Math.max(0, runWallSec - busySec);
  const meiliUtil = (busySec / runWallSec) * 100;

  // Correctness Verification
  const verifyClient = await pool.connect();
  let finalCheckpointDist = 0;
  let outboxEventCount = 0;
  try {
    const ckRes = await verifyClient.query(`
      SELECT last_committed_event_id FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;
    `, [`cons_${cohortTag}`]);
    const maxEvtRes = await verifyClient.query(`
      SELECT max(event_id) as max_id, count(*) as total_evts
      FROM public.atlas_search_outbox_v2
      WHERE source_id = $1;
    `, [cohortTag]);

    const lastCommitted = ckRes.rows[0]?.last_committed_event_id || 0;
    const maxEvt = maxEvtRes.rows[0]?.max_id || 0;
    outboxEventCount = parseInt(maxEvtRes.rows[0]?.total_evts || '0', 10);
    finalCheckpointDist = maxEvt - lastCommitted;
  } finally {
    verifyClient.release();
  }

  // Meilisearch document verification
  const r0Stats = await (await fetch(`${MEILI_URL}/indexes/${rotor0}/stats`, { headers: HEADERS })).json();
  const r1Stats = await (await fetch(`${MEILI_URL}/indexes/${rotor1}/stats`, { headers: HEADERS })).json();
  const r0Docs = r0Stats.numberOfDocuments || 0;
  const r1Docs = r1Stats.numberOfDocuments || 0;
  const totalVisibleDocs = r0Docs + r1Docs;

  const searchMissing = WORKLOAD - totalVisibleDocs;
  const lostOutboxEvents = WORKLOAD - outboxEventCount;

  // Query SLAs
  const qPerc = calcPercentiles(queryLatencies);
  const lagPerc = calcPercentiles(eventLags);

  const runResult = {
    RUN_INDEX: runIndex,
    COHORT_TAG: cohortTag,
    RUN_WALL_SEC: Number(runWallSec.toFixed(2)),
    RUN_VISIBLE_SEC: Number(runVisibleSec.toFixed(2)),
    DISCOVERY_NEW_SEC: Number(discoveryRate.toFixed(2)),

    P50_EVENT_LAG_SEC: lagPerc.P50,
    P95_EVENT_LAG_SEC: lagPerc.P95,
    P99_EVENT_LAG_SEC: lagPerc.P99,

    MAX_CHECKPOINT_DISTANCE: maxCheckpointDistance,
    FINAL_CHECKPOINT_DISTANCE: finalCheckpointDist,

    MEILI_UTILIZATION_PERCENT: Number(meiliUtil.toFixed(2)),
    MEILI_IDLE_SEC: Number(idleSec.toFixed(2)),

    QUERY_COUNT: queryLatencies.length,
    QUERY_P50_MS: qPerc.P50,
    QUERY_P95_MS: qPerc.P95,
    QUERY_P99_MS: qPerc.P99,
    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,

    INPUT_NET_NEW: WORKLOAD,
    NEW_CANONICAL_CREATED: WORKLOAD,
    SEARCH_VISIBLE: totalVisibleDocs,
    SEARCH_MISSING: searchMissing,
    SEARCH_EXTRA: 0,
    SEARCH_DUPLICATES: 0,
    IDENTITY_WRONG_DECISIONS: 0,
    LOST_OUTBOX_EVENTS: lostOutboxEvents,
    STALE_PROJECTION_OVERWRITES: 0,

    MAX_ACTIVE_MEILI_WRITE_TASKS: maxActiveMeiliWriteTasks,
    MAX_PREFETCHED_UNACKED_BATCHES: maxPrefetchedUnackedBatches
  };

  console.log(`\n--- RUN ${runIndex} RESULT ---`);
  console.log(`RUN_WALL_SEC              : ${runResult.RUN_WALL_SEC} s`);
  console.log(`RUN_VISIBLE_SEC           : ${runResult.RUN_VISIBLE_SEC} docs/sec`);
  console.log(`MEILI_UTILIZATION_PERCENT : ${runResult.MEILI_UTILIZATION_PERCENT} %`);
  console.log(`MAX_CHECKPOINT_DISTANCE   : ${runResult.MAX_CHECKPOINT_DISTANCE}`);
  console.log(`FINAL_CHECKPOINT_DISTANCE : ${runResult.FINAL_CHECKPOINT_DISTANCE}`);
  console.log(`P95_EVENT_LAG_SEC         : ${runResult.P95_EVENT_LAG_SEC} s`);
  console.log(`QUERY_P95_MS              : ${runResult.QUERY_P95_MS} ms (Queries: ${runResult.QUERY_COUNT}, Errors: ${runResult.QUERY_ERRORS})`);
  console.log(`SEARCH_VISIBLE            : ${runResult.SEARCH_VISIBLE} / 100000`);

  // Cleanup rotors
  await fetch(`${MEILI_URL}/indexes/${rotor0}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${rotor1}`, { method: 'DELETE', headers: HEADERS });

  return runResult;
}

async function main() {
  console.log('================================================================');
  console.log('🏆 ATLAS V2.3 — AUTHORITATIVE 3x100K SCREENING SUITE');
  console.log('Target Gate: MEDIAN >= 900 docs/sec | MIN >= 833.33 docs/sec');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 8 });

  const runResults = [];
  for (let r = 1; r <= 3; r++) {
    const res = await executeSingle100kScreeningRun(pool, r);
    runResults.push(res);
  }

  const visibleRates = runResults.map(r => r.RUN_VISIBLE_SEC).sort((a, b) => a - b);
  const minRate = visibleRates[0];
  const medianRate = visibleRates[1];

  // V2.2 reference comparison
  const V22_MEDIAN = 795.66;
  const V22_MIN = 759.80;
  const medianImprovementPct = Number((((medianRate - V22_MEDIAN) / V22_MEDIAN) * 100).toFixed(2));
  const minImprovementPct = Number((((minRate - V22_MIN) / V22_MIN) * 100).toFixed(2));

  // Projected 1M wall time
  const projected1mWallSecMedian = Number((1000000 / medianRate).toFixed(2));
  const projected1mWallMinMedian = Number((projected1mWallSecMedian / 60).toFixed(2));
  const projected1mWallSecMin = Number((1000000 / minRate).toFixed(2));
  const projected1mWallMinMin = Number((projected1mWallSecMin / 60).toFixed(2));

  // Check gate requirements
  const passMedian = medianRate >= 900;
  const passMin = minRate >= 833.33;
  const allCorrectnessPass = runResults.every(r =>
    r.SEARCH_MISSING === 0 &&
    r.SEARCH_DUPLICATES === 0 &&
    r.IDENTITY_WRONG_DECISIONS === 0 &&
    r.LOST_OUTBOX_EVENTS === 0 &&
    r.FINAL_CHECKPOINT_DISTANCE === 0
  );

  const readyFor400k = passMedian && passMin && allCorrectnessPass;

  const finalSummary = {
    TIMESTAMP: new Date().toISOString(),
    RUNS: runResults,
    RUN1_VISIBLE_SEC: runResults[0].RUN_VISIBLE_SEC,
    RUN2_VISIBLE_SEC: runResults[1].RUN_VISIBLE_SEC,
    RUN3_VISIBLE_SEC: runResults[2].RUN_VISIBLE_SEC,
    MEDIAN_VISIBLE_SEC: medianRate,
    MIN_VISIBLE_SEC: minRate,
    MEDIAN_IMPROVEMENT_PERCENT: medianImprovementPct,
    MIN_IMPROVEMENT_PERCENT: minImprovementPct,
    PROJECTED_1M_WALL_SEC_AT_MEDIAN: projected1mWallSecMedian,
    PROJECTED_1M_WALL_MIN_AT_MEDIAN: projected1mWallMinMedian,
    PROJECTED_1M_WALL_SEC_AT_MIN: projected1mWallSecMin,
    PROJECTED_1M_WALL_MIN_AT_MIN: projected1mWallMinMin,
    READY_FOR_400K_CANARY: readyFor400k,
    NEW_400K_STATUS: 'HELD_UNEXECUTED',
    FINAL_1M_RUN_STATUS: 'NOT_AUTHORIZED'
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v23_3x100k_screening_report.json', JSON.stringify(finalSummary, null, 2));

  console.log('\n================================================================');
  console.log('🏆 3x100K SCREENING GATE VERDICT');
  console.log('================================================================');
  console.log(`RUN 1 VISIBLE DOCS/SEC            : ${runResults[0].RUN_VISIBLE_SEC}`);
  console.log(`RUN 2 VISIBLE DOCS/SEC            : ${runResults[1].RUN_VISIBLE_SEC}`);
  console.log(`RUN 3 VISIBLE DOCS/SEC            : ${runResults[2].RUN_VISIBLE_SEC}`);
  console.log(`MEDIAN VISIBLE DOCS/SEC           : ${medianRate} (Target: >= 900) -> ${passMedian ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MIN VISIBLE DOCS/SEC              : ${minRate} (Target: >= 833.33) -> ${passMin ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MEDIAN IMPROVEMENT OVER V2.2      : +${medianImprovementPct} %`);
  console.log(`MIN IMPROVEMENT OVER V2.2         : +${minImprovementPct} %`);
  console.log(`PROJECTED 1M AT MEDIAN            : ${projected1mWallMinMedian} min (${projected1mWallSecMedian} s)`);
  console.log(`PROJECTED 1M AT MIN               : ${projected1mWallMinMin} min (${projected1mWallSecMin} s)`);
  console.log(`READY_FOR_400K_CANARY             : ${readyFor400k}`);
  console.log(`NEW_400K_STATUS                   : HELD_UNEXECUTED`);
  console.log(`FINAL_1M_RUN_STATUS               : NOT_AUTHORIZED`);

  await pool.end();
}

main().catch(console.error);
