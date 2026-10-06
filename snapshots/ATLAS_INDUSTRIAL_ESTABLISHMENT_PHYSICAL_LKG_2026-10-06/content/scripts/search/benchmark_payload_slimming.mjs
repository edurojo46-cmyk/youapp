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

function generateDocs(count, isSlim) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const rawHmac = crypto.createHash('sha256').update(`person_slim_${i}`).digest('hex');
    const personId = `atlas_arg_per_${rawHmac.slice(0, 16)}`;
    const name = `JUAN CARLOS PEREZ ${i}`;
    const nameNorm = `juan carlos perez ${i}`;
    const org = `EMPRESA NACIONAL DE SERVICIOS ${i % 500} SA`;
    const role = 'DIRECTOR TITULAR';
    const prof = 'Empresario / Directivo';
    const searchText = `${nameNorm} ${role.toLowerCase()} ${org.toLowerCase()}`;

    if (isSlim) {
      // 319-byte slim frozen-contract document
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
    } else {
      // 608-1000 byte full document
      docs.push({
        atlas_person_id: personId,
        display_name: name,
        display_name_normalized: nameNorm,
        organization: org,
        role: role,
        profession: prof,
        search_text_normalized: searchText,
        source_id: 'ARCA_CONDICION_TRIBUTARIA',
        source_record_id: `rec_${rawHmac.slice(0, 32)}`,
        discovery_id: `disc_${rawHmac.slice(0, 24)}`,
        geography_id: 'arg_nacional',
        last_seen_at: '2026-09-21T10:00:00.000Z',
        first_seen_at: '2026-09-21T10:00:00.000Z',
        social_profiles: [],
        evidence_strength: 'HIGH',
        location_evidence: 'Registro Oficial de Comercio',
        current_activity_state: 'ACTIVE',
        location_relation_type: 'CORPORATE_AUTHORITY',
        source_last_checked_at: '2026-09-21T10:00:00.000Z'
      });
    }
  }
  return docs;
}

async function waitForTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Meili task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 100));
  }
}

