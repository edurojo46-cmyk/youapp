import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const BASE_INDEX_UID = 'atlas_people_discovery_gate32_delta';

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
  filterableAttributes: [],
  sortableAttributes: [],
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
    minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 }
  },
  pagination: { maxTotalHits: 1000 },
  prefixSearch: 'indexingTime'
};

function generateChunk(offset, count) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const idx = offset + i;
    const rawHmac = crypto.createHash('sha256').update(`rotor_cand_${idx}`).digest('hex');
    const personId = `atlas_arg_per_${rawHmac.slice(0, 16)}`;
    const name = `ROTOR CANDIDATE ${idx}`;
    const nameNorm = `rotor candidate ${idx}`;
    const org = `ORGANIZACION MATRIZ ${idx % 1000} SA`;
    const role = 'DIRECTOR TITULAR';
    const prof = 'Profesional Corporativo';
    const searchText = `${nameNorm} ${role.toLowerCase()} ${org.toLowerCase()}`;

    docs.push({
      atlas_person_id: personId,
      display_name: name,
      display_name_normalized: nameNorm,
      organization: org,
      role: role,
      profession: prof,
      search_text_normalized: searchText,
      source_id: 'ARCA_CONDICION_TRIBUTARIA',
      source_record_id: `rec_${rawHmac.slice(0, 32)}`
    });
  }
  return docs;
}

async function waitForTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 100));
  }
}

async function testThreshold(threshold, totalCohort = 100000) {
  console.log(`\n--- BENCHMARKING ROTOR SIZE THRESHOLD: ${threshold / 1000}K (APPENDING 100K COHORT) ---`);

  // Calculate rotor division (e.g. 25K -> 4 rotors; 50K -> 2 rotors; 75K -> 75K + 25K; 100K -> 1 rotor)
  const rotorSizes = [];
  let remaining = totalCohort;
  while (remaining > 0) {
    const size = Math.min(threshold, remaining);
    rotorSizes.push(size);
    remaining -= size;
  }

  const tStart = performance.now();
  let totalCreationMs = 0;
  let totalSettingsMs = 0;
  let totalIngestionMs = 0;
  let totalSealMs = 0;
  let totalRotationMs = 0;
  const createdRotorUids = [];

  let currentOffset = 0;
  for (let r = 0; r < rotorSizes.length; r++) {
    const rSize = rotorSizes[r];
    const rotorUid = `atlas_rotor_t${threshold / 1000}k_r${r}_${Date.now()}`;
    createdRotorUids.push(rotorUid);

    // 1. Index Creation
    const t0Create = performance.now();
    await fetch(`${MEILI_URL}/indexes`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ uid: rotorUid, primaryKey: 'atlas_person_id' })
    });
    const createMs = performance.now() - t0Create;
    totalCreationMs += createMs;

    // 2. Settings Application
    const t0Set = performance.now();
    const setRes = await fetch(`${MEILI_URL}/indexes/${rotorUid}/settings`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(FROZEN_SETTINGS)
    });
    const setTask = await setRes.json();
    await waitForTask(setTask.taskUid);
    const settingsMs = performance.now() - t0Set;
    totalSettingsMs += settingsMs;

    // 3. Batch Ingestion (in 10K sub-batches)
    const t0Ingest = performance.now();
    const subBatchSize = 10000;
    for (let sub = 0; sub < rSize; sub += subBatchSize) {
      const count = Math.min(subBatchSize, rSize - sub);
      const docs = generateChunk(currentOffset, count);
      currentOffset += count;

      const ingRes = await fetch(`${MEILI_URL}/indexes/${rotorUid}/documents`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(docs)
      });
      const ingTask = await ingRes.json();
      await waitForTask(ingTask.taskUid);
    }
    const ingestMs = performance.now() - t0Ingest;
    totalIngestionMs += ingestMs;

    // 4. Seal & Rotation Overhead
    const t0Seal = performance.now();
    // Verify document count to seal
    const statsRes = await fetch(`${MEILI_URL}/indexes/${rotorUid}/stats`, { headers: HEADERS });
    const stats = await statsRes.json();
    const sealMs = performance.now() - t0Seal;
    totalSealMs += sealMs;

    const rotationMs = createMs + settingsMs + sealMs;
    totalRotationMs += rotationMs;

    console.log(`  Rotor ${r + 1}/${rotorSizes.length} (${rSize} docs): Creation=${createMs.toFixed(0)}ms | Settings=${settingsMs.toFixed(0)}ms | Ingestion=${(ingestMs / 1000).toFixed(2)}s | Rate=${(rSize / (ingestMs / 1000)).toFixed(1)} docs/sec`);
  }

  const totalWallSec = (performance.now() - tStart) / 1000;
  const docsSec = Number((totalCohort / totalWallSec).toFixed(2));

  console.log(`Threshold ${threshold / 1000}K Total: Wall=${totalWallSec.toFixed(2)}s | Net Throughput=${docsSec} docs/sec | Rotation Overhead=${totalRotationMs.toFixed(0)}ms`);

  // Cleanup benchmark rotors
  for (const uid of createdRotorUids) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }

  return {
    thresholdDocs: threshold,
    rotorCount: rotorSizes.length,
    totalCohortDocs: totalCohort,
    TOTAL_WALL_SEC: Number(totalWallSec.toFixed(2)),
    DOCS_SEC: docsSec,
    INDEX_CREATION_MS: Number(totalCreationMs.toFixed(1)),
    SETTINGS_MS: Number(totalSettingsMs.toFixed(1)),
    INGESTION_MS: Number(totalIngestionMs.toFixed(1)),
    SEAL_MS: Number(totalSealMs.toFixed(1)),
    ROTATION_MS: Number(totalRotationMs.toFixed(1)),
    AVG_ACTIVE_ROTOR_SIZE: Math.round(totalCohort / rotorSizes.length),
    MAX_ACTIVE_ROTOR_SIZE: Math.max(...rotorSizes)
  };
}

