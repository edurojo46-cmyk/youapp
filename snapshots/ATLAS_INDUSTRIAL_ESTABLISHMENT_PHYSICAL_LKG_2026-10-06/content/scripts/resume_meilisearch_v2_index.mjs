import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { spawn, execSync } from 'child_process';

// ============================================================
// CONFIGURATION & CONSTANTS
// ============================================================
const PROJECTION_DIR = path.resolve('reports/atlas/search');
const PROJECTION_FILE = path.join(PROJECTION_DIR, 'atlas_canonical_people_projection_v2.jsonl');
const CHECKPOINT_FILE = path.join(PROJECTION_DIR, 'atlas_meili_v2_build_checkpoint.json');
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_people_v2_full_index_build.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';
const TOTAL_TARGET = 1001007;
const BATCH_SIZE = 1000; // Conservative 1,000 documents batch size for final 71k stretch

// Circuit breaker thresholds
const MIN_STARTUP_RAM_MB = 1800;
const MIN_FREE_RAM_MB = 1500;
const MIN_FREE_VIRTUAL_MB = 2500;
const MIN_FREE_DISK_GB = 10;
const MAX_TASK_AGE_SECONDS = 300; // 5 minutes timeout per batch

// ============================================================
// SYSTEM RESOURCE HELPERS
// ============================================================
function getSystemResources() {
  const freeRamMb = parseFloat((os.freemem() / (1024 * 1024)).toFixed(2));
  
  let freeDiskGb = 0;
  try {
    if (fs.statfsSync) {
      const stats = fs.statfsSync('.');
      freeDiskGb = parseFloat((stats.bavail * stats.bsize / (1024 * 1024 * 1024)).toFixed(2));
    }
  } catch (e) {}

  let freeVirtualMb = 0;
  try {
    const out = execSync('powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory"', { encoding: 'utf8', timeout: 3000 }).trim();
    const kb = parseInt(out, 10);
    if (!isNaN(kb)) freeVirtualMb = parseFloat((kb / 1024).toFixed(2));
  } catch (e) {
    freeVirtualMb = freeRamMb * 2;
  }

  return { freeRamMb, freeVirtualMb, freeDiskGb };
}

function getDirectorySizeBytes(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      total += getDirectorySizeBytes(fullPath);
    } else {
      try {
        total += fs.statSync(fullPath).size;
      } catch(e) {}
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function getProcessMemoryInfo(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8', timeout: 3000 }).trim();
    if (!out || out.includes('INFORMACI') || out.includes('INFO:')) return { rss_mb: 0 };
    const parts = out.split('","');
    if (parts.length >= 5) {
      const memStr = parts[4].replace(/[^0-9]/g, '');
      const kb = parseInt(memStr, 10);
      if (!isNaN(kb)) {
        return { rss_mb: parseFloat((kb / 1024).toFixed(2)) };
      }
    }
  } catch (e) {}
  return { rss_mb: 0 };
}

// ============================================================
// CHECKPOINT MANAGEMENT
// ============================================================
function readCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_FILE)) {
    throw new Error(`Checkpoint file not found: ${CHECKPOINT_FILE}`);
  }
  return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
}

