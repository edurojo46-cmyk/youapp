import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

const MEILI_URL = 'http://127.0.0.1:7700';
const BENCHMARK_INDEX = 'atlas_stage3i_meili_benchmark';
const PROD_INDEX = 'atlas_people_discovery_gate32_delta';
const DOCS_CACHE_PATH = 'reports/atlas/discovery/stage3i_cached_docs_20k.json';

function hashFile(filepath) {
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function parseDurationToMs(isoDuration) {
  if (!isoDuration) return 0;
  // PT11.823169800S or PT0.00123S
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!match) return 0;
  const hours = parseFloat(match[1] || 0);
  const minutes = parseFloat(match[2] || 0);
  const seconds = parseFloat(match[3] || 0);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function getMeiliProcessStats() {
  try {
    const raw = execSync('powershell -NoProfile -Command "Get-Process meilisearch -ErrorAction SilentlyContinue | Format-List Id, CPU, WorkingSet64"', { encoding: 'utf8', timeout: 3000 });
    const map = {};
    for (const line of raw.split('\n')) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const k = line.substring(0, idx).trim();
        const v = line.substring(idx + 1).trim().replace(',', '.');
        if (k) map[k] = parseFloat(v);
      }
    }
    if (map.Id) {
      return {
        pid: map.Id,
        cpuTotalSeconds: map.CPU || 0,
        workingSetBytes: map.WorkingSet64 || 0,
        workingSetMB: parseFloat(((map.WorkingSet64 || 0) / (1024 * 1024)).toFixed(2))
      };
    }
  } catch (e) {
    return null;
  }
  return null;
}

class ResourceSampler {
  constructor(intervalMs = 1000) {
    this.intervalMs = intervalMs;
    this.samples = [];
    this.timer = null;
    this.lastStats = null;
    this.lastTimestamp = 0;
  }

  start() {
    this.samples = [];
    this.lastStats = getMeiliProcessStats();
    this.lastTimestamp = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      const currentStats = getMeiliProcessStats();
      if (currentStats && this.lastStats) {
        const dtSec = (now - this.lastTimestamp) / 1000;
        const dCpuSec = currentStats.cpuTotalSeconds - this.lastStats.cpuTotalSeconds;
        const cpuUtilPct = dtSec > 0 ? (dCpuSec / dtSec) * 100 : 0;
        this.samples.push({
          timestamp: new Date(now).toISOString(),
          pid: currentStats.pid,
          cpuUtilPct: parseFloat(cpuUtilPct.toFixed(2)),
          workingSetMB: currentStats.workingSetMB,
          workingSetBytes: currentStats.workingSetBytes
        });
      }
      this.lastStats = currentStats;
      this.lastTimestamp = now;
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.samples;
  }
}

async function pollMeiliTask(taskUid, timeoutMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const data = await res.json();
    if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
      return data;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`Timeout polling task ${taskUid}`);
}

