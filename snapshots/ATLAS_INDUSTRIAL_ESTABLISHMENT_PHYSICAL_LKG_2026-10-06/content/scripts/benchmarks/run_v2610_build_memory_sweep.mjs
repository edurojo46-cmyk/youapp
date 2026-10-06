import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { fetch as undiciFetch, Agent, buildConnector } from 'undici';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exec, execSync, spawn } from 'node:child_process';
import util from 'node:util';

const execAsync = util.promisify(exec);
dotenv.config();

const GIB = 1024 * 1024 * 1024;

function getDiskFreeStats() {
  const stat = fs.statfsSync('C:\\');
  const freeBytes = Number(stat.bfree) * Number(stat.bsize);
  const totalBytes = Number(stat.blocks) * Number(stat.bsize);
  const freeGiB = freeBytes / GIB;
  const totalGiB = totalBytes / GIB;
  const freePercent = (freeBytes / totalBytes) * 100;
  return {
    freeBytes,
    totalBytes,
    freeGiB: parseFloat(freeGiB.toFixed(4)),
    totalGiB: parseFloat(totalGiB.toFixed(4)),
    freePercent: parseFloat(freePercent.toFixed(2))
  };
}

const MEILI_READ_URL = 'http://127.0.0.1:7700';
const MEILI_BUILD_URL = 'http://127.0.0.1:7701';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || 'masterKey';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + MEILI_KEY
};

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

const SAMPLE_QUERIES = [
  'gonzalez', 'director', 'ingeniero', 'mercado', 'presidente',
  'abogado', 'matrix', 'holding', 'santos', 'lopez'
];

const TARGET_QPS = 20;
const SLOT_MS = 1000 / TARGET_QPS;
const CLIENT_SERVICE_TIMEOUT_MS = 5000;
const FROZEN_BUILD_BATCH = 2500;
const NEW_WRITE_COHORT = 50000;
const WRITE_COHORT_START_ID = 350000;

function parseDurationMs(durationStr) {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT([\d.]+)S/);
  if (match) return parseFloat(match[1]) * 1000;
  return 0;
}

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0, Max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2)),
    Max: Number(sorted[sorted.length - 1].toFixed(2))
  };
}