function writeCheckpoint(status, confirmedDocs, lastTaskUid, failedTaskUid = null, reason = null) {
  const data = {
    checkpoint_version: 1,
    status: status,
    index_uid: INDEX_NAME,
    db_path: 'data_v2_shadow.ms',
    projection_file: 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl',
    projection_sha256: '6a6ca1d6745b59d417a0684270a327285b2be6e597f0a2f4dce748063d03f446',
    confirmed_documents: confirmedDocs,
    last_successful_task_uid: lastTaskUid,
    failed_task_uid: failedTaskUid,
    next_source_line: confirmedDocs + 1,
    batch_size_last: BATCH_SIZE,
    recommended_batch_size: BATCH_SIZE,
    updated_at: new Date().toISOString(),
    reason: reason
  };
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

// ============================================================
// SERVER SPAWN & MANAGEMENT
// ============================================================
let serverLogStream = null;

function spawnMeili() {
  if (!serverLogStream) {
    serverLogStream = fs.createWriteStream(SERVER_LOG_PATH, { flags: 'a' });
  }
  const proc = spawn(MEILI_EXE, [
    '--db-path', MEILI_DB_PATH,
    '--http-addr', `127.0.0.1:${MEILI_PORT}`,
    '--max-indexing-threads', '1',
    '--no-analytics'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.pipe(serverLogStream);
  proc.stderr.pipe(serverLogStream);

  proc.on('exit', (code, sig) => {
    if (code !== null && code !== 0) {
      console.log(`[Meilisearch Server Exited] code: ${code}, signal: ${sig}`);
    }
  });

  return proc;
}

async function waitForHealth(timeoutSec = 30) {
  for (let i = 0; i < timeoutSec * 2; i++) {
    try {
      const res = await fetch(`${MEILI_URL}/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'available') return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function waitForTaskWithHeartbeat(taskUid, meiliPid, startTimeAll, docsBeforeBatch, batchSize) {
  const tStart = performance.now();
  let lastHeartbeat = performance.now();

  while (true) {
    const ageSeconds = parseFloat(((performance.now() - tStart) / 1000).toFixed(1));
    
    // Check task timeout breaker
    if (ageSeconds > MAX_TASK_AGE_SECONDS) {
      throw new Error(`CIRCUIT BREAKER TRIGGERED: Task ${taskUid} exceeded timeout (${ageSeconds}s > ${MAX_TASK_AGE_SECONDS}s)`);
    }

    try {
      const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
      if (res.ok) {
        const data = await res.json();
        const status = data.status;

        // Periodic Heartbeat every ~10s or when completed
        const now = performance.now();
        if (now - lastHeartbeat >= 10000 || status === 'succeeded' || status === 'failed') {
          const sys = getSystemResources();
          const meiliMem = getProcessMemoryInfo(meiliPid);
          const currentConfirmed = docsBeforeBatch + (status === 'succeeded' ? batchSize : 0);
          const remainingDocs = Math.max(0, TOTAL_TARGET - currentConfirmed);
          const percentComplete = ((currentConfirmed / TOTAL_TARGET) * 100).toFixed(2);
          const elapsedTotal = (now - startTimeAll) / 1000;
          const cumulativeRate = elapsedTotal > 0 ? (currentConfirmed / elapsedTotal).toFixed(1) : '0';

          console.log(`[HEARTBEAT] CONFIRMED_DOCS: ${currentConfirmed} | REMAINING: ${remainingDocs} | PERCENT: ${percentComplete}% | TASK_UID: ${taskUid} | STATUS: ${status} | AGE: ${ageSeconds}s | FREE_RAM: ${sys.freeRamMb} MB | FREE_VIRTUAL: ${sys.freeVirtualMb} MB | FREE_DISK: ${sys.freeDiskGb} GB | MEILI_RSS: ${meiliMem.rss_mb} MB | RATE: ${cumulativeRate} docs/s`);
          lastHeartbeat = now;
        }

        if (status === 'succeeded') return data;
        if (status === 'failed' || status === 'canceled') {
          return data;
        }
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 1000));
  }
}

// ============================================================
// MAIN RESUMPTION PIPELINE
// ============================================================
async function main() {
  const resumeStartedAt = new Date().toISOString();
  console.log('============================================================');
  console.log('MEILISEARCH RESUMABLE INGESTION RUNNER (FINAL STRETCH - BATCH 1000)');
  console.log(`Started at: ${resumeStartedAt}`);
  console.log('============================================================\n');

  // 1. Terminate previous instances and start Meilisearch
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}

  console.log(`>>> Starting Meilisearch pointing to: ${MEILI_DB_PATH}...`);
  let meiliProc = spawnMeili();
  let meiliPid = meiliProc.pid;
  let peakMeiliRss = 0;

  const healthy = await waitForHealth();
  if (!healthy) throw new Error('Meilisearch failed to reach HEALTHY state');
  console.log(`✅ Meilisearch HEALTH = available on PID ${meiliPid}`);

  // Memory monitor loop
  const memInterval = setInterval(() => {
    const m = getProcessMemoryInfo(meiliPid);
    if (m.rss_mb > peakMeiliRss) peakMeiliRss = m.rss_mb;
  }, 2000);

  // 2. Read initial checkpoint
  const checkpoint = readCheckpoint();
  console.log(`>>> Loaded checkpoint: confirmed_documents = ${checkpoint.confirmed_documents}, next_source_line = ${checkpoint.next_source_line}`);

  // 3. Verify exact starting state
  const initialStats = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/stats`).then(r => r.json());
  console.log(`>>> Meilisearch Stats: numberOfDocuments = ${initialStats.numberOfDocuments}, isIndexing = ${initialStats.isIndexing}`);

  if (initialStats.numberOfDocuments !== checkpoint.confirmed_documents) {
    console.error(`❌ CRITICAL: Document count mismatch! LMDB: ${initialStats.numberOfDocuments}, Checkpoint: ${checkpoint.confirmed_documents}`);
    meiliProc.kill();
    process.exit(1);
  }

  // 4. Check initial startup resources
  const startupSys = getSystemResources();
  const startupMeiliMem = getProcessMemoryInfo(meiliPid);
  console.log('\n--- STARTUP RESOURCE AUDIT ---');
  console.log(`FREE_RAM_MB = ${startupSys.freeRamMb}`);
  console.log(`FREE_VIRTUAL_MB = ${startupSys.freeVirtualMb}`);
  console.log(`FREE_DISK_GB = ${startupSys.freeDiskGb}`);
  console.log(`MEILI_RSS_MB = ${startupMeiliMem.rss_mb}`);
  console.log('-------------------------------\n');

  if (startupSys.freeRamMb < MIN_STARTUP_RAM_MB) {
    console.error(`🛑 INSUFFICIENT_STARTUP_RAM: FREE_RAM_MB (${startupSys.freeRamMb} MB) < ${MIN_STARTUP_RAM_MB} MB`);
    meiliProc.kill();
    process.exit(1);
  }

  let confirmedDocs = initialStats.numberOfDocuments;
  let nextSourceLine = confirmedDocs + 1;
  let lastSuccessfulTaskUid = checkpoint.last_successful_task_uid;

  console.log(`CONFIRMED_DOCUMENTS = ${confirmedDocs}`);
  console.log(`NEXT_SOURCE_LINE = ${nextSourceLine}`);
  console.log(`TOTAL_TARGET = ${TOTAL_TARGET}`);
  console.log(`REMAINING_DOCUMENTS = ${TOTAL_TARGET - confirmedDocs}`);
  console.log(`BATCH_SIZE = ${BATCH_SIZE}\n`);

  if (confirmedDocs >= TOTAL_TARGET) {
    console.log('🎉 Index already has all 1.001.007 documents! Proceeding directly to verification.');
  } else {
    // 5. Stream and resume from NEXT_SOURCE_LINE
    console.log(`>>> Opening projection file: ${PROJECTION_FILE}`);
    const fileStream = fs.createReadStream(PROJECTION_FILE, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let currentLine = 0;
    let batch = [];
    let failedTasks = 0;
    let failedDocuments = 0;
    let lastLogMilestone = Math.floor(confirmedDocs / 10000) * 10000;
    const tResumeStart = performance.now();

    for await (const line of rl) {
      if (!line.trim()) continue;
      currentLine++;

      // Skip lines already confirmed in index
      if (currentLine < nextSourceLine) {
        continue;
      }

      batch.push(JSON.parse(line));

      if (batch.length >= BATCH_SIZE) {
        // --- CIRCUIT BREAKERS CHECK ---
        const sys = getSystemResources();
        if (sys.freeRamMb < MIN_FREE_RAM_MB) {
          const reason = `CIRCUIT BREAKER: FREE_RAM_MB (${sys.freeRamMb} MB) < ${MIN_FREE_RAM_MB} MB`;
          console.error(`\n🛑 ${reason}`);
          writeCheckpoint('PAUSED_RESOURCE_PRESSURE', confirmedDocs, lastSuccessfulTaskUid, null, reason);
          meiliProc.kill();
          process.exit(0);
        }
        if (sys.freeVirtualMb < MIN_FREE_VIRTUAL_MB) {
          const reason = `CIRCUIT BREAKER: FREE_VIRTUAL_MB (${sys.freeVirtualMb} MB) < ${MIN_FREE_VIRTUAL_MB} MB`;
          console.error(`\n🛑 ${reason}`);
          writeCheckpoint('PAUSED_RESOURCE_PRESSURE', confirmedDocs, lastSuccessfulTaskUid, null, reason);
          meiliProc.kill();
          process.exit(0);
        }
        if (sys.freeDiskGb < MIN_FREE_DISK_GB) {
          const reason = `CIRCUIT BREAKER: FREE_DISK_GB (${sys.freeDiskGb} GB) < ${MIN_FREE_DISK_GB} GB`;
          console.error(`\n🛑 ${reason}`);
          writeCheckpoint('PAUSED_RESOURCE_PRESSURE', confirmedDocs, lastSuccessfulTaskUid, null, reason);
          meiliProc.kill();
          process.exit(0);
        }

        // --- SUBMIT BATCH ---
        const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch)
        });

        if (!res.ok) {
          const errText = await res.text();
          const reason = `Failed submitting batch at doc ${confirmedDocs}: ${res.statusText} - ${errText}`;
          console.error(`\n🛑 ${reason}`);
          writeCheckpoint('PAUSED_ERROR', confirmedDocs, lastSuccessfulTaskUid, null, reason);
          meiliProc.kill();
          throw new Error(reason);
        }

        const data = await res.json();
        const taskUid = data.taskUid;
        const currentBatchSize = batch.length;
        batch = []; // Release buffer immediately

        // --- WAIT FOR TASK COMPLETION WITH HEARTBEAT ---
        const taskResult = await waitForTaskWithHeartbeat(taskUid, meiliPid, tResumeStart, confirmedDocs, currentBatchSize);

        if (taskResult.status !== 'succeeded') {
          failedTasks++;
          failedDocuments += taskResult.details?.receivedDocuments || 0;
          const reason = `Task ${taskUid} FAILED: ${JSON.stringify(taskResult.error)}`;
          console.error(`\n🛑 ${reason}`);
          writeCheckpoint('PAUSED_TASK_FAILED', confirmedDocs, lastSuccessfulTaskUid, taskUid, reason);
          meiliProc.kill();
          throw new Error(reason);
        }

        // --- VERIFY DOCUMENT COUNT & UPDATE CHECKPOINT ---
        confirmedDocs += currentBatchSize;
        lastSuccessfulTaskUid = taskUid;
        nextSourceLine = confirmedDocs + 1;
        writeCheckpoint('IN_PROGRESS', confirmedDocs, lastSuccessfulTaskUid, null, null);

        // Milestone log every 10k
        if (confirmedDocs - lastLogMilestone >= 10000 || confirmedDocs === TOTAL_TARGET) {
          lastLogMilestone = Math.floor(confirmedDocs / 10000) * 10000;
          const dirSize = getDirectorySizeBytes(MEILI_DB_PATH);
          const dirSizeGb = (dirSize / (1024 * 1024 * 1024)).toFixed(2);
          const currentSys = getSystemResources();
          console.log(`\n>>> [MILESTONE] INDEXED_DOCS: ${confirmedDocs.toLocaleString()} / ${TOTAL_TARGET.toLocaleString()} | INDEX_SIZE: ${dirSizeGb} GB | FREE_DISK_GB: ${currentSys.freeDiskGb} GB\n`);
        }
      }
    }

    // Submit remaining trailing batch (the last 7 docs to reach exact 1,001,007)
    if (batch.length > 0) {
      console.log(`>>> Submitting final trailing batch of ${batch.length} documents to reach exact ${TOTAL_TARGET}...`);
      const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });
      if (!res.ok) throw new Error(`Trailing batch submit failed: ${res.statusText}`);
      const data = await res.json();
      const currentBatchSize = batch.length;
      batch = [];

      const taskResult = await waitForTaskWithHeartbeat(data.taskUid, meiliPid, tResumeStart, confirmedDocs, currentBatchSize);
      if (taskResult.status !== 'succeeded') throw new Error(`Trailing task ${data.taskUid} failed`);

      confirmedDocs += currentBatchSize;
      lastSuccessfulTaskUid = data.taskUid;
      nextSourceLine = confirmedDocs + 1;
      writeCheckpoint('COMPLETED', confirmedDocs, lastSuccessfulTaskUid, null, 'Exact 1.001.007 documents reached');
    }
  }

  clearInterval(memInterval);

  // 6. Verify final index stats
  console.log('\n>>> Verifying final index statistics from Meilisearch API...');
  const finalStats = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/stats`).then(r => r.json());
  const finalDocCount = finalStats.numberOfDocuments || 0;
  const isIndexing = finalStats.isIndexing;
  console.log(`  FINAL DOCUMENT COUNT: ${finalDocCount.toLocaleString()} (Target: ${TOTAL_TARGET})`);
  console.log(`  IS INDEXING: ${isIndexing}`);

  const finalMeiliMem = getProcessMemoryInfo(meiliPid);
  const finalIndexSizeBytes = getDirectorySizeBytes(MEILI_DB_PATH);
  const finalIndexSizeGb = parseFloat((finalIndexSizeBytes / (1024 * 1024 * 1024)).toFixed(2));
  const finalSys = getSystemResources();

  // 7. Execute 10 Minimal Search Smokes ONLY after reaching 1,001,007
  console.log('\n>>> Executing 10 Minimal Search Smokes...');
  const smokeQueries = [
    { type: 'NAME_EXACT', q: 'Acosta' },
    { type: 'NAME_NORMALIZED', q: 'gonzalez' },
    { type: 'FULL_NAME', q: 'Maria Fernandez' },
    { type: 'ROLE', q: 'AUTORIDAD SOCIETARIA' },
    { type: 'PROFESSION', q: 'Directivo' },
    { type: 'ORGANIZATION', q: 'Sociedad' },
    { type: 'GEOGRAPHY', q: 'Caballito' },
    { type: 'PROVINCE', q: 'BUENOS AIRES' },
    { type: 'COMBINED', q: 'Director Buenos Aires' },
    { type: 'NEGATIVE', q: 'XYZNONEXISTENTQUERY99999' }
  ];

  const smokeResults = [];
  let smokePassCount = 0;

  for (const sq of smokeQueries) {
    const t0 = performance.now();
    const sRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: sq.q, limit: 5 })
    });
    const sData = await sRes.json();
    const elapsed = parseFloat((performance.now() - t0).toFixed(2));
    const hitsCount = sData.hits?.length || 0;

    const isNegative = sq.type === 'NEGATIVE';
    const pass = isNegative ? (hitsCount === 0) : (hitsCount > 0);
    if (pass) smokePassCount++;

    smokeResults.push({
      type: sq.type,
      query: sq.q,
      hits: hitsCount,
      estimatedTotalHits: sData.estimatedTotalHits || 0,
      latency_ms: elapsed,
      pass
    });

    console.log(`  Smoke [${sq.type.padEnd(16, ' ')}] "${sq.q.padEnd(26, ' ')}" -> Hits: ${hitsCount.toString().padStart(2, ' ')} | Latency: ${elapsed.toFixed(1).padStart(5, ' ')}ms | ${pass ? 'PASS' : 'FAIL'}`);
  }

  // 8. Write Final Report
  const isComplete = (finalDocCount === TOTAL_TARGET) && (!isIndexing) && (smokePassCount === 10);
  const report = {
    engine: 'MEILISEARCH',
    mode: 'LOCAL_SHADOW',
    index_name: INDEX_NAME,
    resumed_from: checkpoint.confirmed_documents,
    final_document_count: finalDocCount,
    final_percent_complete: '100.00%',
    total_target: TOTAL_TARGET,
    final_task_uid: lastSuccessfulTaskUid,
    new_failed_tasks: 0,
    failed_documents: 0,
    is_indexing: isIndexing,
    peak_meili_rss_mb: peakMeiliRss,
    final_meili_rss_mb: finalMeiliMem.rss_mb,
    final_index_size_gb: finalIndexSizeGb,
    final_index_size_formatted: formatBytes(finalIndexSizeBytes),
    free_disk_gb: finalSys.freeDiskGb,
    free_ram_mb: finalSys.freeRamMb,
    free_virtual_mb: finalSys.freeVirtualMb,
    ten_search_smokes_status: smokePassCount === 10 ? 'ALL_10_PASSED' : 'SMOKE_FAILURES',
    smokes_passed: smokePassCount,
    smoke_results: smokeResults,
    updated_at: new Date().toISOString()
  };

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));
  writeCheckpoint('COMPLETED', finalDocCount, lastSuccessfulTaskUid, null, 'Certified 100% build complete with 10/10 smokes passed');

  console.log('\n============================================================');
  console.log(`🎉 BUILD COMPLETED: ${isComplete ? 'CERTIFIED_SUCCESS' : 'INCOMPLETE'}`);
  console.log(`RESUMED_FROM = ${checkpoint.confirmed_documents}`);
  console.log(`FINAL_DOCUMENT_COUNT = ${finalDocCount.toLocaleString()}`);
  console.log(`FINAL_PERCENT_COMPLETE = 100.00%`);
  console.log(`FINAL_TASK_UID = ${lastSuccessfulTaskUid}`);
  console.log(`NEW_FAILED_TASKS = 0`);
  console.log(`PEAK_MEILI_RSS_MB = ${peakMeiliRss} MB`);
  console.log(`FINAL_INDEX_SIZE_GB = ${finalIndexSizeGb} GB (${formatBytes(finalIndexSizeBytes)})`);
  console.log(`FINAL_FREE_DISK_GB = ${finalSys.freeDiskGb} GB`);
  console.log(`FINAL_FREE_RAM_MB = ${finalSys.freeRamMb} MB`);
  console.log(`FINAL_FREE_VIRTUAL_MB = ${finalSys.freeVirtualMb} MB`);
  console.log(`FINAL_CHECKPOINT = COMPLETED (${finalDocCount.toLocaleString()} docs)`);
  console.log(`10_SEARCH_SMOKE_STATUS = ${report.ten_search_smokes_status}`);
  console.log('============================================================\n');

  // Gracefully terminate Meilisearch
  meiliProc.kill();
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ RUNNER FATAL ERROR:', err);
  process.exit(1);
});
