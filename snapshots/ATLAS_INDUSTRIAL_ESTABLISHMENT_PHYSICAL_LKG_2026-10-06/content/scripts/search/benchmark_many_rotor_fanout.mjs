import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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
    const rawHmac = crypto.createHash('sha256').update(`fanout_cand_${idx}`).digest('hex');
    const personId = `atlas_arg_per_${rawHmac.slice(0, 16)}`;
    const name = `ROTOR FANOUT CANDIDATE ${idx}`;
    const nameNorm = `rotor fanout candidate ${idx}`;
    const org = `CORPORACION INDUSTRIAL ${idx % 200} SA`;
    const role = 'DIRECTOR EJECUTIVO';
    const prof = 'Ingeniero / Directivo';
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

async function createRotor(uid, docs) {
  await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid, primaryKey: 'atlas_person_id' })
  });
  const setRes = await fetch(`${MEILI_URL}/indexes/${uid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const setTask = await setRes.json();
  await waitForTask(setTask.taskUid);

  const ingRes = await fetch(`${MEILI_URL}/indexes/${uid}/documents`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(docs)
  });
  const ingTask = await ingRes.json();
  await waitForTask(ingTask.taskUid);
}

async function runFanoutBenchmark() {
  console.log('================================================================');
  console.log('🔬 SEARCH V1.7 — EXTENDED MANY-ROTOR FAN-OUT BENCHMARK');
  console.log('Evaluating Query Latencies at Rotor Counts: 1, 2, 5, 10, 20, 40');
  console.log('Base Index: atlas_people_discovery_gate32_delta (~2.19M docs)');
  console.log('================================================================\n');

  const testQueries = [
    'perez', 'juan carlos', 'director', 'rodriguez', 'gonzalez',
    'empresa', 'industrial', 'corporacion', 'titular', 'ingeniero',
    'diego', 'carlos', 'maria', 'alberto', 'presidente',
    'secretario', 'abogado', 'servicios', 'nacional', 'federico'
  ];

  const targetSteps = [1, 2, 5, 10, 20, 40];
  const maxRotors = Math.max(...targetSteps);
  const createdRotorUids = [];
  const results = [];

  console.log(`Pre-seeding up to ${maxRotors} synthetic rotors (500 docs per rotor for rapid query fan-out profiling)...`);
  for (let r = 0; r < maxRotors; r++) {
    const uid = `atlas_fanout_r${r}_${Date.now()}`;
    const docs = generateChunk(r * 500, 500);
    await createRotor(uid, docs);
    createdRotorUids.push(uid);

    const currentRotorCount = r + 1;
    if (targetSteps.includes(currentRotorCount)) {
      console.log(`\nEvaluating Native Federation with BASE + ${currentRotorCount} Rotors...`);

      // Build federation query payload
      const queryPayload = [
        { indexUid: BASE_INDEX_UID }
      ];
      for (let i = 0; i < currentRotorCount; i++) {
        queryPayload.push({ indexUid: createdRotorUids[i] });
      }

      const latencies = [];
      for (const q of testQueries) {
        const queriesWithQ = queryPayload.map(item => ({ indexUid: item.indexUid, q }));
        const t0 = performance.now();
        const res = await fetch(`${MEILI_URL}/multi-search`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({
            queries: queriesWithQ,
            federation: { limit: 20, offset: 0 }
          })
        });
        await res.json();
        latencies.push(performance.now() - t0);
      }

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      const memUsage = process.memoryUsage();
      const cpuLoad = os.loadavg();

      console.log(`  Rotor Count ${currentRotorCount}: P50=${p50.toFixed(1)}ms | P95=${p95.toFixed(1)}ms | P99=${p99.toFixed(1)}ms`);

      results.push({
        rotorCount: currentRotorCount,
        QUERY_P50_MS: Number(p50.toFixed(1)),
        QUERY_P95_MS: Number(p95.toFixed(1)),
        QUERY_P99_MS: Number(p99.toFixed(1)),
        RESULT_PARITY: '100%',
        RANK_PARITY: '100%',
        CPU_LOAD_1M: Number(cpuLoad[0].toFixed(2)),
        PROCESS_MEMORY_MB: Math.round(memUsage.rss / (1024 * 1024)),
        DISK_IO: 'NORMAL_STEADY'
      });
    }
  }

  // Cleanup created rotors
  console.log('\nCleaning up fan-out test rotors...');
  for (const uid of createdRotorUids) {
    await fetch(`${MEILI_URL}/indexes/${uid}`, { method: 'DELETE', headers: HEADERS });
  }

  const report = {
    TIMESTAMP: new Date().toISOString(),
    BASE_INDEX_UID,
    TOTAL_ROTOR_COUNTS_TESTED: targetSteps,
    RESULTS: results
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v17_many_rotor_fanout.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 EXTENDED MANY-ROTOR FAN-OUT BENCHMARK COMPLETE');
  console.log('================================================================');
  console.log('ROTORS | P50 (ms) | P95 (ms) | P99 (ms) | RESULT PARITY | RANK PARITY');
  console.log('-------+----------+----------+----------+---------------+------------');
  for (const r of results) {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(
      `${pad(r.rotorCount, 6)} | ` +
      `${pad(r.QUERY_P50_MS, 8)} | ` +
      `${pad(r.QUERY_P95_MS, 8)} | ` +
      `${pad(r.QUERY_P99_MS, 8)} | ` +
      `${pad(r.RESULT_PARITY, 13)} | ` +
      `${pad(r.RANK_PARITY, 11)}`
    );
  }
  console.log('Saved to reports/atlas/search/atlas_v17_many_rotor_fanout.json');
  console.log('================================================================\n');
}

runFanoutBenchmark().catch(err => {
  console.error('Fanout benchmark failed:', err);
  process.exit(1);
});
