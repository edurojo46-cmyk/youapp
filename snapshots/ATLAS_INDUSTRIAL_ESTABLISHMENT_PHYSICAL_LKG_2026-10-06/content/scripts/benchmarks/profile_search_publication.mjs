import dotenv from 'dotenv';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

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
  return await waitForMeiliTask(task.taskUid);
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS V2.2 — SEARCH PUBLICATION PROFILING');
  console.log('Measuring: Reconstruction, HTTP Transport, Queue Wait, LMDB Processing, Rotation');
  console.log('================================================================\n');

  const BATCH_SIZES = [2500, 5000, 10000];
  const TOTAL_TEST_DOCS = 50000;

  // Pre-generate raw outbox-style rows
  const rawRows = [];
  for (let i = 0; i < TOTAL_TEST_DOCS; i++) {
    rawRows.push({
      event_id: i + 1,
      atlas_person_id: `prof_${i}`,
      source_id: 'prof_search_v22',
      source_person_id: `SRC_${i}`,
      projection_version: 1,
      created_at: new Date().toISOString()
    });
  }

  const testIndexA = 'atlas_v22_profile_rotor_0';
  const testIndexB = 'atlas_v22_profile_rotor_1';

  let tRotStart = performance.now();
  await createIndex(testIndexA);
  const rotAMs = performance.now() - tRotStart;

  tRotStart = performance.now();
  await createIndex(testIndexB);
  const rotBMs = performance.now() - tRotStart;

  const rotationMsAvg = (rotAMs + rotBMs) / 2;

  const profilingRecords = [];

  for (const batchSize of BATCH_SIZES) {
    console.log(`\n🔬 Profiling batch size: ${batchSize} docs/batch...`);

    let totalReconstructionMs = 0;
    let totalHttpSubmissionMs = 0;
    let totalMeiliQueueWaitMs = 0;
    let totalMeiliProcessingMs = 0;
    let totalBatches = 0;

    const batchesCount = Math.floor(TOTAL_TEST_DOCS / batchSize);

    for (let b = 0; b < batchesCount; b++) {
      const sliceRows = rawRows.slice(b * batchSize, (b + 1) * batchSize);
      const targetIndex = (b % 2 === 0) ? testIndexA : testIndexB;

      // 1. Document Reconstruction
      const tRecStart = performance.now();
      const docs = sliceRows.map(r => ({
        atlas_person_id: r.atlas_person_id,
        source_id: r.source_id,
        source_person_id: r.source_person_id,
        projection_version: r.projection_version,
        display_name: `Candidate ${r.source_person_id}`,
        display_name_normalized: `candidate ${r.source_person_id}`,
        organization: 'ATLAS BULK S.A.',
        role: 'DIRECTOR',
        profession: 'Ingeniero',
        search_text_normalized: `candidate ${r.source_person_id} director atlas bulk s.a.`,
        created_at: r.created_at
      }));
      const recMs = performance.now() - tRecStart;

      // 2. HTTP Submission
      const tHttpStart = performance.now();
      const res = await fetch(`${MEILI_URL}/indexes/${targetIndex}/documents`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(docs)
      });
      const taskMeta = await res.json();
      const httpMs = performance.now() - tHttpStart;

      // 3 & 4. Queue Wait & Meili Processing
      const finalTask = await waitForMeiliTask(taskMeta.taskUid);

      const enqueuedAt = new Date(finalTask.enqueuedAt).getTime();
      const startedAt = new Date(finalTask.startedAt).getTime();
      const finishedAt = new Date(finalTask.finishedAt).getTime();

      const queueWaitMs = Math.max(0, startedAt - enqueuedAt);
      const processingMs = parseDurationMs(finalTask.duration) || Math.max(0, finishedAt - startedAt);

      totalReconstructionMs += recMs;
      totalHttpSubmissionMs += httpMs;
      totalMeiliQueueWaitMs += queueWaitMs;
      totalMeiliProcessingMs += processingMs;
      totalBatches++;
    }

    const avgRec = totalReconstructionMs / totalBatches;
    const avgHttp = totalHttpSubmissionMs / totalBatches;
    const avgQueue = totalMeiliQueueWaitMs / totalBatches;
    const avgProc = totalMeiliProcessingMs / totalBatches;
    const totalBatchWall = avgRec + avgHttp + avgQueue + avgProc;

    profilingRecords.push({
      BATCH_SIZE: batchSize,
      BATCH_COUNT: totalBatches,
      DOCUMENT_RECONSTRUCTION_MS: Number(avgRec.toFixed(2)),
      HTTP_SUBMISSION_MS: Number(avgHttp.toFixed(2)),
      MEILI_QUEUE_WAIT_MS: Number(avgQueue.toFixed(2)),
      MEILI_PROCESSING_MS: Number(avgProc.toFixed(2)),
      ROTATION_MS: Number(rotationMsAvg.toFixed(2)),
      TOTAL_BATCH_WALL_MS: Number(totalBatchWall.toFixed(2)),
      PERCENT_RECONSTRUCTION: Number(((avgRec / totalBatchWall) * 100).toFixed(2)),
      PERCENT_HTTP: Number(((avgHttp / totalBatchWall) * 100).toFixed(2)),
      PERCENT_QUEUE_WAIT: Number(((avgQueue / totalBatchWall) * 100).toFixed(2)),
      PERCENT_PROCESSING: Number(((avgProc / totalBatchWall) * 100).toFixed(2))
    });

    console.log(`  Rec: ${avgRec.toFixed(2)}ms (${((avgRec / totalBatchWall) * 100).toFixed(1)}%) | HTTP: ${avgHttp.toFixed(2)}ms (${((avgHttp / totalBatchWall) * 100).toFixed(1)}%) | Queue: ${avgQueue.toFixed(2)}ms (${((avgQueue / totalBatchWall) * 100).toFixed(1)}%) | Proc: ${avgProc.toFixed(2)}ms (${((avgProc / totalBatchWall) * 100).toFixed(1)}%)`);
  }

  // Cleanup
  await fetch(`${MEILI_URL}/indexes/${testIndexA}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${testIndexB}`, { method: 'DELETE', headers: HEADERS });

  const std = profilingRecords.find(r => r.BATCH_SIZE === 5000) || profilingRecords[0];
  const dominantPhase = (std.PERCENT_PROCESSING > 50) ? 'MEILI_PROCESSING_MS (LMDB Engine Indexing)' :
                        (std.PERCENT_HTTP > 50) ? 'HTTP_SUBMISSION_MS' :
                        (std.PERCENT_QUEUE_WAIT > 50) ? 'MEILI_QUEUE_WAIT_MS' : 'DOCUMENT_RECONSTRUCTION_MS';

  const report = {
    TIMESTAMP: new Date().toISOString(),
    RECORDS: profilingRecords,
    ROTATION_MS: Number(rotationMsAvg.toFixed(2)),
    BASELINE_BATCH_5000: std,
    DOMINANT_SEARCH_PUBLICATION_PHASE: dominantPhase
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v22_search_publication_profile.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 SEARCH PUBLICATION PROFILING RESULTS');
  console.log('================================================================');
  console.log(`DOCUMENT_RECONSTRUCTION_MS : ${std.DOCUMENT_RECONSTRUCTION_MS} ms (${std.PERCENT_RECONSTRUCTION}%)`);
  console.log(`HTTP_SUBMISSION_MS         : ${std.HTTP_SUBMISSION_MS} ms (${std.PERCENT_HTTP}%)`);
  console.log(`MEILI_QUEUE_WAIT_MS        : ${std.MEILI_QUEUE_WAIT_MS} ms (${std.PERCENT_QUEUE_WAIT}%)`);
  console.log(`MEILI_PROCESSING_MS        : ${std.MEILI_PROCESSING_MS} ms (${std.PERCENT_PROCESSING}%)`);
  console.log(`ROTATION_MS                : ${report.ROTATION_MS} ms`);
  console.log(`DOMINANT PHASE             : ${report.DOMINANT_SEARCH_PUBLICATION_PHASE}`);
  console.log('Saved to reports/atlas/search/atlas_v22_search_publication_profile.json\n');
}

main().catch(err => {
  console.error('Search publication profiling failed:', err);
  process.exit(1);
});
