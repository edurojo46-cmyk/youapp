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

const REPETITION_WORKLOAD = 100000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_LANES = 2;
const TEST_ROTOR_SIZES = [25000, 50000, 75000, 100000];
const QUERY_CONCURRENCY = 20;
const MAX_QUEUE_BACKPRESSURE = 25000;

// Configurable submission batch (defaults to 5000, can be overridden via CLI args)
const SUBMISSION_BATCH_SIZE = parseInt(process.argv[2], 10) || 5000;

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

async function runSingleRepetition({ pool, rotorSize, repIndex }) {
  const tag = `v22_fr_${rotorSize}_r${repIndex}_${Date.now()}`;
  const totalRotors = Math.ceil(REPETITION_WORKLOAD / rotorSize);
  const rotorUids = [];
  for (let r = 0; r < totalRotors; r++) {
    rotorUids.push(`${tag}_rot_${r}`);
    await createIndex(rotorUids[r]);
  }

  let totalDiscoveryCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  let queryLatencies = [];
  let queryErrors = 0;
  let queryTimeouts = 0;
  let eventLags = [];

  const tStart = performance.now();

  // 1. Discovery Producers (2 Lanes)
  const itemsPerLane = REPETITION_WORKLOAD / DISCOVERY_LANES;
  const lanePromises = [];

  for (let lane = 0; lane < DISCOVERY_LANES; lane++) {
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
            pSources[i] = tag;
            pSrcIds[i] = `REP_${repIndex}_${rotorSize}_${idx}`;
            pHmacs[i] = `hmac_fr_${tag}_${idx}`;
            pPersonIds[i] = `P_FR_${tag}_${idx}`;
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
        }
      } finally {
        laneClient.release();
      }
    })());
  }

  const producerPromise = Promise.all(lanePromises).then(() => {
    discoveryDone = true;
  });

  // 2. Search Consumer (Streaming into active rotor without compaction)
  const consumerPromise = (async () => {
    const consClient = await pool.connect();
    const CONSUMER_ID = `cons_${tag}`;
    let lastEventId = 0;

    await consClient.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [CONSUMER_ID]);

    try {
      while (!discoveryDone || searchIndexed < REPETITION_WORKLOAD) {
        const res = await consClient.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT 10000;
        `, [tag, lastEventId]);

        const rows = res.rows;
        if (!rows.length) {
          if (discoveryDone && searchIndexed >= REPETITION_WORKLOAD) break;
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
          organization: 'ATLAS BULK S.A.',
          role: 'DIRECTOR',
          profession: 'Ingeniero',
          search_text_normalized: `candidate ${r.source_person_id} director atlas bulk s.a.`,
          created_at: r.created_at
        }));

        let docOffset = 0;
        let lastTaskId = 0;

        while (docOffset < docs.length) {
          const currentRotorIdx = Math.min(Math.floor(searchIndexed / rotorSize), totalRotors - 1);
          const targetRotor = rotorUids[currentRotorIdx];
          const capacityLeft = (currentRotorIdx === totalRotors - 1)
            ? (docs.length - docOffset)
            : Math.min(rotorSize - (searchIndexed % rotorSize), docs.length - docOffset);

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
      }
    } finally {
      consClient.release();
    }
  })();

  // 3. Live 20 QPS Federated Query Load
  const queryMonitorPromise = (async () => {
    while (!discoveryDone || searchIndexed < REPETITION_WORKLOAD) {
      const qStart = performance.now();
      try {
        const res = await fetch(`${MEILI_URL}/multi-search`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            queries: rotorUids.map(uid => ({ indexUid: uid, q: 'Candidate' })),
            federation: { limit: 20 }
          })
        });
        if (!res.ok) queryErrors++;
        else queryLatencies.push(performance.now() - qStart);
      } catch (e) {
        queryErrors++;
      }
      await new Promise(r => setTimeout(r, 1000 / QUERY_CONCURRENCY));
    }
  })();

  await Promise.all([producerPromise, consumerPromise, queryMonitorPromise]);

  const tEnd = performance.now();
  const wallSec = (tEnd - tStart) / 1000;
  const visibleDocsSec = Number((REPETITION_WORKLOAD / wallSec).toFixed(2));

  // Audit Search docs
  let visibleDocs = 0;
  for (const uid of rotorUids) {
    const sRes = await fetch(`${MEILI_URL}/indexes/${uid}/stats`, { headers: HEADERS });
    const s = await sRes.json();
    visibleDocs += (s.numberOfDocuments || 0);
  }

  const missing = Math.max(0, REPETITION_WORKLOAD - visibleDocs);
  const duplicates = Math.max(0, visibleDocs - REPETITION_WORKLOAD);

  const qPct = calcPercentiles(queryLatencies);
  const lagPct = calcPercentiles(eventLags);

  // Clean up rotor indexes
  for (const uid of rotorUids) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }

  return {
    repIndex,
    wallSec: Number(wallSec.toFixed(2)),
    visibleDocsSec,
    p95LagSec: lagPct.P95,
    queryP50Ms: qPct.P50,
    queryP95Ms: qPct.P95,
    queryP99Ms: qPct.P99,
    missing,
    duplicates,
    queryErrors,
    queryTimeouts
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.2 — FAIR ROTOR SIZE MATRIX (OPTION A)');
  console.log('Testing: 25K, 50K, 75K, 100K Rotor Sizes');
  console.log('Workload: 3 Repetitions of 100,000 Exact Net-New per Configuration');
  console.log(`Submission Batch: ${SUBMISSION_BATCH_SIZE} docs/task | Query Load: ${QUERY_CONCURRENCY} QPS`);
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 6 });
  const allResults = [];

  for (const rotorSize of TEST_ROTOR_SIZES) {
    console.log(`\n🔬 [ROTOR SIZE: ${(rotorSize / 1000).toFixed(0)}K] Running 3 repetitions of 100,000 net-new...`);
    const reps = [];

    for (let r = 1; r <= 3; r++) {
      console.log(`  ▶ Repetition ${r}/3 starting...`);
      const repRes = await runSingleRepetition({ pool, rotorSize, repIndex: r });
      reps.push(repRes);
      console.log(`    ✅ Rep ${r} Complete: ${repRes.visibleDocsSec} docs/sec | Wall: ${repRes.wallSec}s | P95 Lag: ${repRes.p95LagSec}s | Query P95: ${repRes.queryP95Ms}ms | Missing: ${repRes.missing}`);
    }

    const rates = reps.map(r => r.visibleDocsSec);
    const sortedRates = [...rates].sort((a, b) => a - b);
    const medianRate = sortedRates[1]; // Middle of 3
    const minRate = sortedRates[0];

    const avgP95Lag = Number((reps.reduce((acc, r) => acc + r.p95LagSec, 0) / 3).toFixed(2));
    const avgQP50 = Number((reps.reduce((acc, r) => acc + r.queryP50Ms, 0) / 3).toFixed(2));
    const avgQP95 = Number((reps.reduce((acc, r) => acc + r.queryP95Ms, 0) / 3).toFixed(2));
    const avgQP99 = Number((reps.reduce((acc, r) => acc + r.queryP99Ms, 0) / 3).toFixed(2));
    const totalMissing = reps.reduce((acc, r) => acc + r.missing, 0);
    const totalDuplicates = reps.reduce((acc, r) => acc + r.duplicates, 0);

    const configRecord = {
      ROTOR_SIZE: rotorSize,
      RUN1_VISIBLE_SEC: reps[0].visibleDocsSec,
      RUN2_VISIBLE_SEC: reps[1].visibleDocsSec,
      RUN3_VISIBLE_SEC: reps[2].visibleDocsSec,
      MEDIAN_VISIBLE_SEC: medianRate,
      MIN_VISIBLE_SEC: minRate,
      P95_EVENT_LAG_SEC: avgP95Lag,
      QUERY_P50_MS: avgQP50,
      QUERY_P95_MS: avgQP95,
      QUERY_P99_MS: avgQP99,
      SEARCH_MISSING: totalMissing,
      SEARCH_DUPLICATES: totalDuplicates,
      QUALIFIED_GATE: (medianRate >= 900 && minRate >= 833.33),
      REPETITIONS: reps
    };

    allResults.push(configRecord);
    console.log(`  🏆 ${(rotorSize / 1000).toFixed(0)}K Median: ${medianRate} docs/sec | Min: ${minRate} docs/sec | Qualified: ${configRecord.QUALIFIED_GATE}`);
  }

  // Find best configuration
  allResults.sort((a, b) => b.MEDIAN_VISIBLE_SEC - a.MEDIAN_VISIBLE_SEC);
  const best = allResults[0];

  const gapTo833 = best.MEDIAN_VISIBLE_SEC >= 833.33 ? 0 : Number((((833.33 - best.MEDIAN_VISIBLE_SEC) / 833.33) * 100).toFixed(2));
  const gapTo900 = best.MEDIAN_VISIBLE_SEC >= 900 ? 0 : Number((((900 - best.MEDIAN_VISIBLE_SEC) / 900) * 100).toFixed(2));

  const report = {
    TIMESTAMP: new Date().toISOString(),
    PROTOCOL: 'OPTION_A_SCREENING_MATRIX',
    SUBMISSION_BATCH_SIZE,
    BEST_BULK_ROTOR_SIZE: best.ROTOR_SIZE,
    BEST_BULK_VISIBLE_SEC: best.MEDIAN_VISIBLE_SEC,
    GAP_TO_833_PERCENT: gapTo833,
    GAP_TO_900_PERCENT: gapTo900,
    RESULTS: allResults
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v22_fair_rotor_size_matrix.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 FAIR ROTOR SIZE MATRIX RESULTS SUMMARY');
  console.log('================================================================');
  console.log(`25K_MEDIAN_VISIBLE_SEC  : ${allResults.find(r => r.ROTOR_SIZE === 25000).MEDIAN_VISIBLE_SEC}`);
  console.log(`50K_MEDIAN_VISIBLE_SEC  : ${allResults.find(r => r.ROTOR_SIZE === 50000).MEDIAN_VISIBLE_SEC}`);
  console.log(`75K_MEDIAN_VISIBLE_SEC  : ${allResults.find(r => r.ROTOR_SIZE === 75000).MEDIAN_VISIBLE_SEC}`);
  console.log(`100K_MEDIAN_VISIBLE_SEC : ${allResults.find(r => r.ROTOR_SIZE === 100000).MEDIAN_VISIBLE_SEC}`);
  console.log(`BEST_BULK_ROTOR_SIZE    : ${best.ROTOR_SIZE}`);
  console.log(`BEST_BULK_VISIBLE_SEC   : ${best.MEDIAN_VISIBLE_SEC}`);
  console.log(`GAP_TO_833_PERCENT      : ${gapTo833}%`);
  console.log(`GAP_TO_900_PERCENT      : ${gapTo900}%`);
  console.log('Saved to reports/atlas/search/atlas_v22_fair_rotor_size_matrix.json\n');

  await pool.end();
}

main().catch(err => {
  console.error('Fair rotor size matrix failed:', err);
  process.exit(1);
});