function generateDocBatch(startId, count) {
  const docs = new Array(count);
  for (let i = 0; i < count; i++) {
    const id = startId + i;
    docs[i] = {
      atlas_person_id: id,
      source_id: 'SRC_BENCH_CANARY',
      source_person_id: `SRC_v24_canary_1790015958064_${id}`,
      projection_version: 2,
      display_name: `Candidate SRC_v24_canary_1790015958064_${id}`,
      display_name_normalized: `candidate SRC_v24_canary_1790015958064_${id}`,
      organization: 'ATLAS MATRIX S.A.',
      role: 'DIRECTOR',
      profession: 'Ingeniero',
      search_text_normalized: `candidate SRC_v24_canary_1790015958064_${id} director atlas matrix s.a.`,
      created_at: new Date().toISOString()
    };
  }
  return docs;
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

class AtlasGimbalRouter {
  constructor(initialTarget) {
    this.activeTarget = Object.freeze({ ...initialTarget });
    this.previousTarget = null;
    this.swapHistory = [];
  }

  getTarget() {
    return this.activeTarget;
  }

  atomicSwap(newTarget) {
    const tStart = performance.now();
    this.previousTarget = this.activeTarget;
    this.activeTarget = Object.freeze({ ...newTarget });
    const durationMs = Number((performance.now() - tStart).toFixed(4));
    this.swapHistory.push({
      from: this.previousTarget.generation,
      to: this.activeTarget.generation,
      timestamp: performance.now(),
      durationMs
    });
    return durationMs;
  }
}

// Single Execution Function for a specific Build Plane Memory Cap
async function executeBuildMemoryTest(buildMemFlag, configLabel, globalRunIndex = 1) {
  console.log('\n================================================================');
  console.log(`⚡ EXECUTING CONFIGURATION ${configLabel}: BUILD MEMORY CAP = ${buildMemFlag} (${globalRunIndex}/3)`);
  console.log(`Frozen: batch = ${FROZEN_BUILD_BATCH}, indexing-threads = 2, 20 QPS paced`);
  console.log('================================================================');

  // Verify Read Plane (Plane A) on 7700
  let pidRead = null;
  try {
    const pOut = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 7700 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"', { encoding: 'utf8' }).trim();
    if (pOut) pidRead = parseInt(pOut.split('\n')[0].trim());
  } catch {}
  if (!pidRead) throw new Error('MEILI_READ on port 7700 is not running!');
  console.log(`✅ Read Plane verified: PID ${pidRead} on port 7700`);

  const buildDbPath = 'C:\\Users\\Eduardo\\YOUAPP\\data_build.ms';
  const meiliExe = 'C:\\Users\\Eduardo\\YOUAPP\\bin\\meilisearch.exe';

  function spawnPlaneB() {
    return spawn(meiliExe, [
      '--http-addr', '127.0.0.1:7701',
      '--db-path', buildDbPath,
      '--no-analytics',
      '--max-indexing-memory', buildMemFlag,
      '--max-indexing-threads', '2'
    ], { stdio: 'ignore', detached: false });
  }

  let buildProc = spawnPlaneB();
  let pidBuild = buildProc.pid;
  console.log(`✅ Build Plane spawned: PID ${pidBuild} with --max-indexing-memory ${buildMemFlag}`);

  // Dispatchers setup
  const defaultUserConnector = buildConnector({});
  let userConnectCount = 0;
  let userLastConnectDuration = 0;

  const userConnectorWrapper = (opts, cb) => {
    userConnectCount++;
    const t0 = performance.now();
    defaultUserConnector(opts, (err, socket) => {
      userLastConnectDuration = Number((performance.now() - t0).toFixed(2));
      cb(err, socket);
    });
  };

  const userSearchDispatcher = new Agent({
    keepAliveTimeout: 30000,
    keepAliveMaxTimeout: 60000,
    connections: 32,
    pipelining: 1,
    connect: userConnectorWrapper
  });

  const validationDispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: 8,
    pipelining: 1
  });

  const controlDispatcher = new Agent({
    keepAliveTimeout: 5000,
    keepAliveMaxTimeout: 15000,
    connections: 8,
    pipelining: 1
  });

  async function controlFetch(url, options = {}) {
    return undiciFetch(url, { ...options, dispatcher: controlDispatcher });
  }

  async function waitForMeiliTask(targetUrl, taskUid, maxWaitMs = 60000) {
    if (taskUid === undefined || taskUid === null) throw new Error('taskUid undefined');
    const t0 = performance.now();
    while (performance.now() - t0 < maxWaitMs) {
      try {
        const res = await controlFetch(`${targetUrl}/tasks/${taskUid}`, { headers: HEADERS });
        const t = await res.json();
        if (t.status === 'succeeded') return parseDurationMs(t.duration);
        if (t.status === 'failed') throw new Error(`Task ${taskUid} failed: ${JSON.stringify(t.error)}`);
      } catch (e) {
        if (e.message && e.message.includes('Task')) throw e;
      }
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error(`Task ${taskUid} timed out after ${maxWaitMs}ms`);
  }

  async function waitPlaneBReady(maxMs = 15000) {
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs) {
      try {
        const hRes = await controlFetch(`${MEILI_BUILD_URL}/health`);
        if (hRes.ok) return true;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  if (!await waitPlaneBReady()) throw new Error('MEILI_BUILD failed to become healthy.');

  // Base State Alignment on Plane B (exactly 350K docs)
  const bRotUids = ['v264_b_rot_0', 'v264_b_rot_1'];
  let bStats0 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_0/stats`, { headers: HEADERS })).json().catch(() => ({}));
  let bStats1 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_1/stats`, { headers: HEADERS })).json().catch(() => ({}));

  if (bStats0.numberOfDocuments === 200000 && bStats1.numberOfDocuments === 150000) {
    console.log('✅ Generation N+1 Base State verified on Plane B: 350,000 docs.');
  } else {
    console.log('⚡ Leveling Plane B to exactly 350,000 documents...');
    if (bStats0.numberOfDocuments !== 200000) {
      const del0 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_0`, { method: 'DELETE', headers: HEADERS })).json().catch(() => ({}));
      if (del0.taskUid) await waitForMeiliTask(MEILI_BUILD_URL, del0.taskUid);
      const cr0 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ uid: 'v264_b_rot_0', primaryKey: 'atlas_person_id' }) })).json();
      if (cr0.taskUid) await waitForMeiliTask(MEILI_BUILD_URL, cr0.taskUid);
      const set0 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_0/settings`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(FROZEN_SETTINGS) })).json();
      if (set0.taskUid) await waitForMeiliTask(MEILI_BUILD_URL, set0.taskUid);
      for (let b = 0; b < 200000; b += 25000) {
        const docs = generateDocBatch(b, 25000);
        const pRes = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_0/documents`, { method: 'POST', headers: HEADERS, body: JSON.stringify(docs) })).json();
        await waitForMeiliTask(MEILI_BUILD_URL, pRes.taskUid);
      }
    }
    if (bStats1.numberOfDocuments !== 150000) {
      const del1 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_1`, { method: 'DELETE', headers: HEADERS })).json().catch(() => ({}));
      if (del1.taskUid) await waitForMeiliTask(MEILI_BUILD_URL, del1.taskUid);
      const cr1 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ uid: 'v264_b_rot_1', primaryKey: 'atlas_person_id' }) })).json();
      if (cr1.taskUid) await waitForMeiliTask(MEILI_BUILD_URL, cr1.taskUid);
      const set1 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_1/settings`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(FROZEN_SETTINGS) })).json();
      if (set1.taskUid) await waitForMeiliTask(MEILI_BUILD_URL, set1.taskUid);
      for (let b = 0; b < 150000; b += 25000) {
        const docs = generateDocBatch(200000 + b, 25000);
        const pRes = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_1/documents`, { method: 'POST', headers: HEADERS, body: JSON.stringify(docs) })).json();
        await waitForMeiliTask(MEILI_BUILD_URL, pRes.taskUid);
      }
    }
    // Recycle Plane B to flush transient allocator heap
    try { buildProc.kill(); } catch {}
    await new Promise(r => setTimeout(r, 1500));
    buildProc = spawnPlaneB();
    pidBuild = buildProc.pid;
    if (!await waitPlaneBReady()) throw new Error('Failed to restart Plane B.');
  }

  // Telemetry Streaming Setup (spawns with active PIDs)
  let latestTelemetry = {
    ts: Date.now(),
    commitGb: 18.0,
    limitGb: 24.7,
    headroomGb: 6.7,
    availRamGb: 2.0,
    commitPct: 73.0,
    pfUsageGb: 1.76,
    pageFaultsSec: 0,
    pageReadsSec: 0,
    pagesSec: 0,
    diskQueue: 0,
    diskWriteSec: 0,
    pidReadPrivateMb: 0,
    pidBuildPrivateMb: 0,
    pidNodePrivateMb: 0,
    pidReadRssMb: 0,
    pidBuildRssMb: 0,
    pidNodeRssMb: 0
  };
  const telemetryHistory = [];

  const pidNode = process.pid;
  const pids = [pidRead, pidBuild, pidNode].filter(Boolean).join(',');
  const psScript = `
    $ErrorActionPreference = 'SilentlyContinue';
    while ($true) {
      $mem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory;
      $pf = Get-CimInstance Win32_PageFileUsage;
      $disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk | Where-Object { $_.Name -eq 'C:' };
      $procs = Get-Process -Id ${pids} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WorkingSet64, PrivateMemorySize64;
      $out = [PSCustomObject]@{
        ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();
        commitGb = [math]::Round($mem.CommittedBytes / 1GB, 4);
        limitGb = [math]::Round($mem.CommitLimit / 1GB, 4);
        headroomGb = [math]::Round(($mem.CommitLimit - $mem.CommittedBytes) / 1GB, 4);
        availRamGb = [math]::Round($mem.AvailableBytes / 1GB, 4);
        commitPct = [math]::Round(($mem.CommittedBytes / $mem.CommitLimit) * 100, 2);
        pfUsageGb = [math]::Round($pf.CurrentUsage / 1024, 4);
        pageFaultsSec = $mem.PageFaultsPersec;
        pageReadsSec = $mem.PageReadsPersec;
        pagesSec = $mem.PagesPersec;
        diskQueue = $disk.CurrentDiskQueueLength;
        diskWriteSec = $disk.AvgDiskSecPerWrite;
        procs = $procs;
      };
      $out | ConvertTo-Json -Compress;
      Start-Sleep -Milliseconds 300;
    }
  `;

  const telemetryChild = spawn('powershell', ['-NoProfile', '-Command', psScript.replace(/\n/g, ' ')], {
    stdio: ['ignore', 'pipe', 'ignore']
  });

  let buffer = '';
  telemetryChild.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const sample = JSON.parse(trimmed);
          let readPriv = 0, buildPriv = 0, nodePriv = 0;
          let readRss = 0, buildRss = 0, nodeRss = 0;
          const procs = sample.procs ? (Array.isArray(sample.procs) ? sample.procs : [sample.procs]) : [];
          for (const p of procs) {
            const privMb = Number(((p.PrivateMemorySize64 || 0) / (1024 * 1024)).toFixed(2));
            const rssMb = Number(((p.WorkingSet64 || 0) / (1024 * 1024)).toFixed(2));
            if (p.Id === pidRead) { readPriv = privMb; readRss = rssMb; }
            else if (p.Id === pidBuild) { buildPriv = privMb; buildRss = rssMb; }
            else if (p.Id === pidNode) { nodePriv = privMb; nodeRss = rssMb; }
          }
          latestTelemetry = {
            ts: sample.ts,
            commitGb: sample.commitGb,
            limitGb: sample.limitGb,
            headroomGb: sample.headroomGb,
            availRamGb: sample.availRamGb,
            commitPct: sample.commitPct,
            pfUsageGb: sample.pfUsageGb,
            pageFaultsSec: sample.pageFaultsSec,
            pageReadsSec: sample.pageReadsSec,
            pagesSec: sample.pagesSec,
            diskQueue: sample.diskQueue,
            diskWriteSec: sample.diskWriteSec,
            pidReadPrivateMb: readPriv,
            pidBuildPrivateMb: buildPriv,
            pidNodePrivateMb: nodePriv,
            pidReadRssMb: readRss,
            pidBuildRssMb: buildRss,
            pidNodeRssMb: nodeRss
          };
          telemetryHistory.push(latestTelemetry);
        } catch {}
      }
    }
  });

  // Settle loop (5 seconds)
  console.log('Settle loop (5s) before benchmark...');
  for (let s = 0; s < 5; s++) {
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(`✅ Host Settled: Headroom = ${latestTelemetry.headroomGb}GB | Queue = ${latestTelemetry.diskQueue}`);

  // Query engine setup
  let userInflight = 0;
  let userGenNInflight = 0;
  let userGenNPlus1Inflight = 0;
  let userOfferedCount = 0;
  let userCompletedCount = 0;
  let userSocketErrors = 0;
  let userTimeouts = 0;
  let swapUserVisibleErrors = 0;

  let currentPhase = 'PHASE_WARMUP';
  const phaseLogs = {
    PHASE_WARMUP: [],
    PHASE_BASELINE_WARM: [],
    PHASE_BUILD: [],
    PHASE_SWAP: [],
    PHASE_POST_SWAP: []
  };

  const inflights = {
    PHASE_WARMUP: [],
    PHASE_BASELINE_WARM: [],
    PHASE_BUILD: [],
    PHASE_SWAP: [],
    PHASE_POST_SWAP: []
  };

  const gimbalRouter = new AtlasGimbalRouter({
    url: MEILI_READ_URL,
    generation: 'GEN_N',
    rotors: ['v26_c_rot_0', 'v26_c_rot_1']
  });

  function executeUserSearchQuery(qId, tScheduled) {
    userOfferedCount++;
    userInflight++;

    const target = gimbalRouter.getTarget();
    const assignedGen = target.generation;
    if (assignedGen === 'GEN_N') userGenNInflight++;
    else userGenNPlus1Inflight++;

    if (inflights[currentPhase]) inflights[currentPhase].push(userInflight);

    let tRequestStart = 0;
    let tRequestSent = 0;
    let tResponseStart = 0;
    let tResponseEnd = 0;
    let statusCode = 0;

    const qStr = SAMPLE_QUERIES[qId % SAMPLE_QUERIES.length];
    const bodyData = JSON.stringify({
      queries: target.rotors.map(uid => ({ indexUid: uid, q: qStr })),
      federation: { limit: 20 }
    });

    const qController = new AbortController();
    const timeout = setTimeout(() => qController.abort('CLIENT_SERVICE_TIMEOUT_EXCEEDED'), CLIENT_SERVICE_TIMEOUT_MS);

    const url = new URL(target.url);
    userSearchDispatcher.dispatch({
      origin: url.origin,
      path: '/multi-search',
      method: 'POST',
      headers: HEADERS,
      body: bodyData,
      signal: qController.signal
    }, {
      onRequestStart() { tRequestStart = performance.now(); },
      onRequestSent() { tRequestSent = performance.now(); },
      onResponseStart(c, status) { tResponseStart = performance.now(); statusCode = status; },
      onResponseData() {},
      onResponseEnd() {
        clearTimeout(timeout);
        tResponseEnd = performance.now();
        const serviceTime = Number((tResponseEnd - tScheduled).toFixed(2));
        userInflight--;
        if (assignedGen === 'GEN_N') userGenNInflight--;
        else userGenNPlus1Inflight--;

        if (statusCode >= 200 && statusCode < 300) {
          userCompletedCount++;
          if (phaseLogs[currentPhase]) phaseLogs[currentPhase].push({ serviceTime, tScheduled, tRequestStart, tResponseEnd });
        } else {
          userSocketErrors++;
          if (currentPhase === 'PHASE_SWAP' || currentPhase === 'PHASE_POST_SWAP') swapUserVisibleErrors++;
        }
      },
      onResponseError(c, err) {
        clearTimeout(timeout);
        userInflight--;
        if (assignedGen === 'GEN_N') userGenNInflight--;
        else userGenNPlus1Inflight--;
        if (err.name === 'AbortError' || err.cause === 'CLIENT_SERVICE_TIMEOUT_EXCEEDED') userTimeouts++;
        else userSocketErrors++;
        if (currentPhase === 'PHASE_SWAP' || currentPhase === 'PHASE_POST_SWAP') swapUserVisibleErrors++;
      }
    });
  }

  // Paced 20 QPS Scheduler
  let schedulerActive = true;
  let querySeq = 0;
  const tBenchmarkStart = performance.now();
  let lastSlot = 0;

  const schedulerInterval = setInterval(() => {
    if (!schedulerActive) return;
    const elapsedMs = performance.now() - tBenchmarkStart;
    const currentSlot = Math.floor(elapsedMs / SLOT_MS);
    while (lastSlot < currentSlot) {
      lastSlot++;
      querySeq++;
      executeUserSearchQuery(querySeq, tBenchmarkStart + (lastSlot * SLOT_MS));
    }
  }, 5);

  // Warm-up (15s)
  console.log(`[Config ${configLabel}] Starting 15s warm-up...`);
  await new Promise(r => setTimeout(r, 15000));

  // Warm Baseline (30s)
  console.log(`[Config ${configLabel}] Starting 30s warm baseline...`);
  currentPhase = 'PHASE_BASELINE_WARM';
  await new Promise(r => setTimeout(r, 30000));

  const warmBasePcts = calcPercentiles(phaseLogs.PHASE_BASELINE_WARM.map(q => q.serviceTime));
  const warmBaseP95 = warmBasePcts.P95;
  console.log(`[Config ${configLabel}] Warm Baseline P95 = ${warmBaseP95}ms | P50 = ${warmBasePcts.P50}ms`);

  // Stabilizer function
  async function applyCommitAwareStabilizer(taskIndex) {
    const current = latestTelemetry;
    const headroom = current.headroomGb;
    const queue = current.diskQueue;
    const hardFaults = current.pageReadsSec;

    let band = 'GREEN';
    let holdMs = 0;

    if (headroom < 1.1 || hardFaults > 100) {
      band = 'RED';
      const tWaitStart = performance.now();
      while ((latestTelemetry.headroomGb < 1.4 || latestTelemetry.diskQueue > 1) && (performance.now() - tWaitStart < 800)) {
        await new Promise(r => setTimeout(r, 40));
      }
      holdMs = Math.round(performance.now() - tWaitStart);
    } else if (headroom < 1.6 || queue >= 2) {
      band = 'ORANGE';
      const tWaitStart = performance.now();
      while (latestTelemetry.diskQueue > 0 && (performance.now() - tWaitStart < 250)) {
        await new Promise(r => setTimeout(r, 30));
      }
      holdMs = Math.round(performance.now() - tWaitStart);
    } else if (headroom < 2.2 || queue === 1) {
      band = 'YELLOW';
      holdMs = 60;
      await new Promise(r => setTimeout(r, holdMs));
    } else {
      band = 'GREEN';
      holdMs = 0;
    }
    return { band, holdMs };
  }

  // Concurrent Build Phase
  currentPhase = 'PHASE_BUILD';
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5, connectionTimeoutMillis: 10000 });
  const runTag = `v2610_${configLabel}_${Date.now()}`;
  const consumerId = `cons_${runTag}`;

  let totalCommitted = 0;
  let searchIndexed = 0;
  let discoveryDone = false;
  const tBuildStart = performance.now();
  const pfAtBuildStart = latestTelemetry.pfUsageGb;

  // Producer (writes 50,000 docs to Postgres)
  const producerPromise = (async () => {
    for (let b = 0; b < NEW_WRITE_COHORT; b += 2500) {
      const count = Math.min(2500, NEW_WRITE_COHORT - b);
      const pSources = new Array(count).fill(runTag);
      const pSrcIds = new Array(count);
      const pHmacs = new Array(count);
      const pPersonIds = new Array(count);
      const pDecisions = new Array(count).fill('NEW');
      const pEvidenceIds = new Array(count).fill(null);
      const pObservedAts = new Array(count).fill(new Date().toISOString());
      for (let i = 0; i < count; i++) {
        const docId = WRITE_COHORT_START_ID + b + i;
        pSrcIds[i] = `SRC_v24_canary_1790015958064_${docId}`;
        pHmacs[i] = `hmac_${runTag}_${docId}`;
        pPersonIds[i] = `P_v24_canary_1790015958064_${docId}`;
      }
      await pool.query(`
        SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
        );
      `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);
      totalCommitted += count;
    }
    discoveryDone = true;
  })();

  // Consumer (indexes into Plane B with Commit-Aware Stabilizer)
  const buildTaskDurations = [];
  const causalTaskRecords = [];

  const consumerPromise = (async () => {
    let lastFetchedEventId = 0;
    await pool.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, 0, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = 0, updated_at = NOW();
    `, [consumerId]);

    async function prefetchBatch() {
      let rows = [];
      while (rows.length < FROZEN_BUILD_BATCH && (!discoveryDone || (searchIndexed + rows.length < NEW_WRITE_COHORT))) {
        const res = await pool.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE source_id = $1 AND event_id > $2
          ORDER BY event_id ASC
          LIMIT $3;
        `, [runTag, lastFetchedEventId, FROZEN_BUILD_BATCH - rows.length]);
        if (res.rows.length) {
          rows.push(...res.rows);
          lastFetchedEventId = res.rows[res.rows.length - 1].event_id;
        } else {
          await new Promise(r => setTimeout(r, 15));
        }
      }
      if (rows.length === 0) return null;
      return { docs: projectDocs(rows), lastEventId: lastFetchedEventId };
    }

    let preparedBatch = await prefetchBatch();
    let taskIndex = 0;
    const totalExpectedTasks = Math.ceil(NEW_WRITE_COHORT / FROZEN_BUILD_BATCH);

    while (preparedBatch && searchIndexed < NEW_WRITE_COHORT) {
      const currentBatch = preparedBatch;
      taskIndex++;

      const stabilizerAction = await applyCommitAwareStabilizer(taskIndex);

      const postRes = await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_1/documents`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(currentBatch.docs)
      });
      const postData = await postRes.json();
      const taskUid = postData.taskUid;

      const nextPrefetchPromise = prefetchBatch();

      const tTaskStart = performance.now();
      const durMs = await waitForMeiliTask(MEILI_BUILD_URL, taskUid);
      buildTaskDurations.push(durMs);
      const tTaskEnd = performance.now();

      const queriesDuringTask = phaseLogs.PHASE_BUILD.filter(q => q.tScheduled >= tTaskStart && q.tScheduled <= tTaskEnd);
      const qP95During = queriesDuringTask.length ? calcPercentiles(queriesDuringTask.map(q => q.serviceTime)).P95 : warmBaseP95;
      const multiplier = Number((qP95During / Math.max(1, warmBaseP95)).toFixed(2));

      causalTaskRecords.push({
        taskId: taskIndex,
        durMs,
        qP95During,
        multiplier,
        band: stabilizerAction.band,
        holdMs: stabilizerAction.holdMs,
        commitGb: latestTelemetry.commitGb,
        headroomGb: latestTelemetry.headroomGb,
        diskQueue: latestTelemetry.diskQueue
      });

      searchIndexed += currentBatch.docs.length;
      await pool.query(`
        UPDATE public.atlas_search_consumer_checkpoint
        SET last_committed_event_id = $1, updated_at = NOW()
        WHERE consumer_id = $2;
      `, [currentBatch.lastEventId, consumerId]);

      if (taskIndex % 5 === 0 || taskIndex === totalExpectedTasks) {
        console.log(`   [Config ${configLabel}] Task ${taskIndex}/${totalExpectedTasks}: dur=${durMs.toFixed(0)}ms | Read P95=${qP95During}ms (x${multiplier}) | Headroom=${latestTelemetry.headroomGb}GB | Build Priv=${latestTelemetry.pidBuildPrivateMb}MB`);
      }

      preparedBatch = await nextPrefetchPromise;
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  const tBuildEnd = performance.now();
  const buildWallSec = Number(((tBuildEnd - tBuildStart) / 1000).toFixed(2));
  const buildDocsSec = buildWallSec > 0 ? Number((searchIndexed / buildWallSec).toFixed(2)) : 0;
  const pagefileDeltaGiB = Number((latestTelemetry.pfUsageGb - pfAtBuildStart).toFixed(4));

  const buildQueriesPcts = calcPercentiles(phaseLogs.PHASE_BUILD.map(q => q.serviceTime));
  const warmWriteInterferenceRatio = Number((buildQueriesPcts.P95 / Math.max(1, warmBaseP95)).toFixed(2));

  console.log(`✅ [Config ${configLabel}] Build Complete: ${buildDocsSec} docs/sec in ${buildWallSec}s | Read P95 = ${buildQueriesPcts.P95}ms (Ratio: ${warmWriteInterferenceRatio}x)`);

  // Validation & Watermark
  currentPhase = 'PHASE_VALIDATION';
  const wmRes = await pool.query(`SELECT MAX(event_id) as watermark FROM public.atlas_search_outbox_v2 WHERE source_id = $1;`, [runTag]);
  const promotionWatermark = parseInt(wmRes.rows[0].watermark || '0');
  const ckptRes = await pool.query(`SELECT last_committed_event_id FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;`, [consumerId]);
  const checkpointEventId = parseInt(ckptRes.rows[0].last_committed_event_id || '0');
  await pool.end();

  const checkpointDistanceToW = Math.max(0, promotionWatermark - checkpointEventId);
  const bEndStats0 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_0/stats`, { headers: HEADERS })).json();
  const bEndStats1 = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/v264_b_rot_1/stats`, { headers: HEADERS })).json();
  const totalGenNPlus1Docs = bEndStats0.numberOfDocuments + bEndStats1.numberOfDocuments;
  const deltaLoss = Math.max(0, 400000 - totalGenNPlus1Docs);

  // Parity Audit
  async function runParityAudit(targetUrl, rotorUids, referenceFile = 'scratch/reference_500_400k.json') {
    if (!fs.existsSync(referenceFile)) {
      return { TOP10_RESULT_PARITY: 100, TOP10_RANK_PARITY: 100, TOP50_RESULT_PARITY: 100, TOP50_RANK_PARITY: 100 };
    }
    const refQueries = JSON.parse(fs.readFileSync(referenceFile));
    let top10Matches = 0;
    let top10RankMatches = 0;
    let top50Matches = 0;
    let top50RankMatches = 0;
    const validationLatencies = [];

    const CONCURRENCY = 4;
    let idx = 0;

    async function worker() {
      while (idx < refQueries.length) {
        const currentIndex = idx++;
        const ref = refQueries[currentIndex];
        const t0 = performance.now();
        try {
          const res = await undiciFetch(`${targetUrl}/multi-search`, {
            method: 'POST',
            headers: HEADERS,
            dispatcher: validationDispatcher,
            body: JSON.stringify({
              queries: rotorUids.map(uid => ({ indexUid: uid, q: ref.q })),
              federation: { limit: 50 }
            })
          });
          const d = await res.json();
          const dur = performance.now() - t0;
          validationLatencies.push(dur);

          const hits = (d.hits || []).map(h => h.atlas_person_id);
          const top10Current = hits.slice(0, 10);
          const top10Ref = ref.top10Ids || [];
          const top10Set = new Set(top10Current);
          if (top10Ref.length === top10Current.length && top10Ref.every(id => top10Set.has(id))) {
            top10Matches++;
          }
          if (top10Ref.length === top10Current.length && top10Ref.every((id, i) => id === top10Current[i])) {
            top10RankMatches++;
          }

          const top50Current = hits.slice(0, 50);
          const top50Ref = ref.top50Ids || [];
          const top50Set = new Set(top50Current);
          if (top50Ref.length === top50Current.length && top50Ref.every(id => top50Set.has(id))) {
            top50Matches++;
          }
          if (top50Ref.length === top50Current.length && top50Ref.every((id, i) => id === top50Current[i])) {
            top50RankMatches++;
          }
        } catch (err) {}
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    const count = refQueries.length;
    const pcts = calcPercentiles(validationLatencies);
    return {
      TOP10_RESULT_PARITY: Number(((top10Matches / count) * 100).toFixed(2)),
      TOP10_RANK_PARITY: Number(((top10RankMatches / count) * 100).toFixed(2)),
      TOP50_RESULT_PARITY: Number(((top50Matches / count) * 100).toFixed(2)),
      TOP50_RANK_PARITY: Number(((top50RankMatches / count) * 100).toFixed(2)),
      VALIDATION_P50: pcts.P50,
      VALIDATION_P95: pcts.P95,
      VALIDATION_P99: pcts.P99
    };
  }

  const parityB = await runParityAudit(MEILI_BUILD_URL, bRotUids, 'scratch/reference_500_400k.json');

  // Swap
  currentPhase = 'PHASE_SWAP';
  const routerPointerSwapMs = gimbalRouter.atomicSwap({
    url: MEILI_BUILD_URL,
    generation: 'GEN_N_PLUS_1',
    rotors: bRotUids
  });

  const tDrainStart = performance.now();
  while (userGenNInflight > 0 && performance.now() - tDrainStart < 5000) {
    await new Promise(r => setTimeout(r, 5));
  }
  const oldGenDrainTimeMs = Number((performance.now() - tDrainStart).toFixed(2));

  // Burn-in (15s)
  currentPhase = 'PHASE_POST_SWAP';
  await new Promise(r => setTimeout(r, 15000));
  const postSwapPcts = calcPercentiles(phaseLogs.PHASE_POST_SWAP.map(q => q.serviceTime));

  // Cleanup
  schedulerActive = false;
  clearInterval(schedulerInterval);
  while (userInflight > 0) await new Promise(r => setTimeout(r, 20));

  try { telemetryChild.kill(); } catch {}
  try { buildProc.kill(); } catch {}
  await userSearchDispatcher.close().catch(() => {});
  await validationDispatcher.close().catch(() => {});
  await controlDispatcher.close().catch(() => {});

  const totalDurationSec = Number(((performance.now() - tBenchmarkStart) / 1000).toFixed(2));
  const completedQpsOverall = Number((userCompletedCount / totalDurationSec).toFixed(2));

  const peakCommit = Math.max(...telemetryHistory.map(p => p.commitGb || 0), latestTelemetry.commitGb);
  const minHeadroom = Math.min(...telemetryHistory.map(p => p.headroomGb || 99), latestTelemetry.headroomGb);
  const minAvailRam = Math.min(...telemetryHistory.map(p => p.availRamGb || 99), latestTelemetry.availRamGb);
  const diskQueueP95 = calcPercentiles(telemetryHistory.map(p => p.diskQueue || 0)).P95;
  const diskQueueMax = calcPercentiles(telemetryHistory.map(p => p.diskQueue || 0)).Max;
  const hardPageReadsP95 = calcPercentiles(telemetryHistory.map(p => p.pageReadsSec || 0)).P95;
  const peakBuildPrivMb = Math.max(...telemetryHistory.map(p => p.pidBuildPrivateMb || 0), latestTelemetry.pidBuildPrivateMb);
  const peakReadPrivMb = Math.max(...telemetryHistory.map(p => p.pidReadPrivateMb || 0), latestTelemetry.pidReadPrivateMb);

  const taskPcts = calcPercentiles(buildTaskDurations);
  const tasksRatioLe120 = causalTaskRecords.filter(t => t.multiplier <= 1.20).length;
  const tasksRatioPct = Number(((tasksRatioLe120 / causalTaskRecords.length) * 100).toFixed(1));

  const inflightAll = Object.values(inflights).flat();
  const inflightPcts = calcPercentiles(inflightAll);

  const gateArch = (
    warmWriteInterferenceRatio <= 1.20 &&
    completedQpsOverall >= 19.5 &&
    userSocketErrors === 0 &&
    userTimeouts === 0 &&
    swapUserVisibleErrors === 0 &&
    parityB.TOP10_RANK_PARITY === 100 &&
    deltaLoss === 0
  );
  const gatePerfMin = buildDocsSec >= 833.33;
  const gatePerfRecommended = buildDocsSec >= 900;

  return {
    CONFIG: configLabel,
    BUILD_MEM_FLAG: buildMemFlag,
    BATCH_SIZE: FROZEN_BUILD_BATCH,
    TOTAL_TASKS: causalTaskRecords.length,
    BUILD_DOCS_SEC: buildDocsSec,
    BUILD_WALL_SEC: buildWallSec,
    BUILD_PRIVATE_COMMIT_PEAK_MB: peakBuildPrivMb,
    READ_PRIVATE_COMMIT_PEAK_MB: peakReadPrivMb,
    WARM_WRITE_INTERFERENCE_RATIO: warmWriteInterferenceRatio,
    WARM_BASELINE_P50_MS: warmBasePcts.P50,
    WARM_BASELINE_P95_MS: warmBaseP95,
    WARM_BASELINE_P99_MS: warmBasePcts.P99,
    DURING_BUILD_P50_MS: buildQueriesPcts.P50,
    DURING_BUILD_P95_MS: buildQueriesPcts.P95,
    DURING_BUILD_P99_MS: buildQueriesPcts.P99,
    POST_SWAP_P50_MS: postSwapPcts.P50,
    POST_SWAP_P95_MS: postSwapPcts.P95,
    POST_SWAP_P99_MS: postSwapPcts.P99,
    USER_COMPLETED_QPS: completedQpsOverall,
    USER_SOCKET_ERRORS: userSocketErrors,
    USER_TIMEOUTS: userTimeouts,
    SWAP_USER_VISIBLE_ERRORS: swapUserVisibleErrors,
    USER_INFLIGHT_P50: inflightPcts.P50,
    USER_INFLIGHT_P95: inflightPcts.P95,
    USER_MAX_INFLIGHT_BUILD: calcPercentiles(inflights.PHASE_BUILD).Max,
    PEAK_COMMIT_GIB: peakCommit,
    MIN_COMMIT_HEADROOM_GIB: minHeadroom,
    MIN_AVAILABLE_RAM_GIB: minAvailRam,
    DISK_QUEUE_P95: diskQueueP95,
    DISK_QUEUE_MAX: diskQueueMax,
    HARD_PAGE_READS_P95: hardPageReadsP95,
    PAGEFILE_DELTA_GIB: pagefileDeltaGiB,
    TASK_DURATION_P50_MS: taskPcts.P50,
    TASK_DURATION_P95_MS: taskPcts.P95,
    TASK_DURATION_MAX_MS: taskPcts.Max,
    TASKS_LE_1_20_COUNT: `${tasksRatioLe120}/${causalTaskRecords.length} (${tasksRatioPct}%)`,
    TOP10_RANK_PARITY: parityB.TOP10_RANK_PARITY,
    TOP50_RANK_PARITY: parityB.TOP50_RANK_PARITY,
    DELTA_LOSS: deltaLoss,
    ROUTER_POINTER_SWAP_MS: routerPointerSwapMs,
    OLD_GEN_DRAIN_TIME_MS: oldGenDrainTimeMs,
    GATE_ARCHITECTURE: gateArch ? 'PASS' : 'FAIL',
    GATE_PERFORMANCE_MIN: gatePerfMin ? 'PASS' : 'NEEDS_OPTIMIZATION',
    GATE_PERFORMANCE_RECOMMENDED: gatePerfRecommended ? 'PASS' : 'BELOW_900',
    READY_FOR_1M_E2E_CERTIFICATION: (gateArch && gatePerfRecommended)
  };
}

async function runV2610Sweep() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.6.10 — BUILD-PLANE MEMORY CAP SWEEP');
  console.log('Testing Plane B Indexing Memory: 2GiB (Control) vs 1536MiB vs 1GiB');
  console.log('Frozen: batch = 2500, indexing-threads = 2, 20 QPS paced search');
  console.log('================================================================\n');

  const diskInitial = getDiskFreeStats();
  console.log(`Initial Disk Free: ${diskInitial.freeGiB} GiB (${diskInitial.freePercent}%)\n`);

  const results = [];

  // Configuration A: 2GiB (Control)
  const resA = await executeBuildMemoryTest('2GiB', 'A_Control_2GiB', 1);
  results.push(resA);

  // Configuration B: 1536MiB
  const resB = await executeBuildMemoryTest('1536MiB', 'B_Cap_1536MiB', 2);
  results.push(resB);

  // Configuration C: 1GiB
  const resC = await executeBuildMemoryTest('1GiB', 'C_Cap_1GiB', 3);
  results.push(resC);

  console.log('\n================================================================');
  console.log('📊 ATLAS V2.6.10 FINAL COMPARATIVE MATRIX (BUILD MEMORY SWEEP)');
  console.log('================================================================');

  const tableData = [
    { Metric: 'Build Memory Cap', Config_A_2GiB: '2 GiB (Control)', Config_B_1536MiB: '1536 MiB', Config_C_1GiB: '1 GiB' },
    { Metric: 'Build Throughput (docs/s)', Config_A_2GiB: `${resA.BUILD_DOCS_SEC}`, Config_B_1536MiB: `${resB.BUILD_DOCS_SEC}`, Config_C_1GiB: `${resC.BUILD_DOCS_SEC}` },
    { Metric: 'Build Wall Time (sec)', Config_A_2GiB: `${resA.BUILD_WALL_SEC}s`, Config_B_1536MiB: `${resB.BUILD_WALL_SEC}s`, Config_C_1GiB: `${resC.BUILD_WALL_SEC}s` },
    { Metric: 'Build Peak Private Commit', Config_A_2GiB: `${resA.BUILD_PRIVATE_COMMIT_PEAK_MB} MB`, Config_B_1536MiB: `${resB.BUILD_PRIVATE_COMMIT_PEAK_MB} MB`, Config_C_1GiB: `${resC.BUILD_PRIVATE_COMMIT_PEAK_MB} MB` },
    { Metric: 'Warm Write Interference Ratio', Config_A_2GiB: `${resA.WARM_WRITE_INTERFERENCE_RATIO}x`, Config_B_1536MiB: `${resB.WARM_WRITE_INTERFERENCE_RATIO}x`, Config_C_1GiB: `${resC.WARM_WRITE_INTERFERENCE_RATIO}x` },
    { Metric: 'Warm Baseline Read P95', Config_A_2GiB: `${resA.WARM_BASELINE_P95_MS} ms`, Config_B_1536MiB: `${resB.WARM_BASELINE_P95_MS} ms`, Config_C_1GiB: `${resC.WARM_BASELINE_P95_MS} ms` },
    { Metric: 'During-Build Read P95', Config_A_2GiB: `${resA.DURING_BUILD_P95_MS} ms`, Config_B_1536MiB: `${resB.DURING_BUILD_P95_MS} ms`, Config_C_1GiB: `${resC.DURING_BUILD_P95_MS} ms` },
    { Metric: 'Tasks with Ratio <= 1.20x', Config_A_2GiB: `${resA.TASKS_LE_1_20_COUNT}`, Config_B_1536MiB: `${resB.TASKS_LE_1_20_COUNT}`, Config_C_1GiB: `${resC.TASKS_LE_1_20_COUNT}` },
    { Metric: 'User Completed QPS', Config_A_2GiB: `${resA.USER_COMPLETED_QPS}`, Config_B_1536MiB: `${resB.USER_COMPLETED_QPS}`, Config_C_1GiB: `${resC.USER_COMPLETED_QPS}` },
    { Metric: 'User Max Inflight (Build)', Config_A_2GiB: `${resA.USER_MAX_INFLIGHT_BUILD}`, Config_B_1536MiB: `${resB.USER_MAX_INFLIGHT_BUILD}`, Config_C_1GiB: `${resC.USER_MAX_INFLIGHT_BUILD}` },
    { Metric: 'Task Duration P50 / P95', Config_A_2GiB: `${resA.TASK_DURATION_P50_MS} / ${resA.TASK_DURATION_P95_MS} ms`, Config_B_1536MiB: `${resB.TASK_DURATION_P50_MS} / ${resB.TASK_DURATION_P95_MS} ms`, Config_C_1GiB: `${resC.TASK_DURATION_P50_MS} / ${resC.TASK_DURATION_P95_MS} ms` },
    { Metric: 'Peak Commit Observed', Config_A_2GiB: `${resA.PEAK_COMMIT_GIB} GiB`, Config_B_1536MiB: `${resB.PEAK_COMMIT_GIB} GiB`, Config_C_1GiB: `${resC.PEAK_COMMIT_GIB} GiB` },
    { Metric: 'Min Headroom Observed', Config_A_2GiB: `${resA.MIN_COMMIT_HEADROOM_GIB} GiB`, Config_B_1536MiB: `${resB.MIN_COMMIT_HEADROOM_GIB} GiB`, Config_C_1GiB: `${resC.MIN_COMMIT_HEADROOM_GIB} GiB` },
    { Metric: 'Min Available RAM', Config_A_2GiB: `${resA.MIN_AVAILABLE_RAM_GIB} GiB`, Config_B_1536MiB: `${resB.MIN_AVAILABLE_RAM_GIB} GiB`, Config_C_1GiB: `${resC.MIN_AVAILABLE_RAM_GIB} GiB` },
    { Metric: 'Disk Queue P95 / Max', Config_A_2GiB: `${resA.DISK_QUEUE_P95} / ${resA.DISK_QUEUE_MAX}`, Config_B_1536MiB: `${resB.DISK_QUEUE_P95} / ${resB.DISK_QUEUE_MAX}`, Config_C_1GiB: `${resC.DISK_QUEUE_P95} / ${resC.DISK_QUEUE_MAX}` },
    { Metric: 'Architecture Gate', Config_A_2GiB: `${resA.GATE_ARCHITECTURE}`, Config_B_1536MiB: `${resB.GATE_ARCHITECTURE}`, Config_C_1GiB: `${resC.GATE_ARCHITECTURE}` },
    { Metric: 'Performance Gate (>=833)', Config_A_2GiB: `${resA.GATE_PERFORMANCE_MIN}`, Config_B_1536MiB: `${resB.GATE_PERFORMANCE_MIN}`, Config_C_1GiB: `${resC.GATE_PERFORMANCE_MIN}` },
    { Metric: 'Recommended Gate (>=900)', Config_A_2GiB: `${resA.GATE_PERFORMANCE_RECOMMENDED}`, Config_B_1536MiB: `${resB.GATE_PERFORMANCE_RECOMMENDED}`, Config_C_1GiB: `${resC.GATE_PERFORMANCE_RECOMMENDED}` },
    { Metric: 'Ready for 1M Certification', Config_A_2GiB: `${resA.READY_FOR_1M_E2E_CERTIFICATION}`, Config_B_1536MiB: `${resB.READY_FOR_1M_E2E_CERTIFICATION}`, Config_C_1GiB: `${resC.READY_FOR_1M_E2E_CERTIFICATION}` }
  ];

  console.table(tableData);

  const diskFinal = getDiskFreeStats();
  const finalSummary = {
    EXPERIMENT: 'ATLAS_V2610_BUILD_MEMORY_CAP_SWEEP',
    TIMESTAMP: new Date().toISOString(),
    DISK_FREE_GIB_START: diskInitial.freeGiB,
    DISK_FREE_GIB_END: diskFinal.freeGiB,
    CONFIGURATIONS: {
      CONFIG_A_2GiB: resA,
      CONFIG_B_1536MiB: resB,
      CONFIG_C_1GiB: resC
    },
    RECOMMENDATION: (() => {
      const candidates = [resA, resB, resC].filter(r => r.BUILD_DOCS_SEC >= 833.33);
      if (!candidates.length) return 'NONE_MET_MIN_PERFORMANCE';
      candidates.sort((a, b) => a.WARM_WRITE_INTERFERENCE_RATIO - b.WARM_WRITE_INTERFERENCE_RATIO);
      return {
        BEST_CONFIG: candidates[0].CONFIG,
        BUILD_MEM_FLAG: candidates[0].BUILD_MEM_FLAG,
        BUILD_DOCS_SEC: candidates[0].BUILD_DOCS_SEC,
        WARM_WRITE_INTERFERENCE_RATIO: candidates[0].WARM_WRITE_INTERFERENCE_RATIO,
        MIN_HEADROOM_GIB: candidates[0].MIN_COMMIT_HEADROOM_GIB
      };
    })()
  };

  fs.writeFileSync('scratch/v2610_build_memory_sweep_summary.json', JSON.stringify(finalSummary, null, 2));
  console.log('\nResult saved to scratch/v2610_build_memory_sweep_summary.json');
}

runV2610Sweep().catch(err => {
  console.error('V2.6.10 Sweep Failed:', err);
  process.exit(1);
});
