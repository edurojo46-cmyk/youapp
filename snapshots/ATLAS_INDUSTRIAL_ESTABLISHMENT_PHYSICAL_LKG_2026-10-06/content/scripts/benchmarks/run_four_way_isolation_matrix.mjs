import pg from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/pg/lib/index.js';
import dotenv from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/dotenv/lib/main.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from 'file:///c:/Users/Eduardo/YOUAPP/scripts/export_search_projection_v2.mjs';

dotenv.config({ path: 'c:/Users/Eduardo/YOUAPP/.env' });

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const COHORT_SIZE = 25000;
const BATCH_SIZE = 2500;

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
    await new Promise(r => setTimeout(r, 40));
  }
}

async function createRotorIndex(uid) {
  await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  const res = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  await waitForMeiliTask((await res.json()).taskUid);
}

// Executes a single run under a specific Mode: 'A' | 'B' | 'C' | 'D'
async function executeRun(pool, mode, roundLabel, enableHeavyTelemetry = false) {
  const runId = `C4W_${mode}_${roundLabel}_${Date.now()}`;
  const client = await pool.connect();

  console.log(`\n------------------------------------------------------------`);
  console.log(`▶ RUN [Mode ${mode}] - Round: ${roundLabel} (${COHORT_SIZE} candidates)`);
  console.log(`------------------------------------------------------------`);

  // 0. Pre-run cleanup
  await client.query(`DELETE FROM public.atlas_search_outbox_minimal WHERE source_id LIKE 'C4W_%';`);
  await client.query(`DELETE FROM public.atlas_hot_source_key_map WHERE source_id LIKE 'C4W_%';`);
  await client.query(`DELETE FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac LIKE 'c4w_%';`);

  let rotorUid = null;
  if (mode === 'D') {
    rotorUid = `atlas_rotor_4w_${Date.now()}`;
    await createRotorIndex(rotorUid);
  }

  let discoveryDone = false;
  let discoveryCommitted = 0;
  const rpcClientLatencies = [];
  const rpcServerLatencies = [];
  const fetchLatencies = [];
  const ackLatencies = [];
  const meiliSubmitLatencies = [];
  const meiliProcessLatencies = [];

  const startCpuUsage = process.cpuUsage();
  const t0 = performance.now();

  // Telemetry Monitor (if enabled)
  let telemetryCount = 0;
  let stopTelemetry = false;
  const telemetryPromise = (async () => {
    if (!enableHeavyTelemetry) return;
    const tClient = await pool.connect();
    try {
      while (!stopTelemetry) {
        await tClient.query(`
          SELECT count(*) as depth 
          FROM public.atlas_search_outbox_minimal 
          WHERE status = 'PENDING';
        `);
        telemetryCount++;
        await new Promise(r => setTimeout(r, 1000));
      }
    } finally {
      tClient.release();
    }
  })();

  // Producer (Discovery Ingestion)
  const producerPromise = (async () => {
    const prodClient = await pool.connect();
    try {
      for (let i = 0; i < COHORT_SIZE; i += BATCH_SIZE) {
        const count = Math.min(BATCH_SIZE, COHORT_SIZE - i);
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
          const hmac = crypto.createHash('sha256').update(`c4w_${runId}_${idx}`).digest('hex');
          const personId = `atlas_arg_per_${hmac.slice(0, 16)}`;
          pSources.push(runId);
          pSrcIds.push(`rec_${idx}`);
          pHmacs.push(hmac);
          pPersonIds.push(personId);
          pDecisions.push('NEW');
          pEvidenceIds.push(`ev_${idx}`);
          pObservedAts.push(nowIso);
        }

        const tRpc0 = performance.now();
        const res = await prodClient.query(`
          SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
            $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
          ) as payload;
        `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
        const dtClient = performance.now() - tRpc0;
        rpcClientLatencies.push(dtClient);

        const serverMs = res.rows[0]?.payload?.HOT_PATH_TOTAL_SERVER_MS || 0;
        rpcServerLatencies.push(Number(serverMs));
        discoveryCommitted += count;
      }
      discoveryDone = true;
    } finally {
      prodClient.release();
    }
  })();

  // Consumer (Modes B, C, D)
  const consumerPromise = (async () => {
    if (mode === 'A') return; // Mode A has NO consumer!
    const consClient = await pool.connect();
    try {
      while (!discoveryDone || true) {
        const tFetch0 = performance.now();
        const pendingRes = await consClient.query(`
          SELECT id, atlas_person_id, source_id, source_person_id, created_at
          FROM public.atlas_search_outbox_minimal
          WHERE source_id = $1 AND status = 'PENDING'
          ORDER BY id ASC
          LIMIT 5000;
        `, [runId]);
        fetchLatencies.push(performance.now() - tFetch0);

        const rows = pendingRes.rows;
        if (rows.length === 0) {
          if (discoveryDone) break;
          await new Promise(r => setTimeout(r, 60));
          continue;
        }

        // Mode D: Reconstruct and publish to Meilisearch
        if (mode === 'D') {
          const docs = rows.map(r => ({
            atlas_person_id: r.atlas_person_id,
            display_name: `CANARY CANDIDATE ${r.atlas_person_id.slice(-6)}`,
            role: 'DIRECTOR TITULAR',
            organization: 'CORPORACION 4WAY SA',
            source_id: r.source_id,
            source_record_id: r.source_person_id
          }));

          const tSub0 = performance.now();
          const inRes = await fetch(`${MEILI_URL}/indexes/${rotorUid}/documents`, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(docs)
          });
          const submitMs = performance.now() - tSub0;
          meiliSubmitLatencies.push(submitMs);

          const taskUid = (await inRes.json()).taskUid;
          const tTask0 = performance.now();
          await waitForMeiliTask(taskUid);
          meiliProcessLatencies.push(performance.now() - tTask0);
        }

        // Modes C & D: Perform PostgreSQL PUBLISHED Acknowledgement
        if (mode === 'C' || mode === 'D') {
          const minId = rows[0].id;
          const maxId = rows[rows.length - 1].id;
          const tAck0 = performance.now();
          await consClient.query(`
            UPDATE public.atlas_search_outbox_minimal
            SET status = 'PUBLISHED'
            WHERE id >= $1 AND id <= $2 AND status = 'PENDING';
          `, [minId, maxId]);
          ackLatencies.push(performance.now() - tAck0);
        }

        // Mode B: Does nothing further (reads only, no writes, no ACK!)
        if (mode === 'B') {
          await new Promise(r => setTimeout(r, 50));
          if (discoveryDone) break;
        }
      }
    } finally {
      consClient.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  stopTelemetry = true;
  await telemetryPromise;

  const totalWallSec = Number(((performance.now() - t0) / 1000).toFixed(2));
  const discoverySec = Number((COHORT_SIZE / totalWallSec).toFixed(2));
  const cpuDiff = process.cpuUsage(startCpuUsage);
  const cpuPercent = Number(((cpuDiff.user + cpuDiff.system) / (totalWallSec * 1000000) * 100).toFixed(1));
  const rssMB = Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(1));

  const clientP = calcPercentiles(rpcClientLatencies);
  const serverP = calcPercentiles(rpcServerLatencies);
  const fetchP = calcPercentiles(fetchLatencies);
  const ackP = calcPercentiles(ackLatencies);
  const meiliSubmitP = calcPercentiles(meiliSubmitLatencies);
  const meiliProcessP = calcPercentiles(meiliProcessLatencies);

  console.log(`   Wall Time         : ${totalWallSec}s`);
  console.log(`   Discovery Rate    : ${discoverySec} cands/sec`);
  console.log(`   RPC Client P50/P95: ${clientP.P50}ms / ${clientP.P95}ms (Server P50/P95: ${serverP.P50}ms / ${serverP.P95}ms)`);
  if (ackLatencies.length) console.log(`   Outbox ACK P50/P95: ${ackP.P50}ms / ${ackP.P95}ms`);
  if (meiliProcessLatencies.length) console.log(`   Meili Process P50 : ${meiliProcessP.P50}ms`);
  console.log(`   Node CPU Usage    : ${cpuPercent}% | Memory RSS: ${rssMB} MB`);

  // Cleanup index if mode D
  if (rotorUid) {
    await fetch(`${MEILI_URL}/indexes/${rotorUid}`, { method: 'DELETE', headers: HEADERS });
  }

  client.release();

  return {
    mode,
    roundLabel,
    cohortSize: COHORT_SIZE,
    totalWallSec,
    discoverySec,
    cpuPercent,
    rssMB,
    rpcClientLatencies: clientP,
    rpcServerLatencies: serverP,
    fetchLatencies: fetchP,
    ackLatencies: ackP,
    meiliSubmitLatencies: meiliSubmitP,
    meiliProcessLatencies: meiliProcessP,
    telemetryCount
  };
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 10 });

  console.log('================================================================');
  console.log('🔬 ATLAS V1.9 — FOUR-WAY ISOLATION MATRIX WITH ORDER CONTROL');
  console.log('Ordered Runs: Round 1 (A -> B -> C -> D) & Round 2 (D -> C -> B -> A)');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------
    // TELEMETRY OVERHEAD CONTROL RUN
    // -------------------------------------------------------------
    console.log('0. Measuring Telemetry Instrumentation Overhead...');
    const teleControlOff = await executeRun(pool, 'A', 'CTRL_NO_TELEM', false);
    const teleControlOn = await executeRun(pool, 'A', 'CTRL_WITH_TELEM', true);

    const instOverheadPercent = Number(
      (((teleControlOff.discoverySec - teleControlOn.discoverySec) / teleControlOff.discoverySec) * 100).toFixed(2)
    );
    console.log(`\nTelemetry Overhead Control:`);
    console.log(`  Rate Without Telemetry: ${teleControlOff.discoverySec} cands/sec`);
    console.log(`  Rate With Telemetry   : ${teleControlOn.discoverySec} cands/sec`);
    console.log(`  INSTRUMENTATION_OVERHEAD_PERCENT: ${instOverheadPercent}%`);

    // -------------------------------------------------------------
    // ROUND 1: Forward Order (A -> B -> C -> D)
    // -------------------------------------------------------------
    console.log('\n============================================================');
    console.log('ROUND 1: FORWARD ORDER (A -> B -> C -> D)');
    console.log('============================================================');
    const r1_A = await executeRun(pool, 'A', 'R1_FWD');
    const r1_B = await executeRun(pool, 'B', 'R1_FWD');
    const r1_C = await executeRun(pool, 'C', 'R1_FWD');
    const r1_D = await executeRun(pool, 'D', 'R1_FWD');

    // -------------------------------------------------------------
    // ROUND 2: Reverse Order (D -> C -> B -> A)
    // -------------------------------------------------------------
    console.log('\n============================================================');
    console.log('ROUND 2: REVERSE ORDER (D -> C -> B -> A)');
    console.log('============================================================');
    const r2_D = await executeRun(pool, 'D', 'R2_REV');
    const r2_C = await executeRun(pool, 'C', 'R2_REV');
    const r2_B = await executeRun(pool, 'B', 'R2_REV');
    const r2_A = await executeRun(pool, 'A', 'R2_REV');

    // Collect samples per mode
    const samplesA = [r1_A.discoverySec, r2_A.discoverySec];
    const samplesB = [r1_B.discoverySec, r2_B.discoverySec];
    const samplesC = [r1_C.discoverySec, r2_C.discoverySec];
    const samplesD = [r1_D.discoverySec, r2_D.discoverySec];

    function median(arr) {
      const s = [...arr].sort((a, b) => a - b);
      return Number(s[Math.floor(s.length / 2)].toFixed(2));
    }
    function dispersion(arr) {
      return Number((Math.max(...arr) - Math.min(...arr)).toFixed(2));
    }

    const A_DISCOVERY_SEC_MEDIAN = median(samplesA);
    const B_DISCOVERY_SEC_MEDIAN = median(samplesB);
    const C_DISCOVERY_SEC_MEDIAN = median(samplesC);
    const D_DISCOVERY_SEC_MEDIAN = median(samplesD);

    const dispA = dispersion(samplesA);
    const dispB = dispersion(samplesB);
    const dispC = dispersion(samplesC);
    const dispD = dispersion(samplesD);

    console.log('\n================================================================');
    console.log('📊 FOUR-WAY MATRIX RESULTS SUMMARY');
    console.log('================================================================');
    console.log(`MODE A (Discovery Only)          : MEDIAN = ${A_DISCOVERY_SEC_MEDIAN} cands/sec (dispersion: ±${dispA})`);
    console.log(`MODE B (+ Outbox Reader)         : MEDIAN = ${B_DISCOVERY_SEC_MEDIAN} cands/sec (dispersion: ±${dispB})`);
    console.log(`MODE C (+ Reader + ACK Updates)  : MEDIAN = ${C_DISCOVERY_SEC_MEDIAN} cands/sec (dispersion: ±${dispC})`);
    console.log(`MODE D (Full Concurrent Pipeline): MEDIAN = ${D_DISCOVERY_SEC_MEDIAN} cands/sec (dispersion: ±${dispD})`);

    // Quantitative Bottleneck Analysis
    const deltaAtoB = ((A_DISCOVERY_SEC_MEDIAN - B_DISCOVERY_SEC_MEDIAN) / A_DISCOVERY_SEC_MEDIAN) * 100;
    const deltaBtoC = ((B_DISCOVERY_SEC_MEDIAN - C_DISCOVERY_SEC_MEDIAN) / B_DISCOVERY_SEC_MEDIAN) * 100;
    const deltaCtoD = ((C_DISCOVERY_SEC_MEDIAN - D_DISCOVERY_SEC_MEDIAN) / C_DISCOVERY_SEC_MEDIAN) * 100;

    console.log(`\nDrop Analysis:`);
    console.log(`  A -> B (Reader Impact) : ${deltaAtoB.toFixed(1)}% drop`);
    console.log(`  B -> C (ACK Impact)    : ${deltaBtoC.toFixed(1)}% drop`);
    console.log(`  C -> D (Meili Impact)  : ${deltaCtoD.toFixed(1)}% drop`);

    let classification = 'MIXED';
    if (deltaBtoC > 30 && deltaBtoC > deltaCtoD) {
      classification = 'OUTBOX_ACK_WRITE_AMPLIFICATION_LIMITED';
    } else if (deltaCtoD > 30 && deltaCtoD > deltaBtoC) {
      classification = 'LOCAL_MEILI_LIMITED';
    } else if (deltaAtoB > 30) {
      classification = 'OUTBOX_READ_LIMITED';
    } else if (A_DISCOVERY_SEC_MEDIAN < 800) {
      classification = 'REMOTE_DB_RPC_LIMITED';
    }

    console.log(`\n🏁 BOTTLENECK CLASSIFICATION: ${classification}`);
    console.log('================================================================\n');

    const matrixReport = {
      TIMESTAMP: new Date().toISOString(),
      COHORT_SIZE,
      INSTRUMENTATION_OVERHEAD_PERCENT: instOverheadPercent,
      ORDER_CONTROL: {
        ROUND_1: ['A', 'B', 'C', 'D'],
        ROUND_2: ['D', 'C', 'B', 'A']
      },
      MEDIANS: {
        A_DISCOVERY_SEC_MEDIAN,
        B_DISCOVERY_SEC_MEDIAN,
        C_DISCOVERY_SEC_MEDIAN,
        D_DISCOVERY_SEC_MEDIAN
      },
      DISPERSION: {
        A_DISPERSION: dispA,
        B_DISPERSION: dispB,
        C_DISPERSION: dispC,
        D_DISPERSION: dispD
      },
      DELTA_DROPS_PERCENT: {
        A_TO_B_READER: Number(deltaAtoB.toFixed(2)),
        B_TO_C_ACK: Number(deltaBtoC.toFixed(2)),
        C_TO_D_MEILI: Number(deltaCtoD.toFixed(2))
      },
      RUN_DETAILS: {
        ROUND_1: { A: r1_A, B: r1_B, C: r1_C, D: r1_D },
        ROUND_2: { D: r2_D, C: r2_C, B: r2_B, A: r2_A }
      },
      BOTTLENECK_CLASSIFICATION: classification
    };

    const outDir = path.resolve('reports/atlas/benchmarks');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'atlas_v19_four_way_matrix_report.json'),
      JSON.stringify(matrixReport, null, 2)
    );

    // Cleanup any lingering fixtures
    const cleanupClient = await pool.connect();
    await cleanupClient.query(`DELETE FROM public.atlas_search_outbox_minimal WHERE source_id LIKE 'C4W_%';`);
    await cleanupClient.query(`DELETE FROM public.atlas_hot_source_key_map WHERE source_id LIKE 'C4W_%';`);
    await cleanupClient.query(`DELETE FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac LIKE 'c4w_%';`);
    cleanupClient.release();

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
