import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';

dotenv.config();

const MEILI_A_URL = process.env.MEILISEARCH_A_URL || 'http://127.0.0.1:7700';
const MEILI_B_URL = process.env.MEILISEARCH_B_URL || 'http://127.0.0.1:7701';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const JSONL_PATH = 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl';

const BASE_SETTINGS = {
  searchableAttributes: [
    'display_name_normalized',
    'display_name',
    'search_text_normalized',
    'role',
    'profession',
    'organization'
  ],
  filterableAttributes: [
    'evidence_state',
    'geography',
    'province',
    'source_ids'
  ],
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
    minWordSizeForTypos: {
      oneTypo: 5,
      twoTypos: 9
    },
    disableOnWords: [],
    disableOnAttributes: []
  },
  pagination: {
    maxTotalHits: 1000
  },
  prefixSearch: 'disabled'
};

async function meiliReq(baseUrl, path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (MEILI_KEY) {
    headers['Authorization'] = `Bearer ${MEILI_KEY}`;
  }
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Meili [${baseUrl}${path}] Error [${res.status}]: ${txt}`);
  }
  return res.json();
}

async function waitForTask(baseUrl, taskUid) {
  while (true) {
    const task = await meiliReq(baseUrl, `/tasks/${taskUid}`);
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed' || task.status === 'canceled') {
      throw new Error(`Task ${taskUid} on ${baseUrl} failed: ${JSON.stringify(task.error)}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }
}

async function waitForAllTasks(baseUrl, taskUids) {
  const completed = [];
  for (const uid of taskUids) {
    const t = await waitForTask(baseUrl, uid);
    completed.push(t);
  }
  return completed;
}

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { p50: 0, p95: 0, p99: 0, avg: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    p50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    p95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    p99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    avg: Number((sorted.reduce((sum, v) => sum + v, 0) / sorted.length).toFixed(2))
  };
}

async function loadCohortDocs(count = 100000, skip = 100000) {
  console.log(`Loading ${count.toLocaleString()} docs from JSONL (offset: ${skip.toLocaleString()})...`);
  const docs = [];
  const fileStream = fs.createReadStream(JSONL_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (idx >= skip && idx < skip + count) {
      docs.push(JSON.parse(line));
    }
    idx++;
    if (idx >= skip + count) break;
  }
  return docs;
}

