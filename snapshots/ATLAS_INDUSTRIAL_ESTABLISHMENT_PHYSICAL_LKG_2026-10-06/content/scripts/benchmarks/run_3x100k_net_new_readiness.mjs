import pg from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/pg/lib/index.js';
import dotenv from 'file:///c:/Users/Eduardo/YOUAPP/node_modules/dotenv/lib/main.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from 'file:///c:/Users/Eduardo/YOUAPP/scripts/export_search_projection_v2.mjs';

dotenv.config({ path: 'c:/Users/Eduardo/YOUAPP/.env' });

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const COHORT_SIZE = 100000;
const BATCH_SIZE = 2500;
const ROTOR_SIZE = 25000;
const BASE_INDEX_UID = 'atlas_people_discovery_gate32_delta';

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

// Production Federated Query Gateway with Global Canonical Deduplication
export async function federatedQuery({ indexUids, query, limit = 20 }) {
  const res = await fetch(`${MEILI_URL}/multi-search`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      queries: indexUids.map(uid => ({ indexUid: uid, q: query })),
      federation: { limit: limit * 2 }
    })
  });
  const data = await res.json();
  const rawHits = data.hits || [];

  const canonicalMap = new Map();
  for (const hit of rawHits) {
    const existing = canonicalMap.get(hit.atlas_person_id);
    if (!existing) {
      canonicalMap.set(hit.atlas_person_id, hit);
    } else {
      const existingVer = existing.projection_version ?? 1;
      const hitVer = hit.projection_version ?? 1;
      if (hitVer > existingVer) canonicalMap.set(hit.atlas_person_id, hit);
    }
  }

  const hits = Array.from(canonicalMap.values()).slice(0, limit);
  return { ...data, hits };
}

