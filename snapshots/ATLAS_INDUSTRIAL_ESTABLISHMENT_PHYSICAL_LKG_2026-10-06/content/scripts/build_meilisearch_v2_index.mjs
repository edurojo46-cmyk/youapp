import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { spawn, execSync } from 'child_process';

// ============================================================
// PATHS & CONSTANTS
// ============================================================
const PROJECTION_DIR = path.resolve('reports/atlas/search');
const PROJECTION_FILE = path.join(PROJECTION_DIR, 'atlas_canonical_people_projection_v2.jsonl');
const EXPECTED_SHA256 = '6a6ca1d6745b59d417a0684270a327285b2be6e597f0a2f4dce748063d03f446';
const OUTPUT_REPORT_PATH = path.join(PROJECTION_DIR, 'atlas_meilisearch_people_v2_full_index_build.json');
const SERVER_LOG_PATH = path.join(PROJECTION_DIR, 'meilisearch_server.log');

const MEILI_EXE = path.resolve('bin/meilisearch.exe');
const MEILI_DB_PATH = path.resolve('data_v2_shadow.ms');
const MEILI_PORT = 7700;
const MEILI_URL = `http://127.0.0.1:${MEILI_PORT}`;
const INDEX_NAME = 'atlas_people_v2_shadow';

// ============================================================
// HELPERS
// ============================================================
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
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
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

function getProcessMemoryInfo(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { encoding: 'utf8' }).trim();
    if (!out || out.includes('INFORMACI') || out.includes('INFO:')) return { rss_mb: 0, peak_rss_mb: 0 };
    const parts = out.split('","');
    if (parts.length >= 5) {
      const memStr = parts[4].replace(/[^0-9]/g, '');
      const kb = parseInt(memStr, 10);
      if (!isNaN(kb)) {
        const mb = parseFloat((kb / 1024).toFixed(2));
        return { rss_mb: mb, peak_rss_mb: mb };
      }
    }
  } catch (e) {}
  return { rss_mb: 0, peak_rss_mb: 0 };
}

async function verifyChecksum(filePath, expected) {
  console.log(`Verifying SHA-256 for ${filePath}...`);
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  const actual = hash.digest('hex');
  if (actual !== expected) {
    throw new Error(`SHA256 MISMATCH! Actual: ${actual} | Expected: ${expected}`);
  }
  console.log(`✅ SHA-256 Verified: ${actual}`);
  return actual;
}

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