async function createOrResetBenchmarkIndex(prodSettings) {
  // 1. Delete if exists
  const delRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, { method: 'DELETE' });
  const delData = await delRes.json();
  if (delData.taskUid) {
    await pollMeiliTask(delData.taskUid);
  }

  // 2. Create index
  const createRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: BENCHMARK_INDEX, primaryKey: 'atlas_person_id' })
  });
  const createData = await createRes.json();
  if (createData.taskUid) {
    await pollMeiliTask(createData.taskUid);
  }

  // 3. Apply cloned settings
  const settingsRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prodSettings)
  });
  const settingsData = await settingsRes.json();
  if (settingsData.taskUid) {
    await pollMeiliTask(settingsData.taskUid);
  }

  // 4. Verify clean state
  const verifyRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/documents?limit=0`);
  const verifyData = await verifyRes.json();
  if (verifyData.total !== 0) {
    throw new Error(`Expected clean index with 0 docs, got ${verifyData.total}`);
  }
}

async function runBenchmarkTest({
  name,
  docs,
  batchCount,
  docsPerBatch,
  mode, // 'BURST' or 'SEQUENTIAL'
  prodSettings
}) {
  console.log(`\n==================================================`);
  console.log(`TEST: ${name} [${batchCount} x ${docsPerBatch}] MODE: ${mode}`);
  console.log(`==================================================`);

  await createOrResetBenchmarkIndex(prodSettings);

  const sampler = new ResourceSampler(1000);
  sampler.start();

  const totalDocs = batchCount * docsPerBatch;
  const batches = [];
  for (let i = 0; i < batchCount; i++) {
    batches.push(docs.slice(i * docsPerBatch, (i + 1) * docsPerBatch));
  }

  const t0 = Date.now();
  let taskUids = [];
  let submitDurationMs = 0;

  if (mode === 'BURST') {
    const submitPromises = batches.map(async (batch, idx) => {
      const res = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });
      const data = await res.json();
      return { idx, taskUid: data.taskUid };
    });
    const results = await Promise.all(submitPromises);
    results.sort((a, b) => a.idx - b.idx);
    taskUids = results.map(r => r.taskUid);
    submitDurationMs = Date.now() - t0;
    console.log(`Burst submitted ${taskUids.length} tasks in ${submitDurationMs} ms (tasks: ${taskUids.join(', ')})`);

    // Wait for all tasks to complete
    for (const uid of taskUids) {
      await pollMeiliTask(uid);
    }
  } else if (mode === 'SEQUENTIAL') {
    for (let i = 0; i < batches.length; i++) {
      const subT0 = Date.now();
      const res = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batches[i])
      });
      const data = await res.json();
      taskUids.push(data.taskUid);
      await pollMeiliTask(data.taskUid);
      console.log(`  Sequential batch ${i + 1}/${batches.length} (task ${data.taskUid}) done in ${Date.now() - subT0} ms`);
    }
    submitDurationMs = Date.now() - t0;
  }

  const tEnd = Date.now();
  const totalWallDurationMs = tEnd - t0;
  const resourceSamples = sampler.stop();

  // Fetch task forensic details
  const taskDetails = [];
  for (const uid of taskUids) {
    const res = await fetch(`${MEILI_URL}/tasks/${uid}`);
    const data = await res.json();
    taskDetails.push({
      taskUid: data.uid,
      batchUid: data.batchUid,
      status: data.status,
      type: data.type,
      enqueuedAt: data.enqueuedAt,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      durationIso: data.duration,
      durationMs: parseDurationToMs(data.duration),
      receivedDocuments: data.details?.receivedDocuments || 0,
      indexedDocuments: data.details?.indexedDocuments || 0,
      error: data.error
    });
  }

  // Calculate task queue and processing metrics
  const startTimes = taskDetails.map(t => new Date(t.startedAt).getTime()).filter(Boolean);
  const finishTimes = taskDetails.map(t => new Date(t.finishedAt).getTime()).filter(Boolean);
  const enqueueTimes = taskDetails.map(t => new Date(t.enqueuedAt).getTime()).filter(Boolean);

  const firstEnqueue = Math.min(...enqueueTimes);
  const firstStart = Math.min(...startTimes);
  const lastFinish = Math.max(...finishTimes);

  const queueDurationMs = firstStart > firstEnqueue ? firstStart - firstEnqueue : 0;
  const indexProcessingDurationMs = lastFinish - firstStart;

  const docsPerSec = totalDocs / (totalWallDurationMs / 1000);
  const uniqueBatchUids = [...new Set(taskDetails.map(t => t.batchUid).filter(Boolean))];
  const failures = taskDetails.filter(t => t.status !== 'succeeded').length;

  // Verify correctness in index
  const verifyRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/documents?limit=0`);
  const verifyData = await verifyRes.json();
  const visibleCount = verifyData.total;

  // Verify sample queries
  let queryPass = true;
  for (let s = 0; s < 5; s++) {
    const sampleDoc = docs[s * Math.floor(docs.length / 5)];
    const qRes = await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: sampleDoc.display_name, limit: 5 })
    });
    const qData = await qRes.json();
    const found = qData.hits.some(h => h.atlas_person_id === sampleDoc.atlas_person_id);
    if (!found) {
      queryPass = false;
    }
  }

  const result = {
    testName: name,
    batchCount,
    docsPerBatch,
    totalDocuments: totalDocs,
    mode,
    submitDurationMs,
    queueDurationMs,
    indexProcessingDurationMs,
    totalWallDurationMs,
    docsPerSec: parseFloat(docsPerSec.toFixed(2)),
    taskFailures: failures,
    internalBatchesExecuted: uniqueBatchUids.length,
    batchUids: uniqueBatchUids,
    visibleDocumentsInIndex: visibleCount,
    countExact: visibleCount === totalDocs,
    queryVerificationPass: queryPass,
    taskDetails,
    resourceSummary: {
      samplesCount: resourceSamples.length,
      maxCpuPct: resourceSamples.length ? Math.max(...resourceSamples.map(s => s.cpuUtilPct)) : 0,
      avgCpuPct: resourceSamples.length ? parseFloat((resourceSamples.reduce((a, s) => a + s.cpuUtilPct, 0) / resourceSamples.length).toFixed(2)) : 0,
      maxWorkingSetMB: resourceSamples.length ? Math.max(...resourceSamples.map(s => s.workingSetMB)) : 0,
      avgWorkingSetMB: resourceSamples.length ? parseFloat((resourceSamples.reduce((a, s) => a + s.workingSetMB, 0) / resourceSamples.length).toFixed(2)) : 0
    }
  };

  console.log(`RESULT: ${name}: Wall Duration: ${(totalWallDurationMs / 1000).toFixed(3)}s | Throughput: ${result.docsPerSec} docs/sec | Internal Batches: ${result.internalBatchesExecuted} | Visible: ${visibleCount}/${totalDocs} (Exact: ${result.countExact})`);

  return { result, resourceSamples };
}