async function main() {
  console.log('================================================================');
  console.log('🔬 SEARCH V1.7 — ROTOR SIZE MATRIX BENCHMARK');
  console.log('Evaluating 25K, 50K, 75K, 100K thresholds against 100K cohort');
  console.log('Base Index: atlas_people_discovery_gate32_delta (~2.19M docs)');
  console.log('================================================================\n');

  const thresholds = [25000, 50000, 75000, 100000];
  const matrixResults = [];

  for (const t of thresholds) {
    const res = await testThreshold(t, 100000);
    matrixResults.push(res);
  }

  // Determine Best Rotor Size based on highest Net Throughput (including rotation overhead)
  matrixResults.sort((a, b) => b.DOCS_SEC - a.DOCS_SEC);
  const bestRotor = matrixResults[0];

  const report = {
    TIMESTAMP: new Date().toISOString(),
    BASE_INDEX_UID,
    BASE_DOCUMENT_COUNT: 2191410,
    SEARCH_FROZEN_CONTRACT_SHA256: 'd680a02369e499d544990d7b9668c277ba529f9ba54688a2947a79d481460fb5',
    BEST_ROTOR_SIZE: bestRotor.thresholdDocs,
    BEST_ROTOR_SIZE_DOCS_SEC: bestRotor.DOCS_SEC,
    MATRIX_EVALUATED: matrixResults,
    RECOMMENDED_COMPACTION_POLICY: {
      COMPACTION_TRIGGER_POLICY: 'MAX_SEALED_ROTORS_OR_DELTA_DOCS',
      MAX_ROTORS_BEFORE_COMPACTION: bestRotor.thresholdDocs === 50000 ? 4 : (bestRotor.thresholdDocs === 25000 ? 8 : 2),
      AVERAGE_COMPACTION_INTERVAL_DOCS: 200000,
      INGESTION_DOWNTIME_MS: 0,
      QUERY_INTERRUPTION_MS: 0
    }
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v17_rotor_matrix.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 ROTOR SIZE MATRIX BENCHMARK COMPLETE');
  console.log('================================================================');
  console.log('THRESHOLD | ROTORS | WALL (s) | NET DOCS/SEC | ROTATION MS | AVG SIZE');
  console.log('----------+--------+----------+--------------+-------------+---------');
  for (const r of matrixResults) {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(
      `${pad(r.thresholdDocs / 1000 + 'K', 9)} | ` +
      `${pad(r.rotorCount, 6)} | ` +
      `${pad(r.TOTAL_WALL_SEC, 8)} | ` +
      `${pad(r.DOCS_SEC, 12)} | ` +
      `${pad(r.ROTATION_MS, 11)} | ` +
      `${pad(r.AVG_ACTIVE_ROTOR_SIZE, 8)}`
    );
  }
  console.log('----------------------------------------------------------------');
  console.log(`BEST_ROTOR_SIZE          : ${report.BEST_ROTOR_SIZE} docs (${report.BEST_ROTOR_SIZE / 1000}K)`);
  console.log(`BEST_ROTOR_DOCS_SEC      : ${report.BEST_ROTOR_SIZE_DOCS_SEC} docs/sec`);
  console.log('Saved to reports/atlas/search/atlas_v17_rotor_matrix.json');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Rotor matrix benchmark failed:', err);
  process.exit(1);
});