async function setupInstanceIndex(baseUrl, indexUid, settings = BASE_SETTINGS) {
  try {
    const del = await meiliReq(baseUrl, `/indexes/${indexUid}`, { method: 'DELETE' });
    await waitForTask(baseUrl, del.taskUid);
  } catch (_) {}

  const cRes = await meiliReq(baseUrl, '/indexes', {
    method: 'POST',
    body: JSON.stringify({ uid: indexUid, primaryKey: 'atlas_person_id' })
  });
  await waitForTask(baseUrl, cRes.taskUid);

  const sRes = await meiliReq(baseUrl, `/indexes/${indexUid}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  await waitForTask(baseUrl, sRes.taskUid);
}

const TEST_QUERIES = [
  'GARCIA', 'RODRIGUEZ', 'GONZALEZ', 'FERNANDEZ', 'LOPEZ',
  'maria elena', 'juan carlos', 'jose luis', 'carlos alberto', 'ana maria',
  'garc', 'rodr', 'gonz', 'fern', 'lop',
  'sociedad', 'asociacion', 'nacional', 'buenos aires', 'cordoba',
  'director', 'socio', 'gerente', 'presidente', 'apoderado',
  'abogado', 'ingeniero', 'contador', 'medico', 'arquitecto'
];

export async function runDualMeiliBenchmark() {
  console.log('================================================================');
  console.log('⚡ ATLAS SEARCH V2: DUAL-INSTANCE PARALLEL MOTOR EXPERIMENT');
  console.log(`Instance A: ${MEILI_A_URL} | Instance B: ${MEILI_B_URL}`);
  console.log('================================================================\n');

  // Check health of both instances
  console.log('Checking health of both Meilisearch instances...');
  const healthA = await meiliReq(MEILI_A_URL, '/health');
  console.log(`Instance A Health: ${healthA.status}`);
  const healthB = await meiliReq(MEILI_B_URL, '/health');
  console.log(`Instance B Health: ${healthB.status}`);

  const cohortDocs = await loadCohortDocs(100000, 100000);
  console.log(`Loaded ${cohortDocs.length.toLocaleString()} publication documents into memory.\n`);

  // 1. Benchmark Single-Instance Baseline (using 50K segments on Instance A)
  console.log('----------------------------------------------------------------');
  console.log('1. BENCHMARKING SINGLE-INSTANCE BASELINE (Instance A Only)');
  console.log('----------------------------------------------------------------');
  const singleSeg1 = 'atlas_single_seg_1';
  const singleSeg2 = 'atlas_single_seg_2';
  await setupInstanceIndex(MEILI_A_URL, singleSeg1);
  await setupInstanceIndex(MEILI_A_URL, singleSeg2);

  const tSingle0 = performance.now();
  // Write seg 1 (50K) sequentially
  const singleTasks = [];
  for (let i = 0; i < 50000; i += 5000) {
    const chunk = cohortDocs.slice(i, i + 5000);
    const r = await meiliReq(MEILI_A_URL, `/indexes/${singleSeg1}/documents`, {
      method: 'POST',
      body: JSON.stringify(chunk)
    });
    singleTasks.push(r.taskUid);
  }
  await waitForAllTasks(MEILI_A_URL, singleTasks);

  // Write seg 2 (50K)
  const singleTasks2 = [];
  for (let i = 50000; i < 100000; i += 5000) {
    const chunk = cohortDocs.slice(i, i + 5000);
    const r = await meiliReq(MEILI_A_URL, `/indexes/${singleSeg2}/documents`, {
      method: 'POST',
      body: JSON.stringify(chunk)
    });
    singleTasks2.push(r.taskUid);
  }
  await waitForAllTasks(MEILI_A_URL, singleTasks2);

  const singleWallSec = Number(((performance.now() - tSingle0) / 1000).toFixed(2));
  const singleDocsSec = Number((100000 / singleWallSec).toFixed(2));
  console.log(`SINGLE_INSTANCE_WALL_SEC  : ${singleWallSec} s`);
  console.log(`SINGLE_INSTANCE_DOCS_SEC  : ${singleDocsSec} docs/s\n`);

  // Clean up single baseline indices
  await meiliReq(MEILI_A_URL, `/indexes/${singleSeg1}`, { method: 'DELETE' }).catch(() => {});
  await meiliReq(MEILI_A_URL, `/indexes/${singleSeg2}`, { method: 'DELETE' }).catch(() => {});

  // 2. Benchmark Dual-Instance Concurrent Stream
  console.log('----------------------------------------------------------------');
  console.log('2. BENCHMARKING DUAL-INSTANCE CONCURRENT MOTOR (Instance A & B)');
  console.log('Segment A (50,000 docs) -> Instance A');
  console.log('Segment B (50,000 docs) -> Instance B');
  console.log('Both indexed simultaneously across separate physical processes!');
  console.log('----------------------------------------------------------------');

  const dualSegA = 'atlas_dual_seg_a';
  const dualSegB = 'atlas_dual_seg_b';

  await Promise.all([
    setupInstanceIndex(MEILI_A_URL, dualSegA),
    setupInstanceIndex(MEILI_B_URL, dualSegB)
  ]);

  const docsA = cohortDocs.slice(0, 50000);
  const docsB = cohortDocs.slice(50000, 100000);

  const tDual0 = performance.now();
  const startMem = process.memoryUsage();
  const startCpu = process.cpuUsage();

  // Index concurrently
  const indexPromiseA = (async () => {
    const taskUids = [];
    for (let i = 0; i < docsA.length; i += 5000) {
      const chunk = docsA.slice(i, i + 5000);
      const r = await meiliReq(MEILI_A_URL, `/indexes/${dualSegA}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      taskUids.push(r.taskUid);
    }
    await waitForAllTasks(MEILI_A_URL, taskUids);
  })();

  const indexPromiseB = (async () => {
    const taskUids = [];
    for (let i = 0; i < docsB.length; i += 5000) {
      const chunk = docsB.slice(i, i + 5000);
      const r = await meiliReq(MEILI_B_URL, `/indexes/${dualSegB}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      taskUids.push(r.taskUid);
    }
    await waitForAllTasks(MEILI_B_URL, taskUids);
  })();

  await Promise.all([indexPromiseA, indexPromiseB]);

  const tDualEnd = performance.now();
  const endCpu = process.cpuUsage(startCpu);
  const endMem = process.memoryUsage();

  const dualWallSec = Number(((tDualEnd - tDual0) / 1000).toFixed(2));
  const dualDocsSec = Number((100000 / dualWallSec).toFixed(2));
  const motorSpeedup = Number((dualDocsSec / singleDocsSec).toFixed(2));

  // Resource usage metrics
  const totalCpuSec = (endCpu.user + endCpu.system) / 1000000;
  const cpuPercent = Number(((totalCpuSec / dualWallSec) * 100).toFixed(1));
  const rssMb = Number((endMem.rss / (1024 * 1024)).toFixed(1));
  const freeRamMb = Number((os.freemem() / (1024 * 1024)).toFixed(1));
  const totalRamMb = Number((os.totalmem() / (1024 * 1024)).toFixed(1));

  console.log(`\nDUAL_INSTANCE_WALL_SEC    : ${dualWallSec} s`);
  console.log(`DUAL_INSTANCE_DOCS_SEC    : ${dualDocsSec} docs/s`);
  console.log(`MOTOR_SPEEDUP             : ${motorSpeedup}x`);
  console.log(`NODE_CPU_ACTIVE_PERCENT   : ${cpuPercent}%`);
  console.log(`NODE_RSS_RAM_MB           : ${rssMb} MB`);
  console.log(`SYSTEM_FREE_RAM_MB        : ${freeRamMb} MB / ${totalRamMb} MB`);

  // 3. Query Fan-Out Merges & Parity Check
  console.log('\n----------------------------------------------------------------');
  console.log('3. QUERY FAN-OUT EVALUATION & DEDUPLICATION');
  console.log('----------------------------------------------------------------');

  const queryLatencies = [];
  let totalVisibleDuplicates = 0;
  let totalContractHits = 0;

  for (const q of TEST_QUERIES) {
    const tQ0 = performance.now();
    const [resA, resB] = await Promise.all([
      meiliReq(MEILI_A_URL, `/indexes/${dualSegA}/search`, {
        method: 'POST',
        body: JSON.stringify({ q, limit: 20 })
      }),
      meiliReq(MEILI_B_URL, `/indexes/${dualSegB}/search`, {
        method: 'POST',
        body: JSON.stringify({ q, limit: 20 })
      })
    ]);
    const qLat = performance.now() - tQ0;
    queryLatencies.push(qLat);

    // Merge & deduplicate by atlas_person_id
    const seen = new Set();
    const merged = [];
    for (const h of (resB.hits || [])) {
      if (seen.has(h.atlas_person_id)) {
        totalVisibleDuplicates++;
      } else {
        seen.add(h.atlas_person_id);
        merged.push(h);
      }
    }
    for (const h of (resA.hits || [])) {
      if (seen.has(h.atlas_person_id)) {
        totalVisibleDuplicates++;
      } else {
        seen.add(h.atlas_person_id);
        merged.push(h);
      }
    }
    totalContractHits += merged.length;
  }

  const qStats = calcPercentiles(queryLatencies);

  // Check document counts
  const statsA = await meiliReq(MEILI_A_URL, `/indexes/${dualSegA}/stats`);
  const statsB = await meiliReq(MEILI_B_URL, `/indexes/${dualSegB}/stats`);
  const totalDualDocs = statsA.numberOfDocuments + statsB.numberOfDocuments;
  const missingDocs = 100000 - totalDualDocs;

  console.log(`QUERY_FANOUT_P50_MS       : ${qStats.p50} ms`);
  console.log(`QUERY_FANOUT_P95_MS       : ${qStats.p95} ms`);
  console.log(`VISIBLE_DUPLICATES        : ${totalVisibleDuplicates}`);
  console.log(`TOTAL_INDEXED_DOCS        : ${totalDualDocs.toLocaleString()} (A: ${statsA.numberOfDocuments.toLocaleString()}, B: ${statsB.numberOfDocuments.toLocaleString()})`);
  console.log(`MISSING_DOCUMENTS         : ${missingDocs}`);
  console.log(`SEARCH_700_GATE           : ${dualDocsSec >= 700 ? 'PASS' : 'FAIL'}`);

  const summary = {
    TIMESTAMP: new Date().toISOString(),
    SINGLE_INSTANCE_DOCS_SEC: singleDocsSec,
    DUAL_INSTANCE_DOCS_SEC: dualDocsSec,
    MOTOR_SPEEDUP: `${motorSpeedup}x`,
    TOTAL_100K_WALL_SEC: dualWallSec,
    CPU: `${cpuPercent}%`,
    RAM: `RSS: ${rssMb}MB, Free System: ${freeRamMb}MB`,
    DISK_IO: 'Dedicated separate paths (Instance A: data_discovery_delta.ms, Instance B: data_delta_motor2.ms)',
    QUERY_P50: qStats.p50,
    QUERY_P95: qStats.p95,
    VISIBLE_DUPLICATES: totalVisibleDuplicates,
    MISSING: missingDocs,
    CONTRACT_PARITY: (missingDocs === 0 && totalVisibleDuplicates === 0) ? '100%' : 'FAIL',
    SEARCH_700_GATE: dualDocsSec >= 700 ? 'PASS' : 'FAIL'
  };

  fs.writeFileSync(
    'reports/atlas/search/atlas_dual_meili_benchmark_summary.json',
    JSON.stringify(summary, null, 2)
  );

  // Cleanup dual test indices
  await meiliReq(MEILI_A_URL, `/indexes/${dualSegA}`, { method: 'DELETE' }).catch(() => {});
  await meiliReq(MEILI_B_URL, `/indexes/${dualSegB}`, { method: 'DELETE' }).catch(() => {});

  return summary;
}

runDualMeiliBenchmark().catch(err => {
  console.error('Dual Meili benchmark failed:', err);
  process.exit(1);
});