async function main() {
  console.log('=== ATLAS STAGE 3I: MEILISEARCH BENCHMARK INITIALIZING ===');

  // Load cached production documents
  if (!fs.existsSync(DOCS_CACHE_PATH)) {
    throw new Error(`Cached documents not found at ${DOCS_CACHE_PATH}`);
  }
  const allDocs = JSON.parse(fs.readFileSync(DOCS_CACHE_PATH, 'utf8'));
  console.log(`Loaded ${allDocs.length} representative production documents.`);

  // 1. Fetch Production Settings
  const settingsRes = await fetch(`${MEILI_URL}/indexes/${PROD_INDEX}/settings`);
  const prodSettings = await settingsRes.json();
  console.log('Cloned production settings from', PROD_INDEX);

  // 2. Profile Documents (20,000 and 10,000)
  const sizes20k = allDocs.map(d => Buffer.byteLength(JSON.stringify(d), 'utf8')).sort((a, b) => a - b);
  const sum20k = sizes20k.reduce((a, b) => a + b, 0);

  const docs10k = allDocs.slice(0, 10000);
  const sizes10k = docs10k.map(d => Buffer.byteLength(JSON.stringify(d), 'utf8')).sort((a, b) => a - b);
  const sum10k = sizes10k.reduce((a, b) => a + b, 0);

  const payloadProfile = {
    generated_at: new Date().toISOString(),
    source_index: PROD_INDEX,
    document_sample_20k: {
      document_count: allDocs.length,
      total_payload_bytes: sum20k,
      average_bytes: parseFloat((sum20k / allDocs.length).toFixed(2)),
      min_bytes: sizes20k[0],
      max_bytes: sizes20k[sizes20k.length - 1],
      p50_bytes: sizes20k[Math.floor(sizes20k.length * 0.50)],
      p90_bytes: sizes20k[Math.floor(sizes20k.length * 0.90)],
      p95_bytes: sizes20k[Math.floor(sizes20k.length * 0.95)],
      p99_bytes: sizes20k[Math.floor(sizes20k.length * 0.99)]
    },
    document_sample_10k: {
      document_count: docs10k.length,
      total_payload_bytes: sum10k,
      average_bytes: parseFloat((sum10k / docs10k.length).toFixed(2)),
      min_bytes: sizes10k[0],
      max_bytes: sizes10k[sizes10k.length - 1],
      p50_bytes: sizes10k[Math.floor(sizes10k.length * 0.50)],
      p90_bytes: sizes10k[Math.floor(sizes10k.length * 0.90)],
      p95_bytes: sizes10k[Math.floor(sizes10k.length * 0.95)],
      p99_bytes: sizes10k[Math.floor(sizes10k.length * 0.99)]
    },
    document_schema_fields: Object.keys(allDocs[0])
  };

  const payloadProfilePath = 'reports/atlas/discovery/atlas_stage3i_document_payload_profile_v1.json';
  fs.writeFileSync(payloadProfilePath, JSON.stringify(payloadProfile, null, 2));
  console.log(`Saved Document Payload Profile to ${payloadProfilePath}`);

  // 3. Environment Audit
  const versionRes = await fetch(`${MEILI_URL}/version`);
  const versionData = await versionRes.json();

  const envAudit = {
    generated_at: new Date().toISOString(),
    meilisearch_version: versionData.pkgVersion,
    commit_sha: versionData.commitSha,
    commit_date: versionData.commitDate,
    launch_command: 'bin\\meilisearch.exe --db-path data_discovery_delta.ms --no-analytics',
    http_addr: 'http://127.0.0.1:7700',
    db_path: 'data_discovery_delta.ms',
    default_max_indexing_memory: '7.6218770341947675 GiB',
    default_max_indexing_threads: 4,
    hardware_specs: {
      cpu_model: 'Intel(R) Core(TM) i5-8250U CPU @ 1.60GHz',
      physical_cores: 4,
      logical_processors: 8,
      total_ram_gb: 12,
      disk_model: 'WDC WDS120G2G0B-00EPW0',
      disk_media_type: 'SSD (SATA)',
      disk_bus: 'SATA',
      filesystem: 'NTFS',
      drive_letter: 'C:'
    },
    production_index: {
      uid: PROD_INDEX,
      primary_key: 'atlas_person_id',
      current_documents: 373629,
      settings: prodSettings
    },
    benchmark_index: {
      uid: BENCHMARK_INDEX,
      primary_key: 'atlas_person_id',
      settings_cloned_from_production: true
    }
  };

  const envAuditPath = 'reports/atlas/discovery/atlas_stage3i_meili_environment_v1.json';
  fs.writeFileSync(envAuditPath, JSON.stringify(envAudit, null, 2));
  console.log(`Saved Environment Audit to ${envAuditPath}`);

  // 4. RUN BASELINE & BATCH SHAPE MATRIX
  const batchMatrixResults = [];
  const allResourceSamples = {};
  const allTaskForensics = {};

  // Test 1: 10 x 1000 (Burst) - Baseline Reproduction
  const r10x1000Burst = await runBenchmarkTest({
    name: 'BASELINE_10x1000_BURST',
    docs: docs10k,
    batchCount: 10,
    docsPerBatch: 1000,
    mode: 'BURST',
    prodSettings
  });
  batchMatrixResults.push(r10x1000Burst.result);
  allResourceSamples['BASELINE_10x1000_BURST'] = r10x1000Burst.resourceSamples;
  allTaskForensics['BASELINE_10x1000_BURST'] = r10x1000Burst.result.taskDetails;

  // Test 2: 5 x 2000 (Burst)
  const r5x2000Burst = await runBenchmarkTest({
    name: 'SHAPE_5x2000_BURST',
    docs: docs10k,
    batchCount: 5,
    docsPerBatch: 2000,
    mode: 'BURST',
    prodSettings
  });
  batchMatrixResults.push(r5x2000Burst.result);
  allResourceSamples['SHAPE_5x2000_BURST'] = r5x2000Burst.resourceSamples;
  allTaskForensics['SHAPE_5x2000_BURST'] = r5x2000Burst.result.taskDetails;

  // Test 3: 4 x 2500 (Burst)
  const r4x2500Burst = await runBenchmarkTest({
    name: 'SHAPE_4x2500_BURST',
    docs: docs10k,
    batchCount: 4,
    docsPerBatch: 2500,
    mode: 'BURST',
    prodSettings
  });
  batchMatrixResults.push(r4x2500Burst.result);
  allResourceSamples['SHAPE_4x2500_BURST'] = r4x2500Burst.resourceSamples;
  allTaskForensics['SHAPE_4x2500_BURST'] = r4x2500Burst.result.taskDetails;

  // Test 4: 2 x 5000 (Burst)
  const r2x5000Burst = await runBenchmarkTest({
    name: 'SHAPE_2x5000_BURST',
    docs: docs10k,
    batchCount: 2,
    docsPerBatch: 5000,
    mode: 'BURST',
    prodSettings
  });
  batchMatrixResults.push(r2x5000Burst.result);
  allResourceSamples['SHAPE_2x5000_BURST'] = r2x5000Burst.resourceSamples;
  allTaskForensics['SHAPE_2x5000_BURST'] = r2x5000Burst.result.taskDetails;

  // Test 5: 1 x 10000 (Single Task)
  const r1x10000 = await runBenchmarkTest({
    name: 'SHAPE_1x10000_SINGLE_TASK',
    docs: docs10k,
    batchCount: 1,
    docsPerBatch: 10000,
    mode: 'BURST',
    prodSettings
  });
  batchMatrixResults.push(r1x10000.result);
  allResourceSamples['SHAPE_1x10000_SINGLE_TASK'] = r1x10000.resourceSamples;
  allTaskForensics['SHAPE_1x10000_SINGLE_TASK'] = r1x10000.result.taskDetails;

  // Test 6: 1 x 20000 (Single Task 20K)
  const r1x20000 = await runBenchmarkTest({
    name: 'SHAPE_1x20000_SINGLE_TASK',
    docs: allDocs,
    batchCount: 1,
    docsPerBatch: 20000,
    mode: 'BURST',
    prodSettings
  });
  batchMatrixResults.push(r1x20000.result);
  allResourceSamples['SHAPE_1x20000_SINGLE_TASK'] = r1x20000.resourceSamples;
  allTaskForensics['SHAPE_1x20000_SINGLE_TASK'] = r1x20000.result.taskDetails;

  // 5. SUBMISSION MODE MATRIX
  const submissionMatrixResults = [];

  // Sequential 10 x 1000
  const r10x1000Seq = await runBenchmarkTest({
    name: 'MODE_10x1000_SEQUENTIAL',
    docs: docs10k,
    batchCount: 10,
    docsPerBatch: 1000,
    mode: 'SEQUENTIAL',
    prodSettings
  });
  submissionMatrixResults.push({
    shape: '10x1000',
    mode: 'SEQUENTIAL',
    result: r10x1000Seq.result
  });
  submissionMatrixResults.push({
    shape: '10x1000',
    mode: 'BURST',
    result: r10x1000Burst.result
  });
  allResourceSamples['MODE_10x1000_SEQUENTIAL'] = r10x1000Seq.resourceSamples;
  allTaskForensics['MODE_10x1000_SEQUENTIAL'] = r10x1000Seq.result.taskDetails;

  // Sequential 5 x 2000
  const r5x2000Seq = await runBenchmarkTest({
    name: 'MODE_5x2000_SEQUENTIAL',
    docs: docs10k,
    batchCount: 5,
    docsPerBatch: 2000,
    mode: 'SEQUENTIAL',
    prodSettings
  });
  submissionMatrixResults.push({
    shape: '5x2000',
    mode: 'SEQUENTIAL',
    result: r5x2000Seq.result
  });
  submissionMatrixResults.push({
    shape: '5x2000',
    mode: 'BURST',
    result: r5x2000Burst.result
  });
  allResourceSamples['MODE_5x2000_SEQUENTIAL'] = r5x2000Seq.resourceSamples;
  allTaskForensics['MODE_5x2000_SEQUENTIAL'] = r5x2000Seq.result.taskDetails;

  // Save Batch Shape Matrix Artifact
  const batchMatrixPath = 'reports/atlas/discovery/atlas_stage3i_batch_shape_matrix_v1.json';
  fs.writeFileSync(batchMatrixPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    benchmark_index: BENCHMARK_INDEX,
    matrix: batchMatrixResults
  }, null, 2));
  console.log(`Saved Batch Shape Matrix to ${batchMatrixPath}`);

  // Save Submission Mode Matrix Artifact
  const subMatrixPath = 'reports/atlas/discovery/atlas_stage3i_submission_mode_matrix_v1.json';
  fs.writeFileSync(subMatrixPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    benchmark_index: BENCHMARK_INDEX,
    matrix: submissionMatrixResults
  }, null, 2));
  console.log(`Saved Submission Mode Matrix to ${subMatrixPath}`);

  // Save Task Forensics Artifact
  const taskForensicsPath = 'reports/atlas/discovery/atlas_stage3i_task_forensics_v1.json';
  fs.writeFileSync(taskForensicsPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    benchmark_index: BENCHMARK_INDEX,
    forensics: allTaskForensics
  }, null, 2));
  console.log(`Saved Task Forensics to ${taskForensicsPath}`);

  // Save Resource Saturation Artifact
  const resourceSatPath = 'reports/atlas/discovery/atlas_stage3i_resource_saturation_v1.json';
  fs.writeFileSync(resourceSatPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    benchmark_index: BENCHMARK_INDEX,
    samples_by_test: allResourceSamples
  }, null, 2));
  console.log(`Saved Resource Saturation to ${resourceSatPath}`);

  // 6. SELECT WINNER CONFIGURATION & REPEAT 3 TIMES
  // Find highest docsPerSec among 10k configurations
  const eligible10kTests = batchMatrixResults.filter(r => r.totalDocuments === 10000);
  eligible10kTests.sort((a, b) => b.docsPerSec - a.docsPerSec);
  const winningConfig = eligible10kTests[0];

  console.log(`\n==================================================`);
  console.log(`WINNING CONFIGURATION IDENTIFIED: ${winningConfig.testName} (${winningConfig.docsPerSec} docs/sec)`);
  console.log(`Executing 3 validation runs (RUN1, RUN2, RUN3) for stability...`);
  console.log(`==================================================`);

  const repeatRuns = [];
  for (let r = 1; r <= 3; r++) {
    const runRes = await runBenchmarkTest({
      name: `WINNER_REPEAT_RUN_${r}`,
      docs: docs10k,
      batchCount: winningConfig.batchCount,
      docsPerBatch: winningConfig.docsPerBatch,
      mode: winningConfig.mode,
      prodSettings
    });
    repeatRuns.push(runRes.result);
  }

  const repeatDocsPerSec = repeatRuns.map(r => r.docsPerSec).sort((a, b) => a - b);
  const medianDocsPerSec = repeatDocsPerSec[1];
  const minDocsPerSec = repeatDocsPerSec[0];
  const maxDocsPerSec = repeatDocsPerSec[2];

  const maxSafeConfigArtifact = {
    generated_at: new Date().toISOString(),
    selected_config: {
      test_name: winningConfig.testName,
      batch_count: winningConfig.batchCount,
      docs_per_batch: winningConfig.docsPerBatch,
      submission_mode: winningConfig.mode,
      total_documents: 10000
    },
    repeat_validation_runs: {
      run1_docs_per_sec: repeatRuns[0].docsPerSec,
      run2_docs_per_sec: repeatRuns[1].docsPerSec,
      run3_docs_per_sec: repeatRuns[2].docsPerSec,
      median_docs_per_sec: medianDocsPerSec,
      min_docs_per_sec: minDocsPerSec,
      max_docs_per_sec: maxDocsPerSec
    },
    detailed_runs: repeatRuns
  };

  const maxSafeConfigPath = 'reports/atlas/discovery/atlas_stage3i_max_safe_config_v1.json';
  fs.writeFileSync(maxSafeConfigPath, JSON.stringify(maxSafeConfigArtifact, null, 2));
  console.log(`Saved Max Safe Config to ${maxSafeConfigPath}`);

  // 7. VERDICT ARTIFACT
  const pass30Min = medianDocsPerSec >= 555.56;
  const pass25Min = medianDocsPerSec >= 666.67;
  const pass20Min = medianDocsPerSec >= 833.33;
  const pass15Min = medianDocsPerSec >= 1111.11;

  const baseline10x1000 = r10x1000Burst.result.docsPerSec;
  const single1x10000 = r1x10000.result.docsPerSec;
  const single1x20000 = r1x20000.result.docsPerSec;

  const verdictArtifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3I_MEILISEARCH_PHYSICAL_CEILING',
    meili_version: versionData.pkgVersion,
    document_size_avg_bytes: payloadProfile.document_sample_10k.average_bytes,
    baseline_10x1000_docs_sec: baseline10x1000,
    single_task_1x10000_docs_sec: single1x10000,
    single_task_1x20000_docs_sec: single1x20000,
    best_batch_shape: `${winningConfig.batchCount}x${winningConfig.docsPerBatch}`,
    best_submission_mode: winningConfig.mode,
    true_indexing_concurrency: 1, // Meilisearch indexes 1 task/batch at a time per index
    meili_max_safe_docs_sec: medianDocsPerSec,
    targets: {
      target_30_min_555_56: { required: 555.56, achieved: medianDocsPerSec, pass: pass30Min },
      target_25_min_666_67: { required: 666.67, achieved: medianDocsPerSec, pass: pass25Min },
      target_20_min_833_33: { required: 833.33, achieved: medianDocsPerSec, pass: pass20Min },
      target_15_min_1111_11: { required: 1111.11, achieved: medianDocsPerSec, pass: pass15Min }
    },
    verdict: {
      current_single_meili_topology_sufficient: pass30Min,
      producer_integrated_regression_open: true,
      classification: pass25Min ? '25_MIN_MEILI_CAPACITY_CONFIRMED' : (pass30Min ? '30_MIN_MEILI_CAPACITY_CONFIRMED' : 'CURRENT_SINGLE_MEILI_TOPOLOGY_BELOW_NORTH_STAR')
    }
  };

  const verdictPath = 'reports/atlas/discovery/atlas_stage3i_throughput_verdict_v1.json';
  fs.writeFileSync(verdictPath, JSON.stringify(verdictArtifact, null, 2));
  console.log(`Saved Throughput Verdict to ${verdictPath}`);

  // Final cleanup of isolated benchmark index
  console.log('Tearing down isolated benchmark index...');
  await fetch(`${MEILI_URL}/indexes/${BENCHMARK_INDEX}`, { method: 'DELETE' });

  // Print Hashing Manifest
  const artifactPaths = [
    envAuditPath,
    payloadProfilePath,
    batchMatrixPath,
    subMatrixPath,
    taskForensicsPath,
    resourceSatPath,
    maxSafeConfigPath,
    verdictPath
  ];

  console.log('\n==================================================');
  console.log('ALL ARTIFACTS GENERATED AND HASHED');
  console.log('==================================================');
  for (const ap of artifactPaths) {
    const hash = hashFile(ap);
    console.log(`${hash}  ${ap}`);
  }
}

main().catch(err => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});
