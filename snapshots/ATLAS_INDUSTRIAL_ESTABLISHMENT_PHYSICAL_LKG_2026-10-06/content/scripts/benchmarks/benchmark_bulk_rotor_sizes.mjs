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

const WORKLOAD_PER_CONFIG = 200000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_CONCURRENCY = 2;
const TEST_ROTOR_SIZES = [25000, 50000, 75000, 100000];
const QUERY_CONCURRENCY = 20;
const MAX_QUEUE_BACKPRESSURE = 25000;

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

async function federatedQuery({ indexUids, query, limit = 20 }) {
  const res = await fetch(`${MEILI_URL}/multi-search`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      queries: indexUids.map(uid => ({ indexUid: uid, q: query })),
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

async function testRotorSize(rotorSize) {
  const totalRotors = Math.ceil(WORKLOAD_PER_CONFIG / rotorSize);
  const tag = `v22_rs_${rotorSize / 1000}k`;
  console.log(`\n================================================================`);
  console.log(`🔬 TESTING ROTOR SIZE: ${(rotorSize / 1000)}K (${totalRotors} rotors for ${WORKLOAD_PER_CONFIG.toLocaleString()} net-new)`);
  console.log(`NO COMPACTION | 2-Lane Discovery | 20 QPS Query Load`);
  console.log(`================================================================\n`);

  // Initialize Rotors
  const rotorUids = [];
  for (let r = 0; r < totalRotors; r++) {
    const uid = `${tag}_r${r}`;
    rotorUids.push(uid);
    await createIndex(uid);
  }

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_CONCURRENCY + 6 });

  // Clean outbox for this tag
  await pool.query("DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1;", [tag]);

  let discoveryDone = false;
  let tDiscoveryDone = 0;
  let totalDiscoveryCommitted = 0;
  let searchIndexed = 0;

  const eventLags = [];
  const queryLatencies = [];
  let queryErrors = 0;
  let queryTimeouts = 0;

  const tStart = performance.now();

  // Producer (2 Lanes)
  const candidatesPerLane = WORKLOAD_PER_CONFIG / DISCOVERY_CONCURRENCY;
  const batchesPerLane = candidatesPerLane / DISCOVERY_BATCH_SIZE;

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
              const hmac = crypto.createHash('sha256').update(`dni_${tag}_${idx}`).digest('hex');
              const personId = `atlas_per_${tag}_${idx}`;

              pSources.push(tag);
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
              const dt = (performance.now() - tStart) / 1000;
              console.log(`  [Producer] Discovery: ${totalDiscoveryCommitted.toLocaleString()} / ${WORKLOAD_PER_CONFIG.toLocaleString()} (${(totalDiscoveryCommitted / dt).toFixed(1)} cands/sec)`);
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
    console.log(`  [Producer Complete] ${WORKLOAD_PER_CONFIG.toLocaleString()} committed in ${((tDiscoveryDone - tStart) / 1000).toFixed(2)}s.`);
  })();

  // Consumer (NO COMPACTION - Stream directly into active rotor)
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
      while (!discoveryDone || searchIndexed < WORKLOAD_PER_CONFIG) {
        const res = await consClient.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT 10000;
        `, [tag, lastEventId]);

        const rows = res.rows;
        if (!rows.length) {
          if (discoveryDone && searchIndexed >= WORKLOAD_PER_CONFIG) break;
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
          organization: 'ATLAS BULK S.A.',
          role: 'DIRECTOR',
          profession: 'Ingeniero',
          search_text_normalized: `candidate ${r.source_person_id} director atlas bulk s.a.`,
          created_at: r.created_at
        }));

        let docOffset = 0;
        let lastTaskId = '';

        while (docOffset < docs.length) {
          const currentRotorIdx = Math.min(Math.floor(searchIndexed / rotorSize), totalRotors - 1);
          const targetRotor = rotorUids[currentRotorIdx];
          const capacityLeft = (currentRotorIdx === totalRotors - 1)
            ? (docs.length - docOffset)
            : Math.min(rotorSize - (searchIndexed % rotorSize), docs.length - docOffset);

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

        if (searchIndexed % 50000 === 0) {
          const dt = (performance.now() - tStart) / 1000;
          console.log(`  [Consumer] Search Visible: ${searchIndexed.toLocaleString()} / ${WORKLOAD_PER_CONFIG.toLocaleString()} (${(searchIndexed / dt).toFixed(1)} docs/sec)`);
        }
      }
    } finally {
      consClient.release();
    }
  })();

  // Query Monitor
  const queryMonitorPromise = (async () => {
    while (!discoveryDone || searchIndexed < WORKLOAD_PER_CONFIG) {
      const qStart = performance.now();
      try {
        await federatedQuery({
          indexUids: rotorUids,
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

  const wallDurationSec = (performance.now() - tStart) / 1000;
  const e2eVisibleSec = Number((WORKLOAD_PER_CONFIG / wallDurationSec).toFixed(2));
  const discoverySec = Number((WORKLOAD_PER_CONFIG / ((tDiscoveryDone - tStart) / 1000)).toFixed(2));

  const qPct = calcPercentiles(queryLatencies);
  const lagPct = calcPercentiles(eventLags);

  // Clean test indexes after test
  for (const uid of rotorUids) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }

  await pool.end();

  console.log(`\n  🏆 ${(rotorSize / 1000)}K Complete: ${e2eVisibleSec} docs/sec | Wall: ${wallDurationSec.toFixed(2)}s | P95 Query: ${qPct.P95}ms | P95 Lag: ${lagPct.P95}s\n`);

  return {
    ROTOR_SIZE: rotorSize,
    E2E_VISIBLE_SEC: e2eVisibleSec,
    SEARCH_PUBLICATION_SEC: e2eVisibleSec,
    TOTAL_ROTORS: totalRotors,
    QUERY_P50_MS: qPct.P50,
    QUERY_P95_MS: qPct.P95,
    QUERY_P99_MS: qPct.P99,
    MAX_EVENT_LAG_SEC: lagPct.max
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.2 — ROTOR SIZE MATRIX WITHOUT COMPACTION (200K NET-NEW)');
  console.log('Testing: 25K, 50K, 75K, 100K');
  console.log('================================================================\n');

  const results = [];
  for (const rs of TEST_ROTOR_SIZES) {
    const res = await testRotorSize(rs);
    results.push(res);
  }

  // Select Bulk Rotor Size:
  // "Select the largest rotor size that still sustains >= 900 visible docs/sec preferred
  // and >= 833.33 visible docs/sec minimum.
  // If two sizes qualify, prefer the larger size to reduce federation fan-out."
  let selected = results[0];
  const qualifying = results.filter(r => r.E2E_VISIBLE_SEC >= 833.33);
  const preferred = results.filter(r => r.E2E_VISIBLE_SEC >= 900);

  if (preferred.length > 0) {
    selected = preferred[preferred.length - 1]; // largest preferred size
  } else if (qualifying.length > 0) {
    selected = qualifying[qualifying.length - 1];
  }

  const projected1mRotors = Math.ceil(1000000 / selected.ROTOR_SIZE);

  const report = {
    TIMESTAMP: new Date().toISOString(),
    WORKLOAD_PER_CONFIG,
    SELECTED_BULK_ROTOR_SIZE: selected.ROTOR_SIZE,
    PROJECTED_1M_ROTOR_COUNT: projected1mRotors,
    '25K_VISIBLE_SEC': results.find(r => r.ROTOR_SIZE === 25000)?.E2E_VISIBLE_SEC,
    '50K_VISIBLE_SEC': results.find(r => r.ROTOR_SIZE === 50000)?.E2E_VISIBLE_SEC,
    '75K_VISIBLE_SEC': results.find(r => r.ROTOR_SIZE === 75000)?.E2E_VISIBLE_SEC,
    '100K_VISIBLE_SEC': results.find(r => r.ROTOR_SIZE === 100000)?.E2E_VISIBLE_SEC,
    RESULTS: results
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v22_rotor_size_matrix.json', JSON.stringify(report, null, 2));

  console.log('================================================================');
  console.log(`🏆 SELECTED BULK ROTOR SIZE: ${selected.ROTOR_SIZE} (${projected1mRotors} rotors for 1M)`);
  console.log(`Throughput: ${selected.E2E_VISIBLE_SEC} docs/sec`);
  console.log('Saved to reports/atlas/search/atlas_v22_rotor_size_matrix.json');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Rotor size matrix benchmark failed:', err);
  process.exit(1);
});
