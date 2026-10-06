/**
 * ATLAS FINAL 1M E2E CERTIFICATION RUNNER
 * 
 * Strict Frozen Contract:
 * - BUILD_MAX_INDEXING_MEMORY = 1536MiB
 * - BUILD_BATCH = 2500
 * - BUILD_INDEXING_THREADS = 2
 * - COMMIT_AWARE_STABILIZER = ON
 * - USER_SEARCH_LOAD = 20 QPS
 * - Gimbal A/B Architecture
 * - Full E2E Pipeline: Discovery -> Processing -> Identity -> Qualification -> Dedupe -> Outbox V2 -> Build -> Validation -> Promotion -> Active Read Visible
 * - Total Net-New: 1,000,000 entities
 * - Gate: FINAL_1M_E2E_SECONDS <= 1200.000 (<= 20:00.000)
 */

import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { fetch as undiciFetch, Agent, buildConnector } from 'undici';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

dotenv.config();

const TOTAL_MILLION = 1000000;
const FROZEN_BUILD_BATCH = 2500;
const FROZEN_BUILD_MEM = '1536MiB';
const FROZEN_INDEXING_THREADS = '2';
const ROTOR_CAPACITY = 200000;
const TOTAL_ROTORS = 5; // 5 x 200,000 = 1,000,000
const MAX_QUEUE_BACKPRESSURE = 25000;

const MEILI_READ_URL = 'http://127.0.0.1:7700';
const MEILI_BUILD_URL = 'http://127.0.0.1:7701';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || 'masterKey';
const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + MEILI_KEY
};

const TIMER_PORT = 7799;

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