async function waitForHealth(timeoutSec = 20) {
  for (let i = 0; i < timeoutSec * 2; i++) {
    try {
      const res = await fetch(`${MEILI_URL}/health`);
      const data = await res.json();
      if (res.status === 200 && data.status === 'available') {
        return true;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function waitForTask(taskUid) {
  while (true) {
    try {
      const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'succeeded') return data;
        if (data.status === 'failed' || data.status === 'canceled') {
          console.error(`Task ${taskUid} ended with status: ${data.status}`, data.error);
          return data;
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
}

// ============================================================
// MAIN PIPELINE
// ============================================================
async function main() {
  const indexBuildStartedAt = new Date().toISOString();
  console.log('============================================================');
  console.log('MEILISEARCH FULL INDEX BUILD V2 (SHADOW MODE - 1.001.007 DOCS)');
  console.log(`Started at: ${indexBuildStartedAt}`);
  console.log('============================================================\n');

  // 1. Verify File SHA256
  await verifyChecksum(PROJECTION_FILE, EXPECTED_SHA256);

  // 2. Terminate any previous Meilisearch instances and clean DB directory
  try {
    execSync('taskkill /F /IM meilisearch.exe', { stdio: 'ignore' });
  } catch (e) {}

  if (fs.existsSync(MEILI_DB_PATH)) {
    console.log(`Cleaning old DB directory: ${MEILI_DB_PATH}`);
    fs.rmSync(MEILI_DB_PATH, { recursive: true, force: true });
  }
  if (fs.existsSync(SERVER_LOG_PATH)) {
    fs.unlinkSync(SERVER_LOG_PATH);
  }

  // 3. Start Fresh Meilisearch Server
  console.log(`\n>>> Starting fresh Meilisearch instance on port ${MEILI_PORT}...`);
  let meiliProc = spawnMeili();
  let meiliPid = meiliProc.pid;
  let peakMeiliRss = 0;

  const isHealthy = await waitForHealth();
  if (!isHealthy) throw new Error('Meilisearch failed to start within timeout');
  console.log(`✅ Meilisearch is HEALTHY on PID ${meiliPid}`);

  // Memory monitor loop
  const memInterval = setInterval(() => {
    const m = getProcessMemoryInfo(meiliPid);
    if (m.peak_rss_mb > peakMeiliRss) peakMeiliRss = m.peak_rss_mb;
    if (m.rss_mb > peakMeiliRss) peakMeiliRss = m.rss_mb;
  }, 2000);

  // 4. Create Index & Configure Settings FIRST on empty index
  console.log(`\n>>> Creating index "${INDEX_NAME}" with primaryKey "atlas_person_id"...`);
  const tSettings0 = performance.now();
  const createRes = await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: INDEX_NAME, primaryKey: 'atlas_person_id' })
  });
  const createData = await createRes.json();
  if (createData.taskUid !== undefined) {
    await waitForTask(createData.taskUid);
  }

  console.log('>>> Configuring Searchable, Filterable and Sortable attributes...');
  const settings = {
    searchableAttributes: [
      'display_name',
      'display_name_normalized',
      'first_name',
      'last_name',
      'role',
      'profession',
      'organization',
      'geography',
      'province',
      'neighborhood',
      'search_text_normalized'
    ],
    filterableAttributes: [
      'atlas_person_id',
      'role',
      'profession',
      'organization',
      'geography',
      'province',
      'neighborhood',
      'evidence_state',
      'source_ids'
    ],
    sortableAttributes: [
      'ranking_weight',
      'last_seen_at'
    ],
    rankingRules: [
      'words',
      'typo',
      'proximity',
      'attribute',
      'sort',
      'exactness'
    ]
  };

  const setRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  });
  const setData = await setRes.json();
  await waitForTask(setData.taskUid);
  const settingsDurationSeconds = parseFloat(((performance.now() - tSettings0) / 1000).toFixed(2));
  console.log(`✅ Settings applied and confirmed on empty index in ${settingsDurationSeconds}s.`);

  // 5. Ingestion in Streaming Batches of 10,000 documents
  console.log('\n>>> Streaming 1.001.007 documents into Meilisearch in sequential batches of 10.000...');
  const fileStream = fs.createReadStream(PROJECTION_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const BATCH_SIZE = 10000;
  let batch = [];
  let submittedCount = 0;
  let failedTasks = 0;
  let failedDocuments = 0;

  const tBuildStart = performance.now();
  let totalSubTimeMs = 0;
  let maxClientRssMb = 0;
  let lastRecycleAt = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    submittedCount++;

    if (batch.length >= BATCH_SIZE) {
      const tPost0 = performance.now();
      const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      });
      totalSubTimeMs += (performance.now() - tPost0);

      if (!res.ok) {
        throw new Error(`Failed submitting batch to Meilisearch: ${res.statusText}`);
      }
      const data = await res.json();
      batch = [];

      // Await task completion
      const taskResult = await waitForTask(data.taskUid);
      if (taskResult.status !== 'succeeded') {
        failedTasks++;
        failedDocuments += taskResult.details?.receivedDocuments || 0;
        console.error(`Task ${data.taskUid} FAILED:`, taskResult.error);
      }

      const clientMem = process.memoryUsage().rss / (1024 * 1024);
      if (clientMem > maxClientRssMb) maxClientRssMb = clientMem;

      // Log progress
      if (submittedCount % 50000 === 0 || submittedCount === 1001007) {
        const el = ((performance.now() - tBuildStart) / 1000).toFixed(1);
        const rate = (submittedCount / (performance.now() - tBuildStart) * 1000).toFixed(0);
        const currentMem = getProcessMemoryInfo(meiliPid);
        console.log(`  Indexed ${submittedCount.toLocaleString()} / 1.001.007 docs (${rate} docs/s, ${el}s elapsed, Meili RAM: ${currentMem.rss_mb} MB, Peak: ${peakMeiliRss.toFixed(1)} MB)...`);
      }

      // Memory-safety recycling: Recycle LMDB page caches every 200,000 documents to guarantee 100% stability
      if (submittedCount - lastRecycleAt >= 200000 && submittedCount < 1000000) {
        console.log(`  [Memory Guard] Gracefully recycling Meilisearch at ${submittedCount.toLocaleString()} docs to reset LMDB cache...`);
        meiliProc.kill();
        await new Promise(r => setTimeout(r, 1500));
        meiliProc = spawnMeili();
        meiliPid = meiliProc.pid;
        const healthy = await waitForHealth();
        if (!healthy) throw new Error('Meilisearch failed to restart during memory recycling');
        lastRecycleAt = submittedCount;
        console.log(`  [Memory Guard] Server recycled on PID ${meiliPid}. Resuming ingestion stream.`);
      }
    }
  }

  // Submit remaining batch
  if (batch.length > 0) {
    const tPost0 = performance.now();
    const res = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch)
    });
    totalSubTimeMs += (performance.now() - tPost0);
    const data = await res.json();
    batch = [];

    const taskResult = await waitForTask(data.taskUid);
    if (taskResult.status !== 'succeeded') {
      failedTasks++;
      failedDocuments += taskResult.details?.receivedDocuments || 0;
      console.error(`Task ${data.taskUid} FAILED:`, taskResult.error);
    }
  }

  const submissionDurationSeconds = parseFloat((totalSubTimeMs / 1000).toFixed(2));
  console.log(`\n✅ All ${submittedCount.toLocaleString()} documents fully submitted and indexed!`);

  const tBuildEnd = performance.now();
  const totalIndexBuildSeconds = parseFloat(((tBuildEnd - tBuildStart) / 1000).toFixed(2));
  const indexDocsPerSecond = parseFloat((submittedCount / totalIndexBuildSeconds).toFixed(2));
  const indexBuildFinishedAt = new Date().toISOString();

  clearInterval(memInterval);

  // 6. Verify Index Document Count & Stats
  console.log('\n>>> Verifying final index statistics from Meilisearch API...');
  const statsRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/stats`);
  const statsData = await statsRes.json();
  const indexedDocuments = statsData.numberOfDocuments || 0;
  console.log(`  Index Document Count: ${indexedDocuments.toLocaleString()} (Expected: 1.001.007)`);
  console.log(`  Is Indexing Currently: ${statsData.isIndexing}`);

  const finalMeiliMem = getProcessMemoryInfo(meiliPid);
  const indexSizeBytes = getDirectorySizeBytes(MEILI_DB_PATH);

  // 7. Sample random ID verification
  console.log('\n>>> Performing sample ID verification across index partitions...');
  const sampleIds = [
    'atlas_arg_per_0000000000000001',
    'disc_conicet_oai_f82435390e79a3cc',
    'atlas_arg_per_0000010000000001',
    'atlas_arg_per_0000050000000001',
    'atlas_arg_per_0000090000000001',
    'atlas_arg_per_0000100000000001'
  ];
  let sampleFound = 0;
  for (const sid of sampleIds) {
    try {
      const docRes = await fetch(`${MEILI_URL}/indexes/${INDEX_NAME}/documents/${sid}`);
      if (docRes.ok) {
        sampleFound++;
      }
    } catch (e) {}
  }
  console.log(`  Sample IDs Verified: ${sampleFound}/${sampleIds.length}`);

  // 8. Execute 10 Minimal Search Smokes
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

    console.log(`  Smoke [${sq.type.padEnd(16, ' ')}] "${sq.query.padEnd(26, ' ')}" -> Hits: ${hitsCount.toString().padStart(2, ' ')} | Latency: ${elapsed.toFixed(1).padStart(5, ' ')}ms | ${pass ? 'PASS' : 'FAIL'}`);
  }

  // 9. Classification & Assembly
  const isComplete = (indexedDocuments === 1001007) && (failedTasks === 0) && (failedDocuments === 0) && (smokePassCount === 10);
  const classification = isComplete ? 'INDEX_BUILD_COMPLETE' : 'INDEX_BUILD_FAIL';

  const report = {
    engine: 'MEILISEARCH',
    mode: 'LOCAL_SHADOW',
    index_name: INDEX_NAME,
    projection_file: PROJECTION_FILE,
    projection_sha256: EXPECTED_SHA256,
    classification: classification,
    status: isComplete ? 'CERTIFIED_COMPLETE' : 'BUILD_FAILED',
    timing: {
      index_build_started_at: indexBuildStartedAt,
      index_build_finished_at: indexBuildFinishedAt,
      settings_seconds: settingsDurationSeconds,
      document_submission_seconds: submissionDurationSeconds,
      total_index_build_seconds: totalIndexBuildSeconds,
      total_time_to_fully_indexed: totalIndexBuildSeconds,
      index_docs_per_second: indexDocsPerSecond
    },
    counts: {
      source_documents: 1001007,
      documents_submitted: submittedCount,
      documents_indexed: indexedDocuments,
      distinct_indexed_ids: indexedDocuments,
      failed_documents: failedDocuments,
      failed_tasks: failedTasks
    },
    resources: {
      peak_meilisearch_rss_mb: peakMeiliRss,
      final_meilisearch_rss_mb: finalMeiliMem.rss_mb,
      peak_client_rss_mb: parseFloat(maxClientRssMb.toFixed(2)),
      index_size_bytes: indexSizeBytes,
      index_size_formatted: formatBytes(indexSizeBytes)
    },
    verification: {
      expected_documents: 1001007,
      actual_documents: indexedDocuments,
      document_parity_pass: indexedDocuments === 1001007,
      sample_ids_verified: `${sampleFound}/${sampleIds.length}`,
      smokes_executed: smokeResults.length,
      smokes_passed: smokePassCount,
      smoke_status: smokePassCount === 10 ? 'ALL_10_PASSED' : 'SMOKE_FAILURES'
    },
    ten_search_smokes: smokeResults
  };

  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2));

  console.log('\n============================================================');
  console.log(`FULL INDEX BUILD STATUS: ${report.classification}`);
  console.log(`Total Indexed: ${report.counts.documents_indexed.toLocaleString()} / 1.001.007`);
  console.log(`Settings Config Time: ${report.timing.settings_seconds}s`);
  console.log(`Document Submission Time: ${report.timing.document_submission_seconds}s`);
  console.log(`Time to Fully Indexed: ${report.timing.total_index_build_seconds}s (~${(report.timing.total_index_build_seconds/60).toFixed(2)} min)`);
  console.log(`Indexing Throughput: ${report.timing.index_docs_per_second} docs/s`);
  console.log(`Peak Server RAM: ${report.resources.peak_meilisearch_rss_mb} MB | Index Size: ${report.resources.index_size_formatted}`);
  console.log(`Smokes: ${report.verification.smokes_passed}/10 PASS`);
  console.log(`Report saved to: ${OUTPUT_REPORT_PATH}`);
  console.log('============================================================');
}

main().catch(err => {
  console.error('\n❌ FATAL BUILD ERROR:', err);
  process.exit(1);
});