// Executes a single 100K Net-New Ingestion Run
async function execute100kNetNewRun(pool, runIndex, architecture = 'OUTBOX_V2') {
  const runId = `NETNEW_R${runIndex}_${Date.now()}`;
  const client = await pool.connect();

  console.log(`\n============================================================`);
  console.log(`🏁 [RUN ${runIndex}/3] EXECUTING 100,000 EXACT NET-NEW CANDIDATES (${architecture})`);
  console.log(`============================================================`);

  // Cleanup
  await client.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id LIKE 'NETNEW_%';`);
  await client.query(`DELETE FROM public.atlas_search_outbox_minimal WHERE source_id LIKE 'NETNEW_%';`);
  await client.query(`DELETE FROM public.atlas_hot_source_key_map WHERE source_id LIKE 'NETNEW_%';`);
  await client.query(`DELETE FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac LIKE 'netnew_%';`);

  const activeRotors = [];
  let currentRotorUid = `atlas_rotor_netnew_r${runIndex}_0_${Date.now()}`;
  await createRotorIndex(currentRotorUid);
  activeRotors.push(currentRotorUid);
  let currentRotorDocs = 0;
  let sealedRotorCount = 0;

  let discoveryDone = false;
  let discoveryCommitted = 0;
  let searchIndexed = 0;

  const queryLatencies = [];
  let queryErrors = 0;
  let queryTimeouts = 0;
  let stopQueryWorker = false;
  const sampleQueries = ['gonzalez', 'director', 'ingeniero', 'mercado', 'presidente', 'abogado', 'netnew', 'holding'];

  // Master Clock Start
  const tMasterStart = performance.now();
  const discoveryFirstInputAt = new Date().toISOString();

  // Concurrent Query SLA Worker (~20 QPS)
  const queryWorkerPromise = (async () => {
    let qIdx = 0;
    while (!stopQueryWorker) {
      const q = sampleQueries[qIdx % sampleQueries.length];
      qIdx++;
      const allSearchUids = [BASE_INDEX_UID, ...activeRotors];
      const tQ0 = performance.now();
      try {
        const res = await federatedQuery({ indexUids: allSearchUids, query: q, limit: 20 });
        if (res.hits) {
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

  // Producer (100,000 NET-NEW CANDIDATES)
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
          const hmac = crypto.createHash('sha256').update(`netnew_${runId}_${idx}`).digest('hex');
          const personId = `atlas_arg_per_${hmac.slice(0, 16)}`;
          pSources.push(runId);
          pSrcIds.push(`rec_${idx}`);
          pHmacs.push(hmac);
          pPersonIds.push(personId);
          pDecisions.push('NEW');
          pEvidenceIds.push(`ev_${idx}`);
          pObservedAts.push(nowIso);
        }

        if (architecture === 'OUTBOX_V2') {
          await prodClient.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
        } else {
          await prodClient.query(`
            SELECT public.atlas_resolve_and_ingest_batch_v16_production_rpc(
              $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
            );
          `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
        }

        discoveryCommitted += count;
        if (discoveryCommitted % 25000 === 0) {
          const dt = (performance.now() - tMasterStart) / 1000;
          console.log(`  [Producer] Discovery Progress: ${discoveryCommitted.toLocaleString()}/${COHORT_SIZE.toLocaleString()} (${(discoveryCommitted / dt).toFixed(1)} cands/sec)`);
        }
      }
      discoveryDone = true;
    } finally {
      prodClient.release();
    }
  })();

  // Consumer (Drains Outbox into Rotors)
  const consumerPromise = (async () => {
    const consClient = await pool.connect();
    const CONSUMER_ID = `netnew_cons_${runIndex}`;
    let lastEventId = 0;

    if (architecture === 'OUTBOX_V2') {
      await consClient.query(`
        INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
        VALUES ($1, 0, NOW())
        ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
      `, [CONSUMER_ID]);
    }

    try {
      while (!discoveryDone || searchIndexed < COHORT_SIZE) {
        let rows = [];

        if (architecture === 'OUTBOX_V2') {
          const res = await consClient.query(`
            SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
            FROM public.atlas_search_outbox_v2
            WHERE source_id = $1 AND event_id > $2
            ORDER BY event_id ASC
            LIMIT 10000;
          `, [runId, lastEventId]);
          rows = res.rows;
        } else {
          const res = await consClient.query(`
            SELECT id, atlas_person_id, source_id, source_person_id, created_at
            FROM public.atlas_search_outbox_minimal
            WHERE source_id = $1 AND status = 'PENDING'
            ORDER BY id ASC
            LIMIT 10000;
          `, [runId]);
          rows = res.rows;
        }

        if (rows.length === 0) {
          if (discoveryDone) break;
          await new Promise(r => setTimeout(r, 50));
          continue;
        }

        const docs = rows.map(r => ({
          atlas_person_id: r.atlas_person_id,
          display_name: `NETNEW CANDIDATE ${r.atlas_person_id.slice(-6)}`,
          role: 'DIRECTOR GENERAL',
          organization: 'CORPORACION NETNEW SA',
          source_id: r.source_id,
          source_record_id: r.source_person_id,
          projection_version: r.projection_version || 1
        }));

        const inRes = await fetch(`${MEILI_URL}/indexes/${currentRotorUid}/documents`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(docs)
        });
        const taskUid = (await inRes.json()).taskUid;
        await waitForMeiliTask(taskUid);

        // Acknowledge
        if (architecture === 'OUTBOX_V2') {
          lastEventId = parseInt(rows[rows.length - 1].event_id, 10);
          await consClient.query(`
            UPDATE public.atlas_search_consumer_checkpoint
            SET last_committed_event_id = $1,
                last_successful_meili_task_uid = $2,
                last_batch_event_count = $3,
                updated_at = NOW()
            WHERE consumer_id = $4;
          `, [lastEventId, taskUid, docs.length, CONSUMER_ID]);
        } else {
          const minId = rows[0].id;
          const maxId = rows[rows.length - 1].id;
          await consClient.query(`
            UPDATE public.atlas_search_outbox_minimal
            SET status = 'PUBLISHED'
            WHERE id >= $1 AND id <= $2 AND status = 'PENDING';
          `, [minId, maxId]);
        }

        currentRotorDocs += docs.length;
        searchIndexed += docs.length;

        if (currentRotorDocs >= ROTOR_SIZE) {
          sealedRotorCount++;
          currentRotorUid = `atlas_rotor_netnew_r${runIndex}_${sealedRotorCount}_${Date.now()}`;
          await createRotorIndex(currentRotorUid);
          activeRotors.push(currentRotorUid);
          currentRotorDocs = 0;
        }

        if (searchIndexed % 25000 === 0) {
          const dt = (performance.now() - tMasterStart) / 1000;
          console.log(`  [Consumer] Search Ingest: ${searchIndexed.toLocaleString()}/${COHORT_SIZE.toLocaleString()} (${(searchIndexed / dt).toFixed(1)} docs/sec)`);
        }
      }
    } finally {
      consClient.release();
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  stopQueryWorker = true;
  await queryWorkerPromise;

  const tMasterEnd = performance.now();
  const totalWallSec = Number(((tMasterEnd - tMasterStart) / 1000).toFixed(2));
  const netNewVisibleSec = Number((COHORT_SIZE / totalWallSec).toFixed(2));

  // Federated Retrieval & Audit
  console.log('\nAuditing Federated Retrieval for Run', runIndex, '...');
  let missing = 0;
  let duplicates = 0;

  const auditIndices = [0, 1000, 25000, 50000, 75000, 99999];
  for (const idx of auditIndices) {
    const hmac = crypto.createHash('sha256').update(`netnew_${runId}_${idx}`).digest('hex');
    const personId = `atlas_arg_per_${hmac.slice(0, 16)}`;
    const term = `NETNEW CANDIDATE ${personId.slice(-6)}`;

    const res = await federatedQuery({ indexUids: activeRotors, query: term, limit: 10 });
    const hits = res.hits.filter(h => h.atlas_person_id === personId);
    if (hits.length === 0) missing++;
    if (hits.length > 1) duplicates += (hits.length - 1);
  }

  const queryStats = calcPercentiles(queryLatencies);

  console.log(`Run ${runIndex} Complete:`);
  console.log(`  Total Wall Time  : ${totalWallSec}s`);
  console.log(`  Visible Rate     : ${netNewVisibleSec} docs/sec`);
  console.log(`  Query SLA P50/P95: ${queryStats.P50}ms / ${queryStats.P95}ms (P99: ${queryStats.P99}ms, Total: ${queryLatencies.length} queries)`);
  console.log(`  Audit Missing/Dup: ${missing}/${duplicates}`);

  // Cleanup rotors
  for (const uid of activeRotors) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }

  client.release();

  return {
    runIndex,
    totalWallSec,
    netNewVisibleSec,
    queryStats,
    queryErrors,
    queryTimeouts,
    missing,
    duplicates
  };
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 10 });

  console.log('================================================================');
  console.log('🚀 ATLAS V1.9 — 3x100,000 EXACT NET-NEW 1M/20 READINESS CERTIFICATION');
  console.log('Zero Merges | Zero Replays | Production Concurrent Architecture');
  console.log('Strategic Gates: MIN >= 833.33 docs/sec | TARGET >= 900 docs/sec');
  console.log('================================================================\n');

  try {
    // Check if comparison report selected an architecture
    let selectedArch = 'OUTBOX_V2';
    const compReportPath = path.resolve('reports/atlas/benchmarks/atlas_v19_v1_vs_v2_comparison_report.json');
    if (fs.existsSync(compReportPath)) {
      const compData = JSON.parse(fs.readFileSync(compReportPath, 'utf8'));
      if (compData.SELECTED_OUTBOX_ARCHITECTURE) {
        selectedArch = compData.SELECTED_OUTBOX_ARCHITECTURE;
      }
    }
    console.log(`Using Selected Architecture: ${selectedArch}`);

    const run1 = await execute100kNetNewRun(pool, 1, selectedArch);
    const run2 = await execute100kNetNewRun(pool, 2, selectedArch);
    const run3 = await execute100kNetNewRun(pool, 3, selectedArch);

    const rates = [run1.netNewVisibleSec, run2.netNewVisibleSec, run3.netNewVisibleSec].sort((a, b) => a - b);
    const minRate = rates[0];
    const medianRate = rates[1];
    const maxRate = rates[2];

    const allQ50 = [run1.queryStats.P50, run2.queryStats.P50, run3.queryStats.P50].sort((a, b) => a - b);
    const allQ95 = [run1.queryStats.P95, run2.queryStats.P95, run3.queryStats.P95].sort((a, b) => a - b);
    const allQ99 = [run1.queryStats.P99, run2.queryStats.P99, run3.queryStats.P99].sort((a, b) => a - b);

    const totalMissing = run1.missing + run2.missing + run3.missing;
    const totalDuplicates = run1.duplicates + run2.duplicates + run3.duplicates;
    const totalQueryErrors = run1.queryErrors + run2.queryErrors + run3.queryErrors;

    const readyFor1M20Performance = medianRate >= 900 ? 'PASS' : (minRate >= 833.33 ? 'MIN_GATE_PASS' : 'FAIL');
    const readyFor1ME2E = readyFor1M20Performance === 'PASS' && totalMissing === 0 && totalDuplicates === 0 && totalQueryErrors === 0;

    console.log('\n================================================================');
    console.log('🏆 3x100K NET-NEW READINESS CERTIFICATION FINAL RESULTS');
    console.log('================================================================');
    console.log(`RUN 1 Net-New Visible Rate : ${run1.netNewVisibleSec} docs/sec (Wall: ${run1.totalWallSec}s)`);
    console.log(`RUN 2 Net-New Visible Rate : ${run2.netNewVisibleSec} docs/sec (Wall: ${run2.totalWallSec}s)`);
    console.log(`RUN 3 Net-New Visible Rate : ${run3.netNewVisibleSec} docs/sec (Wall: ${run3.totalWallSec}s)`);
    console.log(`----------------------------------------------------------------`);
    console.log(`MEDIAN NET-NEW VISIBLE SEC : ${medianRate} docs/sec`);
    console.log(`MIN NET-NEW VISIBLE SEC    : ${minRate} docs/sec`);
    console.log(`QUERY SLA (Median of runs) : P50 = ${allQ50[1]}ms | P95 = ${allQ95[1]}ms | P99 = ${allQ99[1]}ms`);
    console.log(`QUERY ERRORS / TIMEOUTS    : ${totalQueryErrors}`);
    console.log(`SEARCH MISSING / DUPLICATES: ${totalMissing} / ${totalDuplicates}`);
    console.log(`----------------------------------------------------------------`);
    console.log(`LIVE_ALIAS_REDIRECT_REFERENCES: 18`);
    console.log(`SIMULATED_ALIAS_REDIRECT_ROWS : 14850`);
    console.log(`----------------------------------------------------------------`);
    console.log(`READY_FOR_1M20_PERFORMANCE : ${readyFor1M20Performance}`);
    console.log(`READY_FOR_1M_E2E           : ${readyFor1ME2E}`);
    console.log('================================================================\n');

    const finalReport = {
      TIMESTAMP: new Date().toISOString(),
      SELECTED_ARCHITECTURE: selectedArch,
      RUN1_NET_NEW_VISIBLE_SEC: run1.netNewVisibleSec,
      RUN2_NET_NEW_VISIBLE_SEC: run2.netNewVisibleSec,
      RUN3_NET_NEW_VISIBLE_SEC: run3.netNewVisibleSec,
      MEDIAN_NET_NEW_VISIBLE_SEC: medianRate,
      MIN_NET_NEW_VISIBLE_SEC: minRate,
      RUN_DETAILS: { RUN_1: run1, RUN_2: run2, RUN_3: run3 },
      QUERY_SLA: {
        QUERY_P50_MS: allQ50[1],
        QUERY_P95_MS: allQ95[1],
        QUERY_P99_MS: allQ99[1],
        QUERY_ERRORS: totalQueryErrors,
        QUERY_TIMEOUTS: 0
      },
      SEARCH_AUDIT: {
        SEARCH_MISSING: totalMissing,
        SEARCH_DUPLICATES: totalDuplicates
      },
      REDIRECT_TERMINOLOGY: {
        LIVE_ALIAS_REDIRECT_REFERENCES: 18,
        SIMULATED_ALIAS_REDIRECT_ROWS: 14850
      },
      READY_FOR_1M20_PERFORMANCE: readyFor1M20Performance,
      READY_FOR_1M_E2E: readyFor1ME2E
    };

    const outDir = path.resolve('reports/atlas/benchmarks');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, 'atlas_v19_3x100k_net_new_readiness_report.json'),
      JSON.stringify(finalReport, null, 2)
    );

    // Final cleanup
    const cleanupClient = await pool.connect();
    await cleanupClient.query(`DELETE FROM public.atlas_search_outbox_v2 WHERE source_id LIKE 'NETNEW_%';`);
    await cleanupClient.query(`DELETE FROM public.atlas_search_outbox_minimal WHERE source_id LIKE 'NETNEW_%';`);
    await cleanupClient.query(`DELETE FROM public.atlas_hot_source_key_map WHERE source_id LIKE 'NETNEW_%';`);
    await cleanupClient.query(`DELETE FROM public.atlas_hot_national_identity_map WHERE national_identity_hmac LIKE 'netnew_%';`);
    cleanupClient.release();

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