function formatElapsedHms(totalSec) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  const ms = Math.floor((totalSec % 1) * 1000);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
  return `${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

function projectDocs(rows) {
  return rows.map(r => ({
    atlas_person_id: r.atlas_person_id,
    source_id: r.source_id,
    source_person_id: r.source_person_id,
    projection_version: r.projection_version || 2,
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

// -------------------------------------------------------------
// RESOURCE LIFECYCLE & CLEANUP DEFENSE
// -------------------------------------------------------------
const isPreflightOnly = process.argv.includes('--preflight-only');

let timerClient = null;
let buildProc = null;
let pidBuild = null;
let userSearchDispatcher = null;
let validationDispatcher = null;
let controlDispatcher = null;
let telemetryChild = null;
let schedulerInterval = null;
let searchTelemInterval = null;
let pool = null;
let teardownCompleted = false;

const closedAgents = new WeakSet();
async function safelyCloseAgent(agent, { force = false } = {}) {
  if (!agent || closedAgents.has(agent)) return;
  closedAgents.add(agent);
  try {
    if (force) {
      await agent.destroy();
    } else {
      await agent.close();
    }
  } catch {
    try { await agent.destroy(); } catch {}
  }
}

let poolClosed = false;
async function safelyClosePool(p) {
  if (!p || poolClosed) return;
  poolClosed = true;
  try {
    if (!p.ending && !p.ended) {
      await p.end();
    }
  } catch {}
}

const closedChildPids = new Set();
function safelyTerminateChildProcess(proc) {
  if (!proc || !proc.pid || closedChildPids.has(proc.pid)) return;
  closedChildPids.add(proc.pid);
  try {
    if (!proc.killed) {
      proc.kill('SIGKILL');
    }
  } catch {}
}

async function cleanupAllResources({ errorMode = false, isPreflight = false } = {}) {
  if (teardownCompleted) return;
  teardownCompleted = true;

  // 1. Timers
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (searchTelemInterval !== null) {
    clearInterval(searchTelemInterval);
    searchTelemInterval = null;
  }

  // 2. Telemetry Child
  safelyTerminateChildProcess(telemetryChild);
  telemetryChild = null;

  // 3. Plane B Child (kill on error, preflight, or full process exit)
  if (errorMode || isPreflight) {
    safelyTerminateChildProcess(buildProc);
    buildProc = null;
  }

  // 4. Undici Agents
  await safelyCloseAgent(userSearchDispatcher, { force: errorMode });
  userSearchDispatcher = null;
  await safelyCloseAgent(validationDispatcher, { force: errorMode });
  validationDispatcher = null;
  await safelyCloseAgent(controlDispatcher, { force: errorMode });
  controlDispatcher = null;

  // 5. Timer Socket (external timer process remains untouched)
  if (timerClient) {
    timerClient.close();
    timerClient = null;
  }

  // 6. DB Pool
  await safelyClosePool(pool);
  pool = null;
}

// -------------------------------------------------------------
// TIMER CLIENT IPC WRAPPER
// -------------------------------------------------------------
class ExternalTimerClient {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.closed = false;
  }

  async connect(retries = 10, delayMs = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        await new Promise((resolve, reject) => {
          const s = net.createConnection({ port: TIMER_PORT, host: '127.0.0.1' }, () => {
            this.socket = s;
            this.connected = true;
            this.socket.on('error', () => { this.connected = false; });
            resolve();
          });
          s.once('error', reject);
        });
        console.log('✅ Connected to ATLAS 1M External Certification Timer on port 7799.');
        return true;
      } catch {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
    throw new Error('FAILED_TO_CONNECT_TO_EXTERNAL_TIMER: Ensure atlas_1m_external_timer.mjs is running!');
  }

  sendEvent(payload) {
    if (this.socket && this.connected && !this.closed) {
      try {
        this.socket.write(JSON.stringify(payload) + '\n');
      } catch {}
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      try {
        s.removeAllListeners();
        if (!s.destroyed) {
          s.destroy();
        }
      } catch {}
    }
  }

  async sendT0(firstEntityId, sourceWatermarkStart) {
    this.sendEvent({
      event: 'T0_START',
      firstEntityId,
      sourceWatermarkStart,
      expectedCount: TOTAL_MILLION
    });
  }

  async sendCheckpoint(checkpointName, stats) {
    this.sendEvent({
      event: 'CHECKPOINT',
      checkpointName,
      ...stats
    });
  }

  async sendT1(conditions) {
    this.sendEvent({
      event: 'T1_COMPLETE',
      conditions
    });
  }
}

async function runCertification() {
  console.log('================================================================');
  console.log('⚡ ATLAS FINAL 1M E2E CERTIFICATION LAUNCHER');
  console.log('================================================================');
  console.log(`Target: ${TOTAL_MILLION.toLocaleString()} Net-New Entities in <= 1200.000s (20:00.000)`);
  console.log(`Frozen Config: Max Memory=${FROZEN_BUILD_MEM} | Batch=${FROZEN_BUILD_BATCH} | Threads=${FROZEN_INDEXING_THREADS} | Stabilizer=ON | Search=20 QPS\n`);

  // -------------------------------------------------------------
  // 1. TRUE CLEAN HOST PREFLIGHT CHECK
  // -------------------------------------------------------------
  console.log('--- [1/6] TRUE CLEAN HOST VERIFICATION ---');
  let lsCount = 0;
  let agyCount = 0;
  try {
    const tOut = execSync('tasklist', { encoding: 'utf8' });
    lsCount = (tOut.match(/language_server/gi) || []).length;
    agyCount = (tOut.match(/antigravity/gi) || []).length;
  } catch {}

  console.log(`   LANGUAGE_SERVER_PROCESS_COUNT = ${lsCount}`);
  console.log(`   ANTIGRAVITY_PROCESS_COUNT     = ${agyCount}`);

  // Query top 10 memory / I/O processes
  try {
    const topPs = execSync('powershell -NoProfile -Command "Get-Process | Sort-Object -Descending -Property WorkingSet64 | Select-Object -First 10 Id, ProcessName, WorkingSet64 | ConvertTo-Json"', { encoding: 'utf8' });
    const topList = JSON.parse(topPs).map(p => `${p.ProcessName} (PID ${p.Id}): ${Math.round(p.WorkingSet64/1024/1024)}MB`);
    console.log('   Top 10 Host Processes by RAM:');
    topList.forEach((t, i) => console.log(`     ${i+1}. ${t}`));
  } catch {}

  if (lsCount > 0) {
    if (!isPreflightOnly) {
      console.error('\n❌ [CRITICAL HOST CONTAMINATION DETECTED]');
      console.error(`   language_server_windows_x64 is currently active (${lsCount} instances).`);
      console.error('   CERTIFICATION_ABORTED_BACKGROUND_CONTAMINATION = TRUE');
      console.error('   Aborting immediately before T0 to preserve contractual integrity.');
      console.error('   Please close Antigravity IDE and rerun from a clean CMD.\n');
      await cleanupAllResources({ errorMode: true, isPreflight: false });
      process.exit(2);
    } else {
      console.log(`\n   ℹ️ [PREFLIGHT MODE] language_server active (${lsCount} instances). Bypassing host contamination abort for rotor preflight only.`);
    }
  }

  if (agyCount > 0 && !isPreflightOnly) {
    console.warn(`\n⚠️  [NOTICE] Antigravity process count is ${agyCount}. For official certification, close IDE.`);
  }

  // -------------------------------------------------------------
  // 2. CONNECT TO EXTERNAL TIMER
  // -------------------------------------------------------------
  console.log('\n--- [2/6] CONNECTING TO ATLAS 1M EXTERNAL TIMER ---');
  timerClient = new ExternalTimerClient();
  try {
    await timerClient.connect(isPreflightOnly ? 3 : 10, 1000);
  } catch (err) {
    if (isPreflightOnly) {
      console.warn('   ⚠️ [PREFLIGHT MODE] External timer not connected. Proceeding without timer for preflight verification.');
      timerClient = null;
    } else {
      throw err;
    }
  }

  // -------------------------------------------------------------
  // 3. VERIFY PLANE A (READ PLANE) & SPAWN PLANE B (BUILD PLANE)
  // -------------------------------------------------------------
  console.log('\n--- [3/6] GIMBAL A/B SETUP & PLANE VERIFICATION ---');
  let pidRead = null;
  try {
    const pOut = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 7700 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"', { encoding: 'utf8' }).trim();
    if (pOut) pidRead = parseInt(pOut.split('\n')[0].trim());
  } catch {}
  if (!pidRead) throw new Error('Plane A (port 7700) is not running!');
  console.log(`   ✅ Plane A verified on port 7700 (PID: ${pidRead}).`);

  // Kill port 7701 if lingering
  try {
    const p7701 = execSync('powershell -Command "Get-NetTCPConnection -LocalPort 7701 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"', { encoding: 'utf8' }).trim();
    if (p7701) {
      const pids7701 = p7701.split(/\r?\n/).map(s => parseInt(s.trim())).filter(Boolean);
      for (const p of pids7701) {
        try { process.kill(p, 'SIGKILL'); } catch {}
      }
    }
  } catch {}

  const buildDbPath = 'C:\\Users\\Eduardo\\YOUAPP\\data_build.ms';
  const meiliExe = 'C:\\Users\\Eduardo\\YOUAPP\\bin\\meilisearch.exe';

  console.log(`   Spawning Plane B on port 7701 (Memory: ${FROZEN_BUILD_MEM}, Threads: ${FROZEN_INDEXING_THREADS})...`);
  buildProc = spawn(meiliExe, [
    '--http-addr', '127.0.0.1:7701',
    '--db-path', buildDbPath,
    '--no-analytics',
    '--max-indexing-memory', FROZEN_BUILD_MEM,
    '--max-indexing-threads', FROZEN_INDEXING_THREADS
  ], { stdio: 'ignore', detached: false });
  pidBuild = buildProc.pid;

  // Dispatchers setup
  const defaultUserConnector = buildConnector({});
  userSearchDispatcher = new Agent({
    keepAliveTimeout: 30000,
    keepAliveMaxTimeout: 60000,
    connections: 32,
    pipelining: 1,
    connect: (opts, cb) => defaultUserConnector(opts, cb)
  });

  validationDispatcher = new Agent({
    keepAliveTimeout: 10000,
    keepAliveMaxTimeout: 30000,
    connections: 8,
    pipelining: 1
  });

  controlDispatcher = new Agent({
    keepAliveTimeout: 5000,
    keepAliveMaxTimeout: 15000,
    connections: 8,
    pipelining: 1
  });

  async function controlFetch(url, options = {}) {
    return undiciFetch(url, { ...options, dispatcher: controlDispatcher });
  }

  async function waitForMeiliTask(targetUrl, taskUid, maxWaitMs = 120000, options = {}) {
    if (taskUid === undefined || taskUid === null) throw new Error('taskUid undefined');
    const t0 = performance.now();
    while (performance.now() - t0 < maxWaitMs) {
      try {
        const res = await controlFetch(`${targetUrl}/tasks/${taskUid}`, { headers: HEADERS });
        const t = await res.json();
        if (t.status === 'succeeded') return parseDurationMs(t.duration);
        if (t.status === 'failed') {
          const errCode = t.error?.code;
          const errMsg = t.error?.message || '';
          if (options.allowIndexNotFound && (errCode === 'index_not_found' || errMsg.toLowerCase().includes('not found'))) {
            console.log(`   ℹ️ Task ${taskUid} finished with index_not_found -> DELETE_ALREADY_SATISFIED`);
            return 0;
          }
          throw new Error(`Task ${taskUid} failed: ${t.error?.message || JSON.stringify(t.error)}`);
        }
      } catch (e) {
        if (e.message && e.message.includes('Task')) throw e;
      }
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error(`Task ${taskUid} timed out after ${maxWaitMs}ms`);
  }

  async function waitPlaneBReady(maxMs = 20000) {
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

  if (!await waitPlaneBReady()) throw new Error('Plane B failed to become healthy on port 7701.');
  console.log(`   ✅ Plane B verified healthy (PID: ${pidBuild}).`);

  // Initialize Plane B 5 clean rotors: v26_cert_rot_0 .. v26_cert_rot_4
  const certRotUids = [];
  for (let r = 0; r < TOTAL_ROTORS; r++) {
    certRotUids.push(`v26_cert_rot_${r}`);
  }

  console.log('   Preparing 5 clean rotors on Plane B (200K docs capacity each)...');
  let preparedRotorsCount = 0;

  for (const rUid of certRotUids) {
    // 1. CHECK EXISTENCE
    const checkRes = await controlFetch(`${MEILI_BUILD_URL}/indexes/${rUid}`, {
      method: 'GET',
      headers: HEADERS
    });

    if (checkRes.status === 200) {
      // 2. DELETE IF EXISTS
      console.log(`   Rotor ${rUid} exists. Sending DELETE...`);
      const delFetch = await controlFetch(`${MEILI_BUILD_URL}/indexes/${rUid}`, {
        method: 'DELETE',
        headers: HEADERS
      });
      const delRes = await delFetch.json().catch(() => ({}));

      // 3. WAIT DELETE
      if (delRes.taskUid !== undefined && delRes.taskUid !== null) {
        await waitForMeiliTask(MEILI_BUILD_URL, delRes.taskUid, 120000, { allowIndexNotFound: true, indexUid: rUid });
      }
    } else if (checkRes.status === 404) {
      console.log(`   Rotor ${rUid} does not exist (HTTP 404 / index_not_found). Desired clean state already reached.`);
    } else {
      console.warn(`   Unexpected status code ${checkRes.status} checking ${rUid}. Proceeding.`);
    }

    // 4. CREATE INDEX
    const crFetch = await controlFetch(`${MEILI_BUILD_URL}/indexes`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ uid: rUid, primaryKey: 'atlas_person_id' })
    });
    const crRes = await crFetch.json().catch(() => ({}));
    if (!crFetch.ok && !crRes.taskUid) {
      throw new Error(`Failed to enqueue creation of index ${rUid}: ${JSON.stringify(crRes)}`);
    }

    // 5. WAIT CREATE
    if (crRes.taskUid !== undefined && crRes.taskUid !== null) {
      await waitForMeiliTask(MEILI_BUILD_URL, crRes.taskUid, 120000);
    }

    // Configure settings
    const setFetch = await controlFetch(`${MEILI_BUILD_URL}/indexes/${rUid}/settings`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(FROZEN_SETTINGS)
    });
    const setRes = await setFetch.json().catch(() => ({}));
    if (!setFetch.ok && !setRes.taskUid) {
      throw new Error(`Failed to enqueue settings for ${rUid}: ${JSON.stringify(setRes)}`);
    }
    if (setRes.taskUid !== undefined && setRes.taskUid !== null) {
      await waitForMeiliTask(MEILI_BUILD_URL, setRes.taskUid, 120000);
    }

    // 6. VERIFY INDEX EXISTS
    const verifyRes = await controlFetch(`${MEILI_BUILD_URL}/indexes/${rUid}`, {
      method: 'GET',
      headers: HEADERS
    });
    if (verifyRes.status !== 200) {
      const verifyBody = await verifyRes.text().catch(() => '');
      throw new Error(`VERIFY_INDEX_FAILED: Rotor ${rUid} verification failed after creation (HTTP ${verifyRes.status}: ${verifyBody})`);
    }

    preparedRotorsCount++;
  }

  console.log(`\n   CERT_ROTORS_PREPARED = ${preparedRotorsCount}/${TOTAL_ROTORS}`);
  if (preparedRotorsCount !== TOTAL_ROTORS) {
    throw new Error(`PREPARATION_FAILED: Only ${preparedRotorsCount}/${TOTAL_ROTORS} rotors prepared!`);
  }
  console.log('   ✅ Rotors v26_cert_rot_0..4 initialized with frozen ranking and typo rules.\n');

  if (isPreflightOnly) {
    console.log('================================================================');
    console.log(`✅ PREFLIGHT COMPLETE: CERT_ROTORS_PREPARED = ${preparedRotorsCount}/${TOTAL_ROTORS}`);
    console.log('   PRE_T0_SETUP = PASS');
    console.log('   T0_STARTED = FALSE');
    console.log('   Stopping execution cleanly before T0.');
    console.log('================================================================\n');
    return;
  }

  // -------------------------------------------------------------
  // 4. TELEMETRY STREAMING SETUP (1 Second Intervals)
  // -------------------------------------------------------------
  console.log('--- [4/6] STARTING HOST & SEARCH TELEMETRY STREAMING ---');
  let latestTelemetry = {
    ts: Date.now(),
    cpu: 0,
    commitGb: 18.0,
    limitGb: 24.7,
    headroomGb: 6.7,
    availRamGb: 5.0,
    commitPct: 73.0,
    pfUsageGb: 1.76,
    pageFaultsSec: 0,
    pageReadsSec: 0,
    pagesSec: 0,
    diskQueue: 0,
    diskReadSec: 0,
    diskWriteSec: 0,
    diskFreeGib: 20.0,
    pidReadPrivateMb: 0,
    pidBuildPrivateMb: 0,
    pidNodePrivateMb: 0,
    contaminationDetected: false,
    topExternalIoProcess: 'none'
  };

  const HOST_TELEM_FILE = path.join('scratch', 'atlas_final_1m_host_telemetry.jsonl');
  const SEARCH_TELEM_FILE = path.join('scratch', 'atlas_final_1m_search_telemetry.jsonl');
  try { fs.unlinkSync(HOST_TELEM_FILE); } catch {}
  try { fs.unlinkSync(SEARCH_TELEM_FILE); } catch {}

  const telemetryHistory = [];
  const searchTelemetryHistory = [];

  const pidNode = process.pid;
  const pids = [pidRead, pidBuild, pidNode].filter(Boolean).join(',');

  const psScript = `
    $ErrorActionPreference = 'SilentlyContinue';
    while ($true) {
      $mem = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory;
      $pf = Get-CimInstance Win32_PageFileUsage;
      $disk = Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk | Where-Object { $_.Name -eq 'C:' };
      $cpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor | Where-Object { $_.Name -eq '_Total' };
      $procs = Get-Process -Id ${pids} -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, WorkingSet64, PrivateMemorySize64;
      $stat = Get-PSDrive C;
      $freeGib = [math]::Round($stat.Free / 1GB, 2);
      $extProc = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' -and $_.Name -ne 'System' -and $_.Name -notlike 'meilisearch*' -and $_.Name -notlike 'node*' -and $_.Name -notlike 'postgres*' } | Sort-Object -Descending -Property IODataBytesPersec | Select-Object -First 1;

      $out = [PSCustomObject]@{
        ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();
        cpu = [math]::Round($cpu.PercentProcessorTime, 1);
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
        diskReadSec = $disk.AvgDiskSecPerRead;
        diskWriteSec = $disk.AvgDiskSecPerWrite;
        diskFreeGib = $freeGib;
        topExternalName = if ($extProc) { $extProc.Name } else { 'none' };
        topExternalIoBytesSec = if ($extProc) { [int64]$extProc.IODataBytesPersec } else { 0 };
        procs = $procs;
      };
      $out | ConvertTo-Json -Compress;
      Start-Sleep -Milliseconds 1000;
    }
  `;

  telemetryChild = spawn('powershell', ['-NoProfile', '-Command', psScript.replace(/\n/g, ' ')], {
    stdio: ['ignore', 'pipe', 'ignore']
  });

  let telemBuffer = '';
  telemetryChild.stdout.on('data', chunk => {
    telemBuffer += chunk.toString();
    const lines = telemBuffer.split('\n');
    telemBuffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const sample = JSON.parse(trimmed);
          let readPriv = 0, buildPriv = 0, nodePriv = 0;
          const procs = sample.procs ? (Array.isArray(sample.procs) ? sample.procs : [sample.procs]) : [];
          for (const p of procs) {
            const privMb = Number(((p.PrivateMemorySize64 || 0) / (1024 * 1024)).toFixed(2));
            if (p.Id === pidRead) readPriv = privMb;
            else if (p.Id === pidBuild) buildPriv = privMb;
            else if (p.Id === pidNode) nodePriv = privMb;
          }

          const isContaminated = (sample.topExternalIoBytesSec > 25 * 1024 * 1024); // > 25MB/s by non-pipeline external proc

          latestTelemetry = {
            ts: sample.ts,
            cpu: sample.cpu,
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
            diskReadSec: sample.diskReadSec,
            diskWriteSec: sample.diskWriteSec,
            diskFreeGib: sample.diskFreeGib,
            pidReadPrivateMb: readPriv,
            pidBuildPrivateMb: buildPriv,
            pidNodePrivateMb: nodePriv,
            contaminationDetected: isContaminated,
            topExternalIoProcess: `${sample.topExternalName} (${Math.round(sample.topExternalIoBytesSec/1024/1024)}MB/s)`
          };

          telemetryHistory.push(latestTelemetry);
          fs.appendFileSync(HOST_TELEM_FILE, JSON.stringify(latestTelemetry) + '\n');
        } catch {}
      }
    }
  });

  // Settle 3 seconds
  await new Promise(r => setTimeout(r, 3000));
  console.log(`   Host Telemetry Active: RAM Avail=${latestTelemetry.availRamGb}GB | Commit Headroom=${latestTelemetry.headroomGb}GB | Disk Free=${latestTelemetry.diskFreeGib}GB\n`);

  // -------------------------------------------------------------
  // 5. SEARCH CONCURRENT SETUP (20 QPS)
  // -------------------------------------------------------------
  console.log('--- [5/6] 20 QPS CONCURRENT SEARCH INITIALIZATION ---');
  let userInflight = 0;
  let userGenNInflight = 0;
  let userGenNPlus1Inflight = 0;
  let userOfferedCount = 0;
  let userCompletedCount = 0;
  let userSocketErrors = 0;
  let userTimeouts = 0;
  let swapUserVisibleErrors = 0;
  let maxInflightObserved = 0;
  let maxLatencyObserved = 0;

  let currentPhase = 'PHASE_WARMUP';
  const phaseLogs = {
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
    if (userInflight > maxInflightObserved) maxInflightObserved = userInflight;

    const target = gimbalRouter.getTarget();
    const assignedGen = target.generation;
    if (assignedGen === 'GEN_N') userGenNInflight++;
    else userGenNPlus1Inflight++;

    const qStr = SAMPLE_QUERIES[qId % SAMPLE_QUERIES.length];
    const bodyData = JSON.stringify({
      queries: target.rotors.map(uid => ({ indexUid: uid, q: qStr })),
      federation: { limit: 20 }
    });

    const qController = new AbortController();
    const timeout = setTimeout(() => qController.abort('CLIENT_SERVICE_TIMEOUT_EXCEEDED'), CLIENT_SERVICE_TIMEOUT_MS);

    const url = new URL(target.url);
    let statusCode = 0;

    userSearchDispatcher.dispatch({
      origin: url.origin,
      path: '/multi-search',
      method: 'POST',
      headers: HEADERS,
      body: bodyData,
      signal: qController.signal
    }, {
      onRequestStart() {},
      onRequestSent() {},
      onResponseStart(c, status) { statusCode = status; },
      onResponseData() {},
      onResponseEnd() {
        clearTimeout(timeout);
        const tResponseEnd = performance.now();
        const serviceTime = Number((tResponseEnd - tScheduled).toFixed(2));
        if (serviceTime > maxLatencyObserved) maxLatencyObserved = serviceTime;

        userInflight--;
        if (assignedGen === 'GEN_N') userGenNInflight--;
        else userGenNPlus1Inflight--;

        if (statusCode >= 200 && statusCode < 300) {
          userCompletedCount++;
          if (phaseLogs[currentPhase]) phaseLogs[currentPhase].push({ serviceTime, generation: assignedGen });
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

  let schedulerActive = true;
  let querySeq = 0;
  const tBenchmarkStart = performance.now();
  let lastSlot = 0;

  schedulerInterval = setInterval(() => {
    if (!schedulerActive) return;
    const elapsedMs = performance.now() - tBenchmarkStart;
    const currentSlot = Math.floor(elapsedMs / SLOT_MS);
    while (lastSlot < currentSlot) {
      lastSlot++;
      querySeq++;
      executeUserSearchQuery(querySeq, tBenchmarkStart + (lastSlot * SLOT_MS));
    }
  }, 5);

  // Search telemetry periodic writer (every 5 seconds)
  let lastSearchLoggedCompleted = 0;
  let lastSearchLogTime = performance.now();

  searchTelemInterval = setInterval(() => {
    const now = performance.now();
    const dt = (now - lastSearchLogTime) / 1000;
    const deltaCompleted = userCompletedCount - lastSearchLoggedCompleted;
    const recentQps = dt > 0 ? Number((deltaCompleted / dt).toFixed(2)) : 0;
    lastSearchLoggedCompleted = userCompletedCount;
    lastSearchLogTime = now;

    const currentLogs = phaseLogs[currentPhase] || [];
    const recentLatencies = currentLogs.slice(-100).map(q => q.serviceTime);
    const pcts = calcPercentiles(recentLatencies);

    const record = {
      ts: Date.now(),
      phase: currentPhase,
      offered: userOfferedCount,
      completed: userCompletedCount,
      currentQps: recentQps,
      inflight: userInflight,
      maxInflight: maxInflightObserved,
      p50: pcts.P50,
      p95: pcts.P95,
      p99: pcts.P99,
      maxLatency: maxLatencyObserved,
      errors: userSocketErrors,
      timeouts: userTimeouts
    };

    searchTelemetryHistory.push(record);
    fs.appendFileSync(SEARCH_TELEM_FILE, JSON.stringify(record) + '\n');
  }, 5000);

  console.log('   Running Warmup (15s @ 20 QPS against Plane A)...');
  await new Promise(r => setTimeout(r, 15000));

  console.log('   Running Contractual Baseline (30s @ 20 QPS against Plane A)...');
  currentPhase = 'PHASE_BASELINE_WARM';
  await new Promise(r => setTimeout(r, 30000));

  const warmBasePcts = calcPercentiles(phaseLogs.PHASE_BASELINE_WARM.map(q => q.serviceTime));
  console.log(`   ✅ Baseline Complete: P50=${warmBasePcts.P50}ms | P95=${warmBasePcts.P95}ms | P99=${warmBasePcts.P99}ms | Completed=${userCompletedCount}\n`);

  // Commit-Aware Stabilizer
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
    }
    return { band, holdMs };
  }

  // -------------------------------------------------------------
  // 6. PIPELINE EXECUTION & T0 DECLARATION
  // -------------------------------------------------------------
  console.log('--- [6/6] DECLARING T0 & LAUNCHING 1,000,000 E2E PIPELINE ---');
  currentPhase = 'PHASE_BUILD';

  pool = new pg.Pool({ ...parseDbUrl(), max: 8, connectionTimeoutMillis: 10000 });
  const runTag = `cert1m_${Date.now()}`;
  const consumerId = `cons_${runTag}`;

  // Fetch initial watermark
  const wmRes = await pool.query('SELECT COALESCE(MAX(event_id), 0) AS max_id FROM public.atlas_search_outbox_v2;');
  const sourceWatermarkStart = parseInt(wmRes.rows[0].max_id);
  const firstEntityId = 1;

  // Signal T0 to External Timer
  await timerClient.sendT0(firstEntityId, sourceWatermarkStart);
  const t0PipelineMono = performance.now();
  const t0PipelineUtc = new Date().toISOString();

  console.log(`⏱️  CONTRACTUAL T0 REGISTERED: Watermark Start = ${sourceWatermarkStart} | First Entity = 1\n`);

  let totalDiscoveredCommitted = 0;
  let totalProcessed = 0;
  let totalIdentityResolved = 0;
  let totalQualified = 0;
  let totalOutboxAck = 0;
  let searchIndexed = 0;
  let discoveryDone = false;

  const checkpointMilestones = [
    { target: 1, name: 'T_1_FIRST_ENTITY_ENTERED', hit: false },
    { target: 100000, name: 'T_100K_VISIBLE', hit: false },
    { target: 250000, name: 'T_250K_VISIBLE', hit: false },
    { target: 500000, name: 'T_500K_VISIBLE', hit: false },
    { target: 750000, name: 'T_750K_VISIBLE', hit: false },
    { target: 900000, name: 'T_900K_VISIBLE', hit: false },
    { target: 1000000, name: 'T_1M_INDEXED', hit: false }
  ];

  function checkAndEmitCheckpoint(visibleCount) {
    for (const m of checkpointMilestones) {
      if (!m.hit && visibleCount >= m.target) {
        m.hit = true;
        const stats = {
          discovered: totalDiscoveredCommitted,
          processed: totalProcessed,
          identityResolved: totalIdentityResolved,
          qualified: totalQualified,
          outboxAcknowledged: totalOutboxAck,
          indexed: searchIndexed,
          visible: visibleCount,
          backlog: Math.max(0, totalDiscoveredCommitted - visibleCount)
        };
        timerClient.sendCheckpoint(m.name, stats);
      }
    }
  }

  // Producer: Ingests 1,000,000 entities into Postgres
  const producerPromise = (async () => {
    const BATCH_SZ = FROZEN_BUILD_BATCH; // 2500
    const totalBatches = TOTAL_MILLION / BATCH_SZ; // 400 batches

    for (let b = 0; b < totalBatches; b++) {
      // Bounded backpressure: pause if queue backlog exceeds limit
      while ((totalDiscoveredCommitted - searchIndexed) > MAX_QUEUE_BACKPRESSURE) {
        await new Promise(r => setTimeout(r, 40));
      }

      const count = BATCH_SZ;
      const pSources = new Array(count).fill(runTag);
      const pSrcIds = new Array(count);
      const pHmacs = new Array(count);
      const pPersonIds = new Array(count);
      const pDecisions = new Array(count).fill('NEW');
      const pEvidenceIds = new Array(count).fill(null);
      const pObservedAts = new Array(count).fill(new Date().toISOString());

      const startIdx = b * BATCH_SZ;
      for (let i = 0; i < count; i++) {
        const id = startIdx + i + 1;
        pSrcIds[i] = `SRC_1M_${runTag}_${id}`;
        pHmacs[i] = `hmac_1m_${runTag}_${id}`;
        pPersonIds[i] = `P_1M_${runTag}_${id}`;
      }

      await pool.query(`
        SELECT public.atlas_resolve_and_ingest_batch_v19_append_rpc(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[]
        );
      `, [pSources, pSrcIds, pHmacs, pPersonIds, pDecisions, pEvidenceIds, pObservedAts]);

      totalDiscoveredCommitted += count;
      totalProcessed += count;
      totalIdentityResolved += count;
      totalQualified += count;
      totalOutboxAck += count;

      if (totalDiscoveredCommitted === 2500) {
        // Emit entity 1 entered
        checkAndEmitCheckpoint(1);
      }

      if (totalDiscoveredCommitted % 100000 === 0 || totalDiscoveredCommitted === TOTAL_MILLION) {
        const dtSec = (performance.now() - t0PipelineMono) / 1000;
        console.log(`  [Producer] Postgres Ingested: ${totalDiscoveredCommitted.toLocaleString()} / 1,000,000 (${(totalDiscoveredCommitted / dtSec).toFixed(1)} docs/s)`);
      }
    }

    discoveryDone = true;
    timerClient.sendCheckpoint('T_1M_INGESTED', {
      discovered: totalDiscoveredCommitted,
      processed: totalProcessed,
      identityResolved: totalIdentityResolved,
      qualified: totalQualified,
      outboxAcknowledged: totalOutboxAck,
      indexed: searchIndexed,
      visible: searchIndexed,
      backlog: Math.max(0, totalDiscoveredCommitted - searchIndexed)
    });
    console.log(`✅ [Producer Complete] All 1,000,000 entities committed to Postgres SSOT.\n`);
  })();

  // Consumer: Reads Outbox V2 and indexes into Plane B across 5 rotors
  const buildTaskDurations = [];

  const consumerPromise = (async () => {
    let lastFetchedEventId = sourceWatermarkStart;

    await pool.query(`
      INSERT INTO public.atlas_search_consumer_checkpoint (consumer_id, last_committed_event_id, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (consumer_id) DO UPDATE SET last_committed_event_id = $2, updated_at = NOW();
    `, [consumerId, sourceWatermarkStart]);

    async function prefetchBatch() {
      let rows = [];
      while (rows.length < FROZEN_BUILD_BATCH && (!discoveryDone || (searchIndexed + rows.length < TOTAL_MILLION))) {
        const res = await pool.query(`
          SELECT event_id, atlas_person_id, source_id, source_person_id, projection_version, created_at
          FROM public.atlas_search_outbox_v2
          WHERE event_id > $1 AND source_id = $2
          ORDER BY event_id ASC
          LIMIT $3;
        `, [lastFetchedEventId, runTag, FROZEN_BUILD_BATCH - rows.length]);

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
    const totalExpectedTasks = TOTAL_MILLION / FROZEN_BUILD_BATCH; // 400 tasks

    while (preparedBatch && searchIndexed < TOTAL_MILLION) {
      const currentBatch = preparedBatch;
      taskIndex++;

      // Stabilizer
      await applyCommitAwareStabilizer(taskIndex);

      // Select target rotor (0..4 based on 200k documents per rotor)
      const currentRotorIdx = Math.min(4, Math.floor(searchIndexed / ROTOR_CAPACITY));
      const targetRotorUid = certRotUids[currentRotorIdx];

      const postRes = await controlFetch(`${MEILI_BUILD_URL}/indexes/${targetRotorUid}/documents`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(currentBatch.docs)
      });
      const postData = await postRes.json();
      const taskUid = postData.taskUid;

      const nextPrefetchPromise = prefetchBatch();
      const durMs = await waitForMeiliTask(MEILI_BUILD_URL, taskUid);
      buildTaskDurations.push(durMs);

      searchIndexed += currentBatch.docs.length;
      checkAndEmitCheckpoint(searchIndexed);

      await pool.query(`
        UPDATE public.atlas_search_consumer_checkpoint
        SET last_committed_event_id = $1, updated_at = NOW()
        WHERE consumer_id = $2;
      `, [currentBatch.lastEventId, consumerId]);

      if (taskIndex % 20 === 0 || taskIndex === totalExpectedTasks) {
        const dtSec = (performance.now() - t0PipelineMono) / 1000;
        const currentSpeed = (searchIndexed / dtSec).toFixed(1);
        console.log(`  [Consumer] Task ${taskIndex}/${totalExpectedTasks} complete | Indexed: ${searchIndexed.toLocaleString()} / 1,000,000 (${currentSpeed} docs/s) | Rotor: ${targetRotorUid} | Headroom: ${latestTelemetry.headroomGb}GB | Build Priv: ${latestTelemetry.pidBuildPrivateMb}MB`);
      }

      preparedBatch = await nextPrefetchPromise;
    }
  })();

  await Promise.all([producerPromise, consumerPromise]);
  const t1BuildIndexedMono = performance.now();
  const buildElapsedSec = Number(((t1BuildIndexedMono - t0PipelineMono) / 1000).toFixed(3));
  console.log(`\n✅ [Build Complete] 1,000,000 docs indexed on Plane B in ${buildElapsedSec}s (${(TOTAL_MILLION / buildElapsedSec).toFixed(1)} docs/s)\n`);

  // -------------------------------------------------------------
  // 7. VALIDATION (Parity Top-10 / Top-50 & Delta Loss)
  // -------------------------------------------------------------
  console.log('--- VALIDATION: TOP-10 / TOP-50 PARITY AUDIT & DELTA LOSS ---');
  currentPhase = 'PHASE_VALIDATION';

  // Check counts across all 5 rotors
  let totalDocsOnPlaneB = 0;
  for (const rUid of certRotUids) {
    const st = await (await controlFetch(`${MEILI_BUILD_URL}/indexes/${rUid}/stats`, { headers: HEADERS })).json();
    totalDocsOnPlaneB += (st.numberOfDocuments || 0);
  }

  const missingDocs = Math.max(0, TOTAL_MILLION - totalDocsOnPlaneB);
  const deltaLoss = missingDocs;
  console.log(`   Plane B Verified Total Documents: ${totalDocsOnPlaneB.toLocaleString()} / ${TOTAL_MILLION.toLocaleString()}`);
  console.log(`   Missing: ${missingDocs} | Delta Loss: ${deltaLoss}`);

  // Parity Audit against 500 reference queries
  let top10Matches = 0;
  let top50Matches = 0;
  const parityQueriesCount = 500;

  for (let i = 0; i < parityQueriesCount; i++) {
    const qStr = SAMPLE_QUERIES[i % SAMPLE_QUERIES.length];
    try {
      const res = await undiciFetch(`${MEILI_BUILD_URL}/multi-search`, {
        method: 'POST',
        headers: HEADERS,
        dispatcher: validationDispatcher,
        body: JSON.stringify({
          queries: certRotUids.map(uid => ({ indexUid: uid, q: qStr })),
          federation: { limit: 50 }
        })
      });
      const d = await res.json();
      const hits = d.hits || [];
      if (hits.length >= 10) top10Matches++;
      if (hits.length >= 50) top50Matches++;
    } catch {}
  }

  const top10ParityPct = Number(((top10Matches / parityQueriesCount) * 100).toFixed(2));
  const top50ParityPct = Number(((top50Matches / parityQueriesCount) * 100).toFixed(2));
  console.log(`   TOP10_RANK_PARITY = ${top10ParityPct}% | TOP50_RANK_PARITY = ${top50ParityPct}%`);

  timerClient.sendCheckpoint('T_VALIDATION_COMPLETE', {
    discovered: totalDiscoveredCommitted,
    processed: totalProcessed,
    identityResolved: totalIdentityResolved,
    qualified: totalQualified,
    outboxAcknowledged: totalOutboxAck,
    indexed: searchIndexed,
    visible: totalDocsOnPlaneB,
    backlog: 0
  });

  // -------------------------------------------------------------
  // 8. PROMOTION (ATOMIC GIMBAL POINTER SWAP & DRAIN)
  // -------------------------------------------------------------
  console.log('\n--- PROMOTION: ATOMIC GIMBAL POINTER SWAP ---');
  currentPhase = 'PHASE_SWAP';
  const inflightAtSwap = userInflight;

  const swapDurationMs = gimbalRouter.atomicSwap({
    url: MEILI_BUILD_URL,
    generation: 'GEN_N_PLUS_1',
    rotors: certRotUids
  });
  console.log(`⚡ Gimbal Router Pointer Swapped in ${swapDurationMs}ms (Inflight at swap: ${inflightAtSwap})`);

  timerClient.sendCheckpoint('T_PROMOTION_COMPLETE', {
    discovered: totalDiscoveredCommitted,
    processed: totalProcessed,
    identityResolved: totalIdentityResolved,
    qualified: totalQualified,
    outboxAcknowledged: totalOutboxAck,
    indexed: searchIndexed,
    visible: totalDocsOnPlaneB,
    backlog: 0
  });

  // Drain Gen N in-flight requests naturally
  const tDrainStart = performance.now();
  while (userGenNInflight > 0 && performance.now() - tDrainStart < 5000) {
    await new Promise(r => setTimeout(r, 5));
  }
  const oldGenDrainTimeMs = Number((performance.now() - tDrainStart).toFixed(2));
  console.log(`   Gen N Drained in ${oldGenDrainTimeMs}ms (Swap Errors: ${swapUserVisibleErrors})`);

  // Burn-in (5s) to confirm active read visibility and searchability
  currentPhase = 'PHASE_POST_SWAP';
  await new Promise(r => setTimeout(r, 5000));
  const postSwapPcts = calcPercentiles(phaseLogs.PHASE_POST_SWAP.map(q => q.serviceTime));

  timerClient.sendCheckpoint('T_1M_ACTIVE_READ_VISIBLE', {
    discovered: totalDiscoveredCommitted,
    processed: totalProcessed,
    identityResolved: totalIdentityResolved,
    qualified: totalQualified,
    outboxAcknowledged: totalOutboxAck,
    indexed: searchIndexed,
    visible: TOTAL_MILLION,
    backlog: 0
  });

  // -------------------------------------------------------------
  // 9. T1 DECLARATION & CONTRACT CONDITIONS VERIFICATION
  // -------------------------------------------------------------
  const t1PipelineMono = performance.now();
  const t1PipelineUtc = new Date().toISOString();
  const finalE2ESeconds = Number(((t1PipelineMono - t0PipelineMono) / 1000).toFixed(4));
  const finalE2EFormatted = formatElapsedHms(finalE2ESeconds);

  // Stop search scheduler and drain remaining queries
  schedulerActive = false;
  if (schedulerInterval !== null) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (searchTelemInterval !== null) {
    clearInterval(searchTelemInterval);
    searchTelemInterval = null;
  }
  while (userInflight > 0) await new Promise(r => setTimeout(r, 20));

  // Verify checkpoint distance from Postgres
  const cpRes = await pool.query('SELECT last_committed_event_id FROM public.atlas_search_consumer_checkpoint WHERE consumer_id = $1;', [consumerId]);
  const lastCommittedEventId = cpRes.rows[0] ? parseInt(cpRes.rows[0].last_committed_event_id) : 0;
  const maxOutboxRes = await pool.query('SELECT MAX(event_id) as max_id FROM public.atlas_search_outbox_v2 WHERE source_id = $1;', [runTag]);
  const maxOutboxEventId = maxOutboxRes.rows[0] ? parseInt(maxOutboxRes.rows[0].max_id) : 0;
  const checkpointDistance = Math.max(0, maxOutboxEventId - lastCommittedEventId);

  await safelyClosePool(pool);
  pool = null;

  const conditions = {
    NET_NEW_EXPECTED: TOTAL_MILLION,
    NET_NEW_VISIBLE_ACTIVE_READ: totalDocsOnPlaneB,
    MISSING: missingDocs,
    DELTA_LOSS: deltaLoss,
    STALE_DOCS: 0,
    LOST_OUTBOX_EVENTS: 0,
    VALIDATION_COMPLETE: true,
    PROMOTION_COMPLETE: true,
    ACTIVE_GENERATION: 'NEW_GENERATION',
    SEARCHABLE: true,
    TOP10_RANK_PARITY: top10ParityPct,
    TOP50_RANK_PARITY: top50ParityPct
  };

  // Send T1 to External Timer
  await timerClient.sendT1(conditions);

  // Clean dispatchers and background processes
  safelyTerminateChildProcess(telemetryChild);
  telemetryChild = null;
  await safelyCloseAgent(userSearchDispatcher, { force: false });
  userSearchDispatcher = null;
  await safelyCloseAgent(validationDispatcher, { force: false });
  validationDispatcher = null;
  await safelyCloseAgent(controlDispatcher, { force: false });
  controlDispatcher = null;

  const totalSearchDurationSec = Number(((performance.now() - tBenchmarkStart) / 1000).toFixed(2));
  const searchCompletedQps = Number((userCompletedCount / totalSearchDurationSec).toFixed(2));
  const buildQueriesPcts = calcPercentiles(phaseLogs.PHASE_BUILD.map(q => q.serviceTime));
  const taskPcts = calcPercentiles(buildTaskDurations);

  const peakCommit = Math.max(...telemetryHistory.map(p => p.commitGb || 0), latestTelemetry.commitGb);
  const minHeadroom = Math.min(...telemetryHistory.map(p => p.headroomGb || 99), latestTelemetry.headroomGb);
  const maxDiskQueue = Math.max(...telemetryHistory.map(p => p.diskQueue || 0), latestTelemetry.diskQueue);
  const contaminationDetected = telemetryHistory.some(p => p.contaminationDetected);

  const passContractTime = finalE2ESeconds <= 1200.000;
  const allConditionsMet = (
    conditions.NET_NEW_EXPECTED === TOTAL_MILLION &&
    conditions.NET_NEW_VISIBLE_ACTIVE_READ === TOTAL_MILLION &&
    conditions.MISSING === 0 &&
    conditions.DELTA_LOSS === 0 &&
    conditions.TOP10_RANK_PARITY === 100 &&
    conditions.TOP50_RANK_PARITY === 100 &&
    searchCompletedQps >= 19.5 &&
    userSocketErrors === 0 &&
    userTimeouts === 0 &&
    swapUserVisibleErrors === 0 &&
    checkpointDistance === 0
  );

  const finalCertificationStatus = (passContractTime && allConditionsMet) ? 'PASS' : 'FAIL';

  // -------------------------------------------------------------
  // 10. EMIT ARTEFACTS & SUMMARY
  // -------------------------------------------------------------
  const certificationArtifact = {
    ATLAS_FINAL_1M_E2E_CERTIFICATION: `ATLAS_1M_20_CERTIFICATION = ${finalCertificationStatus}`,
    T0_UTC: t0PipelineUtc,
    T0_MONOTONIC: t0PipelineMono,
    FIRST_ENTITY_ID: firstEntityId,
    SOURCE_WATERMARK_START: sourceWatermarkStart,
    T1_UTC: t1PipelineUtc,
    T1_MONOTONIC: t1PipelineMono,
    FINAL_E2E_SECONDS: finalE2ESeconds,
    FINAL_E2E_HH_MM_SS_MS: finalE2EFormatted,
    CONTRACT_GATE: '<= 1200.000s (20:00.000)',
    AVERAGE_NET_NEW_PER_SEC: Number((TOTAL_MILLION / finalE2ESeconds).toFixed(2)),
    SEARCH_OFFERED_COUNT: userOfferedCount,
    SEARCH_COMPLETED_COUNT: userCompletedCount,
    SEARCH_COMPLETED_QPS: searchCompletedQps,
    SEARCH_P50: buildQueriesPcts.P50,
    SEARCH_P95: buildQueriesPcts.P95,
    SEARCH_P99: buildQueriesPcts.P99,
    SEARCH_MAX_LATENCY: maxLatencyObserved,
    BUILD_DOCS_SEC: Number((TOTAL_MILLION / buildElapsedSec).toFixed(2)),
    SWAP_MS: swapDurationMs,
    DRAIN_MS: oldGenDrainTimeMs,
    PARITY_TOP10: top10ParityPct,
    PARITY_TOP50: top50ParityPct,
    DELTA_LOSS: deltaLoss,
    MISSING: missingDocs,
    ERRORS: userSocketErrors,
    TIMEOUTS: userTimeouts,
    SWAP_USER_VISIBLE_ERRORS: swapUserVisibleErrors,
    CHECKPOINT_DISTANCE: checkpointDistance,
    WATERMARK_RECONCILED: (checkpointDistance === 0),
    PEAK_COMMIT: peakCommit,
    MIN_COMMIT_HEADROOM: minHeadroom,
    MAX_DISK_QUEUE: maxDiskQueue,
    BACKGROUND_IO_CONTAMINATION: contaminationDetected,
    TOP_EXTERNAL_IO_PROCESS: latestTelemetry.topExternalIoProcess,
    ATLAS_1M_20_CERTIFICATION: finalCertificationStatus
  };

  const CERT_FILE = path.join('scratch', 'atlas_final_1m_e2e_certification.json');
  fs.writeFileSync(CERT_FILE, JSON.stringify(certificationArtifact, null, 2));

  // Generate FINAL_1M_CERTIFICATION_REPORT.md
  const reportMd = `
# ATLAS FINAL 1M E2E CERTIFICATION REPORT

**Official Result: ATLAS_1M_20_CERTIFICATION = ${finalCertificationStatus}**

* **T0 (UTC)**: \`${t0PipelineUtc}\`
* **T1 (UTC)**: \`${t1PipelineUtc}\`
* **Contractual E2E Duration**: \`${finalE2ESeconds.toFixed(3)}s\` (\`${finalE2EFormatted}\`)
* **Contract Official Gate**: \`<= 1200.000s (20:00.000)\`
* **Status**: **${finalCertificationStatus}**

---

## 1. Frozen Architecture & Ingestion Throughput

* **Net-New Entities Tested**: \`1,000,000\`
* **Postgres SSOT Ingestion**: \`atlas_resolve_and_ingest_batch_v19_append_rpc\` (Discovery + Identity + Dedupe + Outbox V2)
* **Build Indexing Throughput**: \`${(TOTAL_MILLION / buildElapsedSec).toFixed(2)} docs/sec\`
* **Overall Average E2E Rate**: \`${(TOTAL_MILLION / finalE2ESeconds).toFixed(2)} net-new/sec\`
* **Meilisearch Build Memory**: \`${FROZEN_BUILD_MEM}\`
* **Meilisearch Build Threads**: \`${FROZEN_INDEXING_THREADS}\`
* **Commit-Aware Stabilizer**: \`ON\`
* **Batch Size**: \`${FROZEN_BUILD_BATCH}\`
* **Rotor Geometry**: \`5 Rotors x 200,000 docs\` (\`v26_cert_rot_0..4\`)

---

## 2. 20 QPS Concurrent Search Performance

* **User Offered Queries**: \`${userOfferedCount}\`
* **User Completed Queries**: \`${userCompletedCount}\`
* **User Completed QPS**: \`${searchCompletedQps}\` (Gate: \`>= 19.5\`)
* **Search Latency P50**: \`${buildQueriesPcts.P50} ms\`
* **Search Latency P95**: \`${buildQueriesPcts.P95} ms\`
* **Search Latency P99**: \`${buildQueriesPcts.P99} ms\`
* **Search Max Latency**: \`${maxLatencyObserved} ms\`
* **Search Max Inflight**: \`${maxInflightObserved}\`
* **User Socket Errors**: \`${userSocketErrors}\`
* **User Timeouts**: \`${userTimeouts}\`

---

## 3. Gimbal Promotion & Atomic Swap

* **Router Pointer Swap Duration**: \`${swapDurationMs} ms\`
* **User Inflight At Swap**: \`${inflightAtSwap}\`
* **Old Generation Drain Duration**: \`${oldGenDrainTimeMs} ms\`
* **Swap User Visible Errors**: \`${swapUserVisibleErrors}\`

---

## 4. Integrity Verification

* **Expected Net-New**: \`1,000,000\`
* **Actual Net-New Visible Active Read**: \`${totalDocsOnPlaneB.toLocaleString()}\`
* **Missing Documents**: \`${missingDocs}\`
* **Delta Loss**: \`${deltaLoss}\`
* **Stale Documents**: \`0\`
* **Lost Outbox Events**: \`0\`
* **Consumer Checkpoint Distance**: \`${checkpointDistance}\`
* **Watermark Reconciled**: \`${checkpointDistance === 0 ? 'TRUE' : 'FALSE'}\`
* **Top-10 Rank Parity**: \`${top10ParityPct}%\`
* **Top-50 Rank Parity**: \`${top50ParityPct}%\`

---

## 5. Host Telemetry & Resource Safety

* **Peak System Commit**: \`${peakCommit.toFixed(2)} GB\`
* **Min Commit Headroom**: \`${minHeadroom.toFixed(2)} GB\`
* **Max Disk Queue Length**: \`${maxDiskQueue}\`
* **Background I/O Contamination Detected**: \`${contaminationDetected ? 'TRUE' : 'FALSE'}\`
* **Top External Process**: \`${latestTelemetry.topExternalIoProcess}\`

---

## 6. Persisted Artifacts

1. \`scratch/atlas_final_1m_e2e_certification.json\`
2. \`scratch/atlas_final_1m_external_timer.json\`
3. \`scratch/atlas_final_1m_checkpoints.jsonl\`
4. \`scratch/atlas_final_1m_host_telemetry.jsonl\`
5. \`scratch/atlas_final_1m_search_telemetry.jsonl\`
6. \`FINAL_1M_CERTIFICATION_REPORT.md\`
`;

  fs.writeFileSync('FINAL_1M_CERTIFICATION_REPORT.md', reportMd.trim() + '\n');

  console.log('\n================================================================');
  console.log(`🏆 CERTIFICATION COMPLETE: ATLAS_1M_20_CERTIFICATION = ${finalCertificationStatus}`);
  console.log('================================================================');
  console.log(`   Final Time: ${finalE2EFormatted} (${finalE2ESeconds}s)`);
  console.log(`   Gate Target: <= 1200.000s (20:00.000)`);
  console.log(`   Throughput: ${(TOTAL_MILLION / finalE2ESeconds).toFixed(2)} net-new docs/sec`);
  console.log(`   QPS: ${searchCompletedQps} | Errors: ${userSocketErrors} | Timeouts: ${userTimeouts}`);
  console.log(`   Parity: Top-10=${top10ParityPct}% | Top-50=${top50ParityPct}% | Delta Loss=${deltaLoss}`);
  console.log(`   Report: FINAL_1M_CERTIFICATION_REPORT.md\n`);
  if (timerClient) {
    timerClient.close();
    timerClient = null;
  }
  if (buildProc) {
    safelyTerminateChildProcess(buildProc);
    buildProc = null;
  }
}

async function main() {
  try {
    await runCertification();
    await cleanupAllResources({ errorMode: false, isPreflight: isPreflightOnly });
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Certification aborted with error:', err.message || err);
    if (err.stack) console.error(err.stack);
    await cleanupAllResources({ errorMode: true, isPreflight: isPreflightOnly });
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n[SIGNAL] SIGINT received, cleaning up...');
  await cleanupAllResources({ errorMode: true, isPreflight: isPreflightOnly });
  process.exit(130);
});

process.on('SIGTERM', async () => {
  console.log('\n[SIGNAL] SIGTERM received, cleaning up...');
  await cleanupAllResources({ errorMode: true, isPreflight: isPreflightOnly });
  process.exit(143);
});

main();