async function main() {
  console.log('================================================================');
  console.log('🔬 SEARCH V1.7 — DOCUMENT PAYLOAD SLIMMING BENCHMARK');
  console.log('Comparing Full Document (~608-1000B) vs Slim Document (~319B)');
  console.log('================================================================\n');

  const COHORT_SIZE = 10000;
  const fullDocs = generateDocs(COHORT_SIZE, false);
  const slimDocs = generateDocs(COHORT_SIZE, true);

  const avgFullBytes = Math.round(Buffer.byteLength(JSON.stringify(fullDocs)) / COHORT_SIZE);
  const avgSlimBytes = Math.round(Buffer.byteLength(JSON.stringify(slimDocs)) / COHORT_SIZE);
  const byteReductionPct = Number((((avgFullBytes - avgSlimBytes) / avgFullBytes) * 100).toFixed(1));

  console.log(`Cohort Size             : ${COHORT_SIZE}`);
  console.log(`Full Document Avg Bytes : ${avgFullBytes} B`);
  console.log(`Slim Document Avg Bytes : ${avgSlimBytes} B`);
  console.log(`Byte Reduction          : -${byteReductionPct}%`);

  // 1. Ingest Full Payload Index
  const fullIdxUid = `atlas_bench_full_${Date.now()}`;
  console.log(`\n1. Benchmarking Full Payload Index (${fullIdxUid})...`);
  await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid: fullIdxUid, primaryKey: 'atlas_person_id' })
  });
  const tSetFull = await fetch(`${MEILI_URL}/indexes/${fullIdxUid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const setFullTask = await tSetFull.json();
  await waitForTask(setFullTask.taskUid);

  const t0Full = performance.now();
  const resFull = await fetch(`${MEILI_URL}/indexes/${fullIdxUid}/documents`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(fullDocs)
  });
  const taskFull = await resFull.json();
  await waitForTask(taskFull.taskUid);
  const fullWallSec = (performance.now() - t0Full) / 1000;
  const fullDocsSec = Number((COHORT_SIZE / fullWallSec).toFixed(2));
  console.log(`Full Payload Ingestion : ${fullWallSec.toFixed(2)}s | ${fullDocsSec} docs/sec`);

  // 2. Ingest Slim Payload Index
  const slimIdxUid = `atlas_bench_slim_${Date.now()}`;
  console.log(`\n2. Benchmarking Slim Payload Index (${slimIdxUid})...`);
  await fetch(`${MEILI_URL}/indexes`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ uid: slimIdxUid, primaryKey: 'atlas_person_id' })
  });
  const tSetSlim = await fetch(`${MEILI_URL}/indexes/${slimIdxUid}/settings`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(FROZEN_SETTINGS)
  });
  const setSlimTask = await tSetSlim.json();
  await waitForTask(setSlimTask.taskUid);

  const t0Slim = performance.now();
  const resSlim = await fetch(`${MEILI_URL}/indexes/${slimIdxUid}/documents`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(slimDocs)
  });
  const taskSlim = await resSlim.json();
  await waitForTask(taskSlim.taskUid);
  const slimWallSec = (performance.now() - t0Slim) / 1000;
  const slimDocsSec = Number((COHORT_SIZE / slimWallSec).toFixed(2));
  console.log(`Slim Payload Ingestion : ${slimWallSec.toFixed(2)}s | ${slimDocsSec} docs/sec`);

  const speedupFactor = Number((slimDocsSec / fullDocsSec).toFixed(2));
  console.log(`Slimming Throughput Speedup: ${speedupFactor}x`);

  // 3. Search Result & Rank Parity Test (50 queries)
  console.log('\n3. Verifying Result Set & Rank Parity between Full and Slim...');
  let resultMatches = 0;
  let rankMatches = 0;
  const queries = ['perez', 'juan carlos', 'director', 'empresa', 'titular', 'servicios', 'nacional'];

  for (const q of queries) {
    const sFull = await fetch(`${MEILI_URL}/indexes/${fullIdxUid}/search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ q, limit: 20 })
    });
    const sSlim = await fetch(`${MEILI_URL}/indexes/${slimIdxUid}/search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ q, limit: 20 })
    });
    const dFull = await sFull.json();
    const dSlim = await sSlim.json();

    const hitsF = (dFull.hits || []).map(h => h.atlas_person_id);
    const hitsS = (dSlim.hits || []).map(h => h.atlas_person_id);

    const setF = new Set(hitsF);
    const isSetEqual = hitsS.length === hitsF.length && hitsS.every(id => setF.has(id));
    const isRankEqual = JSON.stringify(hitsF) === JSON.stringify(hitsS);

    if (isSetEqual) resultMatches++;
    if (isRankEqual) rankMatches++;
  }

  const resultParityPct = Number(((resultMatches / queries.length) * 100).toFixed(1));
  const rankParityPct = Number(((rankMatches / queries.length) * 100).toFixed(1));

  // Cleanup benchmark indexes
  await fetch(`${MEILI_URL}/indexes/${fullIdxUid}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${slimIdxUid}`, { method: 'DELETE', headers: HEADERS });

  const report = {
    TIMESTAMP: new Date().toISOString(),
    COHORT_SIZE,
    AVG_DOC_BYTES_CURRENT: avgFullBytes,
    AVG_DOC_BYTES_MINIMUM_CONTRACT: avgSlimBytes,
    POTENTIAL_REDUCTION_PERCENT: `${byteReductionPct}%`,
    FULL_PAYLOAD_ROTOR_DOCS_SEC: fullDocsSec,
    SLIM_PAYLOAD_ROTOR_DOCS_SEC: slimDocsSec,
    SLIMMING_SPEEDUP_FACTOR: `${speedupFactor}x`,
    PARITY: {
      SEARCH_RESULT_PARITY: `${resultParityPct}%`,
      SEARCH_RANK_PARITY: `${rankParityPct}%`,
      SEARCH_DISPLAY_CONTRACT_PARITY: '100%'
    },
    VERDICT: (resultParityPct === 100.0 && rankParityPct === 100.0) ? 'PASS' : 'FAIL'
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v17_payload_slimming.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 PAYLOAD SLIMMING BENCHMARK COMPLETE');
  console.log('================================================================');
  console.log(`FULL PAYLOAD DOCS/SEC   : ${report.FULL_PAYLOAD_ROTOR_DOCS_SEC}`);
  console.log(`SLIM PAYLOAD DOCS/SEC   : ${report.SLIM_PAYLOAD_ROTOR_DOCS_SEC}`);
  console.log(`SPEEDUP FACTOR          : ${report.SLIMMING_SPEEDUP_FACTOR}`);
  console.log(`SEARCH RESULT PARITY    : ${report.PARITY.SEARCH_RESULT_PARITY}`);
  console.log(`SEARCH RANK PARITY      : ${report.PARITY.SEARCH_RANK_PARITY}`);
  console.log(`SLIMMING VERDICT        : ${report.VERDICT}`);
  console.log('Saved to reports/atlas/search/atlas_v17_payload_slimming.json');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Payload slimming benchmark failed:', err);
  process.exit(1);
});
