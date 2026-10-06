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
const ROTOR_SIZE = 50000;
const SUBMISSION_BATCH_SIZE = 5000;
const DISCOVERY_BATCH_SIZE = 2000;
const DISCOVERY_LANES = 2;
const MAX_QUEUE_BACKPRESSURE = 25000;

function parseDurationMs(durationStr) {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT([\d.]+)S/);
  if (match) return parseFloat(match[1]) * 1000;
  return 0;
}

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 20));
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

function generateProductionDocs(count, tag) {
  const docs = new Array(count);
  for (let i = 0; i < count; i++) {
    docs[i] = {
      atlas_person_id: `p_${tag}_${i}`,
      source_id: tag,
      source_person_id: `SRC_${i}`,
      projection_version: 1,
      display_name: `Candidate ${i}`,
      display_name_normalized: `candidate ${i}`,
      organization: 'ATLAS MATRIX S.A.',
      role: 'DIRECTOR',
      profession: 'Ingeniero',
      search_text_normalized: `candidate ${i} director atlas matrix s.a.`,
      created_at: new Date().toISOString()
    };
  }
  return docs;
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.3 — FOUR-STAGE ISOLATION MATRIX (100K MATCHED)');
  console.log('A: Meili Only | B: Consumer Only | C: Discovery Only | D: Full E2E');
  console.log('================================================================\n');

  const pool = new pg.Pool({ ...parseDbUrl(), max: DISCOVERY_LANES + 8 });
  const results = {};

  // -------------------------------------------------------------
  // MODE A — MEILI ONLY
  // -------------------------------------------------------------
  console.log('🔬 [MODE A — MEILI ONLY] Submitting 100K preconstructed production docs directly to 50K rotors...');
  const tagA = `iso_mode_a_${Date.now()}`;
  const rotorA0 = `${tagA}_rot_0`;
  const rotorA1 = `${tagA}_rot_1`;
  await createIndex(rotorA0);
  await createIndex(rotorA1);

  const docsA = generateProductionDocs(WORKLOAD, tagA);

  const tAStart = performance.now();
  let busyMsA = 0;

  for (let c = 0; c < WORKLOAD; c += SUBMISSION_BATCH_SIZE) {
    const target = (c < ROTOR_SIZE) ? rotorA0 : rotorA1;
    const chunk = docsA.slice(c, c + SUBMISSION_BATCH_SIZE);
    const postRes = await fetch(`${MEILI_URL}/indexes/${target}/documents`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(chunk)
    });
    const taskMeta = await postRes.json();
    const task = await waitForMeiliTask(taskMeta.taskUid);
    busyMsA += parseDurationMs(task.duration);
  }
  const tAEnd = performance.now();
  const wallSecA = (tAEnd - tAStart) / 1000;
  const rateA = Number((WORKLOAD / wallSecA).toFixed(2));
  const busySecA = busyMsA / 1000;
  const idleSecA = Math.max(0, wallSecA - busySecA);
  const utilA = Number(((busySecA / wallSecA) * 100).toFixed(2));

  results.MODE_A = {
    WALL_SEC: Number(wallSecA.toFixed(2)),
    DOCS_SEC: rateA,
    DB_WAIT_MS: 0,
    MEILI_BUSY_SEC: Number(busySecA.toFixed(2)),
    MEILI_IDLE_SEC: Number(idleSecA.toFixed(2)),
    MEILI_UTILIZATION_PERCENT: utilA,
    MAX_CHECKPOINT_DISTANCE: 0
  };
  console.log(`  ✅ Mode A Complete: ${rateA} docs/sec | Wall: ${wallSecA.toFixed(2)}s | Busy: ${busySecA.toFixed(2)}s | Idle: ${idleSecA.toFixed(2)}s | Util: ${utilA}%\n`);

  await fetch(`${MEILI_URL}/indexes/${rotorA0}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${rotorA1}`, { method: 'DELETE', headers: HEADERS });

  // -------------------------------------------------------------
  // MODE B — SEARCH CONSUMER ONLY
  // -------------------------------------------------------------
  console.log('🔬 [MODE B — CONSUMER ONLY] Pre-populating Outbox V2 with 100K rows, then draining via consumer (0 Discovery)...');
  const tagB = `iso_mode_b_${Date.now()}`;
  const rotorB0 = `${tagB}_rot_0`;
  const rotorB1 = `${tagB}_rot_1`;
  await createIndex(rotorB0);
  await createIndex(rotorB1);

  // Prepopulate outbox
  console.log('   Preloading 100,000 outbox rows into PostgreSQL...');
  const preloadClient = await pool.connect();
  try {
    for (let b = 0; b < WORKLOAD; b += 2000) {
      const count = Math.min(2000, WORKLOAD - b);
      const pSources = new Array(count).fill(tagB);
      const pSrcIds = new Array(count);
      const pHmacs = new Array(count);
      const pPersonIds = new Array(count);
      const pDecisions = new Array(count).fill('NEW');
      const pEvidenceIds = new Array(count).fill(null);
      const pObservedAts = new Array(count).fill(new Date().toISOString());
      for (let i = 0; i < count; i++) {
        pSrcIds[i] = `SRC_B_${b + i}`;
        pHmacs[i] = `hmac_b_${b + i}`;
        pPersonIds[i] = `P_B_${b + i}`;
      }
      await preloadClient.query(`
        SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
        );
      `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
    }
  } finally {
    preloadClient.release();
  }
  console.log('   Outbox preloaded. Starting consumer clock...');

  const consClientB = await pool.connect();
  const CONSUMER_ID_B = `cons_${tagB}`;
  await consClientB.query(`
    INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
    VALUES ($1, 0, NOW())
    ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
  `, [CONSUMER_ID_B]);

  const tBStart = performance.now();
  let searchIndexedB = 0;
  let lastEventIdB = 0;
  let busyMsB = 0;
  let totalDbWaitMsB = 0;

  try {
    while (searchIndexedB < WORKLOAD) {
      const tFetchStart = performance.now();
      const res = await consClientB.query(`
        SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
        FROM public.atlas_search_outbox_v2
        WHERE source_id = $1 AND event_id > $2
        ORDER BY event_id ASC
        LIMIT 10000;
      `, [tagB, lastEventIdB]);
      totalDbWaitMsB += (performance.now() - tFetchStart);

      const rows = res.rows;
      if (!rows.length) break;

      const docs = rows.map(r => ({
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

      let docOffset = 0;
      let lastTaskId = 0;

      while (docOffset < docs.length) {
        const target = (searchIndexedB < ROTOR_SIZE) ? rotorB0 : rotorB1;
        const capacity = (searchIndexedB < ROTOR_SIZE) ? (ROTOR_SIZE - searchIndexedB) : (WORKLOAD - searchIndexedB);
        const chunkSize = Math.min(SUBMISSION_BATCH_SIZE, capacity, docs.length - docOffset);
        const chunk = docs.slice(docOffset, docOffset + chunkSize);

        const postRes = await fetch(`${MEILI_URL}/indexes/${target}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(chunk)
        });
        const taskMeta = await postRes.json();
        const task = await waitForMeiliTask(taskMeta.taskUid);
        busyMsB += parseDurationMs(task.duration);
        lastTaskId = task.taskUid;

        searchIndexedB += chunk.length;
        docOffset += chunk.length;
      }

      lastEventIdB = rows[rows.length - 1].event_id;
      const tAckStart = performance.now();
      await consClientB.query(`
        UPDATE public.atlas_search_consumer_checkpoint
        SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
        WHERE consumer_id = $3;
      `, [lastEventIdB, Number(lastTaskId) || 0, CONSUMER_ID_B]);
      totalDbWaitMsB += (performance.now() - tAckStart);
    }
  } finally {
    consClientB.release();
  }

  const tBEnd = performance.now();
  const wallSecB = (tBEnd - tBStart) / 1000;
  const rateB = Number((WORKLOAD / wallSecB).toFixed(2));
  const busySecB = busyMsB / 1000;
  const idleSecB = Math.max(0, wallSecB - busySecB);
  const utilB = Number(((busySecB / wallSecB) * 100).toFixed(2));

  results.MODE_B = {
    WALL_SEC: Number(wallSecB.toFixed(2)),
    DOCS_SEC: rateB,
    DB_WAIT_MS: Number(totalDbWaitMsB.toFixed(2)),
    MEILI_BUSY_SEC: Number(busySecB.toFixed(2)),
    MEILI_IDLE_SEC: Number(idleSecB.toFixed(2)),
    MEILI_UTILIZATION_PERCENT: utilB,
    MAX_CHECKPOINT_DISTANCE: 100000
  };
  console.log(`  ✅ Mode B Complete: ${rateB} docs/sec | Wall: ${wallSecB.toFixed(2)}s | Busy: ${busySecB.toFixed(2)}s | Idle: ${idleSecB.toFixed(2)}s | Util: ${utilB}% | DB Wait: ${totalDbWaitMsB.toFixed(0)}ms\n`);

  await fetch(`${MEILI_URL}/indexes/${rotorB0}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${rotorB1}`, { method: 'DELETE', headers: HEADERS });

  // -------------------------------------------------------------
  // MODE C — DISCOVERY ONLY
  // -------------------------------------------------------------
  console.log('🔬 [MODE C — DISCOVERY ONLY] Ingesting 100K net-new via 2 lanes of Discovery (0 Search consumers)...');
  const tagC = `iso_mode_c_${Date.now()}`;
  const tCStart = performance.now();

  const lanePromisesC = [];
  const perLaneC = WORKLOAD / DISCOVERY_LANES;

  for (let l = 0; l < DISCOVERY_LANES; l++) {
    const start = l * perLaneC;
    const end = start + perLaneC;
    lanePromisesC.push((async () => {
      const client = await pool.connect();
      try {
        for (let b = start; b < end; b += DISCOVERY_BATCH_SIZE) {
          const count = Math.min(DISCOVERY_BATCH_SIZE, end - b);
          const pSources = new Array(count).fill(tagC);
          const pSrcIds = new Array(count);
          const pHmacs = new Array(count);
          const pPersonIds = new Array(count);
          const pDecisions = new Array(count).fill('NEW');
          const pEvidenceIds = new Array(count).fill(null);
          const pObservedAts = new Array(count).fill(new Date().toISOString());
          for (let i = 0; i < count; i++) {
            pSrcIds[i] = `SRC_C_${b + i}`;
            pHmacs[i] = `hmac_c_${b + i}`;
            pPersonIds[i] = `P_C_${b + i}`;
          }
          await client.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
        }
      } finally {
        client.release();
      }
    })());
  }

  await Promise.all(lanePromisesC);
  const tCEnd = performance.now();
  const wallSecC = (tCEnd - tCStart) / 1000;
  const rateC = Number((WORKLOAD / wallSecC).toFixed(2));

  results.MODE_C = {
    WALL_SEC: Number(wallSecC.toFixed(2)),
    DOCS_SEC: rateC,
    DB_WAIT_MS: Number((wallSecC * 1000).toFixed(2)),
    MEILI_BUSY_SEC: 0,
    MEILI_IDLE_SEC: 0,
    MEILI_UTILIZATION_PERCENT: 0,
    MAX_CHECKPOINT_DISTANCE: 100000
  };
  console.log(`  ✅ Mode C Complete: ${rateC} cands/sec | Wall: ${wallSecC.toFixed(2)}s\n`);

  // -------------------------------------------------------------
  // MODE D — FULL E2E (Concurrent Discovery + Consumer)
  // -------------------------------------------------------------
  console.log('🔬 [MODE D — FULL E2E] Concurrent Discovery (2 lanes) + Search Consumer + Checkpoint...');
  const tagD = `iso_mode_d_${Date.now()}`;
  const rotorD0 = `${tagD}_rot_0`;
  const rotorD1 = `${tagD}_rot_1`;
  await createIndex(rotorD0);
  await createIndex(rotorD1);

  let totalCommittedD = 0;
  let searchIndexedD = 0;
  let discoveryDoneD = false;
  let maxCheckDistD = 0;
  let busyMsD = 0;
  let dbWaitMsD = 0;

  const tDStart = performance.now();

  // Producer
  const lanePromisesD = [];
  const perLaneD = WORKLOAD / DISCOVERY_LANES;

  for (let l = 0; l < DISCOVERY_LANES; l++) {
    const start = l * perLaneD;
    const end = start + perLaneD;
    lanePromisesD.push((async () => {
      const client = await pool.connect();
      try {
        for (let b = start; b < end; b += DISCOVERY_BATCH_SIZE) {
          while (totalCommittedD - searchIndexedD >= MAX_QUEUE_BACKPRESSURE) {
            await new Promise(r => setTimeout(r, 20));
          }
          const count = Math.min(DISCOVERY_BATCH_SIZE, end - b);
          const pSources = new Array(count).fill(tagD);
          const pSrcIds = new Array(count);
          const pHmacs = new Array(count);
          const pPersonIds = new Array(count);
          const pDecisions = new Array(count).fill('NEW');
          const pEvidenceIds = new Array(count).fill(null);
          const pObservedAts = new Array(count).fill(new Date().toISOString());
          for (let i = 0; i < count; i++) {
            pSrcIds[i] = `SRC_D_${b + i}`;
            pHmacs[i] = `hmac_d_${b + i}`;
            pPersonIds[i] = `P_D_${b + i}`;
          }
          await client.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
          totalCommittedD += count;
        }
      } finally {
        client.release();
      }
    })());
  }

  const producerPromiseD = Promise.all(lanePromisesD).then(() => {
    discoveryDoneD = true;
  });

  // Consumer
  const consumerPromiseD = (async () => {
    const client = await pool.connect();
    const CONSUMER_ID_D = `cons_${tagD}`;
    let lastEventId = 0;
    await client.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [CONSUMER_ID_D]);

    try {
      while (!discoveryDoneD || searchIndexedD < WORKLOAD) {
        const tFStart = performance.now();
        const res = await client.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT 10000;
        `, [tagD, lastEventId]);
        dbWaitMsD += (performance.now() - tFStart);

        const rows = res.rows;
        if (!rows.length) {
          if (discoveryDoneD && searchIndexedD >= WORKLOAD) break;
          await new Promise(r => setTimeout(r, 15));
          continue;
        }

        const lag = totalCommittedD - searchIndexedD;
        if (lag > maxCheckDistD) maxCheckDistD = lag;

        const docs = rows.map(r => ({
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

        let docOffset = 0;
        let lastTaskId = 0;

        while (docOffset < docs.length) {
          const target = (searchIndexedD < ROTOR_SIZE) ? rotorD0 : rotorD1;
          const capacity = (searchIndexedD < ROTOR_SIZE) ? (ROTOR_SIZE - searchIndexedD) : (WORKLOAD - searchIndexedD);
          const chunkSize = Math.min(SUBMISSION_BATCH_SIZE, capacity, docs.length - docOffset);
          const chunk = docs.slice(docOffset, docOffset + chunkSize);

          const postRes = await fetch(`${MEILI_URL}/indexes/${target}/documents`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(chunk)
          });
          const taskMeta = await postRes.json();
          const task = await waitForMeiliTask(taskMeta.taskUid);
          busyMsD += parseDurationMs(task.duration);
          lastTaskId = task.taskUid;

          searchIndexedD += chunk.length;
          docOffset += chunk.length;
        }

        lastEventId = rows[rows.length - 1].event_id;
        const tAStart = performance.now();
        await client.query(`
          UPDATE public.atlas_search_consumer_checkpoint
          SET last_committed_event_id = $1, last_successful_meili_task_uid = $2, updated_at = NOW()
          WHERE consumer_id = $3;
        `, [lastEventId, Number(lastTaskId) || 0, CONSUMER_ID_D]);
        dbWaitMsD += (performance.now() - tAStart);
      }
    } finally {
      client.release();
    }
  })();

  await Promise.all([producerPromiseD, consumerPromiseD]);
  const tDEnd = performance.now();
  const wallSecD = (tDEnd - tDStart) / 1000;
  const rateD = Number((WORKLOAD / wallSecD).toFixed(2));
  const busySecD = busyMsD / 1000;
  const idleSecD = Math.max(0, wallSecD - busySecD);
  const utilD = Number(((busySecD / wallSecD) * 100).toFixed(2));

  results.MODE_D = {
    WALL_SEC: Number(wallSecD.toFixed(2)),
    DOCS_SEC: rateD,
    DB_WAIT_MS: Number(dbWaitMsD.toFixed(2)),
    MEILI_BUSY_SEC: Number(busySecD.toFixed(2)),
    MEILI_IDLE_SEC: Number(idleSecD.toFixed(2)),
    MEILI_UTILIZATION_PERCENT: utilD,
    MAX_CHECKPOINT_DISTANCE: maxCheckDistD
  };
  console.log(`  ✅ Mode D Complete: ${rateD} docs/sec | Wall: ${wallSecD.toFixed(2)}s | Busy: ${busySecD.toFixed(2)}s | Idle: ${idleSecD.toFixed(2)}s | Util: ${utilD}% | Max Lag: ${maxCheckDistD}\n`);

  await fetch(`${MEILI_URL}/indexes/${rotorD0}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${rotorD1}`, { method: 'DELETE', headers: HEADERS });

  // Deduce loss percentages
  const aToBLoss = Number((((rateA - rateB) / rateA) * 100).toFixed(2));
  const bToDLoss = Number((((rateB - rateD) / rateB) * 100).toFixed(2));
  const cToDProducerLoss = Number((((rateC - rateD) / rateC) * 100).toFixed(2));

  const report = {
    TIMESTAMP: new Date().toISOString(),
    WORKLOAD,
    ROTOR_SIZE,
    SUBMISSION_BATCH_SIZE,
    A_TO_B_LOSS_PERCENT: aToBLoss,
    B_TO_D_LOSS_PERCENT: bToDLoss,
    C_TO_D_PRODUCER_LOSS_PERCENT: cToDProducerLoss,
    RESULTS: results
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v23_four_stage_isolation_report.json', JSON.stringify(report, null, 2));

  console.log('================================================================');
  console.log('🏆 FOUR-STAGE ISOLATION MATRIX RESULTS');
  console.log('================================================================');
  console.log(`MODE A (Meili Only)     : ${rateA} docs/sec (Util: ${utilA}%)`);
  console.log(`MODE B (Consumer Only)  : ${rateB} docs/sec (Util: ${utilB}%)`);
  console.log(`MODE C (Discovery Only) : ${rateC} cands/sec`);
  console.log(`MODE D (Full E2E)       : ${rateD} docs/sec (Util: ${utilD}%)`);
  console.log(`A -> B Loss (Consumer)  : ${aToBLoss}%`);
  console.log(`B -> D Loss (E2E Drop)  : ${bToDLoss}%`);
  console.log(`C -> D Producer Drop    : ${cToDProducerLoss}%`);
  console.log('Saved to reports/atlas/search/atlas_v23_four_stage_isolation_report.json\n');

  await pool.end();
}

main().catch(console.error);
