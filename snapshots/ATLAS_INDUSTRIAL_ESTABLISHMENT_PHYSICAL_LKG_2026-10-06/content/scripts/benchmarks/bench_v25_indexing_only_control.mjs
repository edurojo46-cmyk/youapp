import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import fs from 'node:fs';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const TOTAL_DOCS = 100000;
const ROTOR_SIZE = 50000;
const TOTAL_ROTORS = 2;
const SUBMISSION_BATCH_SIZE = 5000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_LANES = 2;
const BACKPRESSURE_TRIGGER = 25000;

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

async function waitForMeiliTask(taskUid) {
  if (!taskUid) throw new Error('Task UID is undefined');
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    if (!res.ok) {
      const errText = await res.text();
      if (errText.includes('MDB_READERS_FULL')) {
        globalMdbReadersErrors++;
      }
      await new Promise(r => setTimeout(r, 50));
      continue;
    }
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 20));
  }
}

let globalMdbReadersErrors = 0;

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

async function run() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.5 — INDEXING-ONLY CONTROL (100K DOCS | QUERY QPS = 0)');
  console.log('Safe Double Buffer (Depth=1) | 50K Rotors (2 Rotors) | 5K Batches');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 10 });
  const runTag = `v25_ctrl_${Date.now()}`;
  const consumerId = `cons_${runTag}`;

  console.log('🔧 Pre-creating 2 Rotors (50K capacity each)...');
  const rotorUids = [`${runTag}_rot_0`, `${runTag}_rot_1`];
  for (const uid of rotorUids) {
    await createRotor(uid);
    console.log(`   ✅ Rotor ${uid} ready.`);
  }

  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  let totalMeiliProcessingMs = 0;

  const tStart = performance.now();

  // Producer (2 Lanes)
  const lanePromises = [];
  const perLane = TOTAL_DOCS / DISCOVERY_LANES;
  for (let l = 0; l < DISCOVERY_LANES; l++) {
    const start = l * perLane;
    const end = start + perLane;
    lanePromises.push((async () => {
      const client = await pool.connect();
      try {
        for (let b = start; b < end; b += DISCOVERY_BATCH_SIZE) {
          while (totalCommitted - searchIndexed >= BACKPRESSURE_TRIGGER) {
            await new Promise(r => setTimeout(r, 20));
          }
          const count = Math.min(DISCOVERY_BATCH_SIZE, end - b);
          const pSources = new Array(count).fill(runTag);
          const pSrcIds = new Array(count);
          const pHmacs = new Array(count);
          const pPersonIds = new Array(count);
          const pDecisions = new Array(count).fill('NEW');
          const pEvidenceIds = new Array(count).fill(null);
          const pObservedAts = new Array(count).fill(new Date().toISOString());
          for (let i = 0; i < count; i++) {
            pSrcIds[i] = `SRC_${runTag}_${b + i}`;
            pHmacs[i] = `hmac_${runTag}_${b + i}`;
            pPersonIds[i] = `P_${runTag}_${b + i}`;
          }
          await client.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
          totalCommitted += count;
        }
      } finally {
        client.release();
      }
    })());
  }

  const producerPromise = Promise.all(lanePromises).then(() => {
    discoveryDone = true;
    console.log(`   Discovery finished in ${((performance.now() - tStart)/1000).toFixed(2)}s`);
  });

  // Consumer (Safe Double Buffer)
  const consumerPromise = (async () => {
    const client = await pool.connect();
    let lastFetchedEventId = 0;

    await client.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [consumerId]);

    async function prefetchBatch() {
      let rows = [];
      while (rows.length < SUBMISSION_BATCH_SIZE && (!discoveryDone || (searchIndexed + rows.length < TOTAL_DOCS))) {
        const res = await client.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT $3;
        `, [runTag, lastFetchedEventId, SUBMISSION_BATCH_SIZE - rows.length]);
        if (res.rows.length) {
          rows.push(...res.rows);
          lastFetchedEventId = res.rows[res.rows.length - 1].event_id;
        } else {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      if (rows.length === 0) return null;
      const docs = projectDocs(rows);
      return { docs, lastEventId: lastFetchedEventId };
    }

    try {
      let preparedBatch = await prefetchBatch();
      while (preparedBatch && searchIndexed < TOTAL_DOCS) {
        const currentBatch = preparedBatch;
        const currentRotorIdx = Math.floor(searchIndexed / ROTOR_SIZE);
        const targetRotorUid = rotorUids[currentRotorIdx];

        const postRes = await fetch(`${MEILI_URL}/indexes/${targetRotorUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(currentBatch.docs)
        });
        if (!postRes.ok) {
          const errText = await postRes.text();
          if (errText.includes('MDB_READERS_FULL')) globalMdbReadersErrors++;
          throw new Error(`Document POST failed: ${postRes.status} ${errText}`);
        }
        const taskMeta = await postRes.json();

        const taskPromise = waitForMeiliTask(taskMeta.taskUid);
        const prefetchPromise = (searchIndexed + currentBatch.docs.length < TOTAL_DOCS)
          ? prefetchBatch()
          : Promise.resolve(null);

        const [finalTask, nextPreparedBatch] = await Promise.all([taskPromise, prefetchPromise]);
        const durMs = parseDurationMs(finalTask.duration);
        totalMeiliProcessingMs += durMs;

        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [currentBatch.lastEventId, taskMeta.taskUid, consumerId]);

        searchIndexed += currentBatch.docs.length;
        preparedBatch = nextPreparedBatch;
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  const totalWallSec = (performance.now() - tStart) / 1000;
  const visibleDocsSec = Number((TOTAL_DOCS / totalWallSec).toFixed(2));

  const result = {
    TOTAL_DOCS,
    TOTAL_WALL_SEC: Number(totalWallSec.toFixed(2)),
    VISIBLE_DOCS_SEC: visibleDocsSec,
    MEILI_PROCESSING_MS: Number(totalMeiliProcessingMs.toFixed(2)),
    AVG_TASK_DURATION_MS: Number((totalMeiliProcessingMs / (TOTAL_DOCS / SUBMISSION_BATCH_SIZE)).toFixed(2)),
    MDB_READERS_FULL_COUNT: globalMdbReadersErrors
  };

  console.log('\n📊 INDEXING-ONLY CONTROL RESULTS:');
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync('scratch/indexing_only_control_results.json', JSON.stringify(result, null, 2));

  // Clean up outbox and rotors
  const cleanClient = await pool.connect();
  try {
    await cleanClient.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id = $1;`, [runTag]);
    await cleanClient.query(`DELETE FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;`, [consumerId]);
  } finally {
    cleanClient.release();
    await pool.end();
  }
  for (const uid of rotorUids) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }
}

run().catch(console.error);
