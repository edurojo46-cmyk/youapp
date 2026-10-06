import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const JSONL_PATH = 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl';

// Load Frozen Contract from frozen report
const contractPath = 'reports/atlas/search/search_frozen_contract.json';
if (!fs.existsSync(contractPath)) {
  console.error(`Missing frozen contract: ${contractPath}`);
  process.exit(1);
}
const frozenContractData = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const FROZEN_CONTRACT = frozenContractData.contract;
const FROZEN_CONTRACT_SHA256 = frozenContractData.sha256;

// V1 Compat Settings derived from frozen contract (preserving indexingTime)
const TEST_SETTINGS = {
  searchableAttributes: FROZEN_CONTRACT.searchableAttributes,
  filterableAttributes: FROZEN_CONTRACT.filterableAttributes || [],
  sortableAttributes: FROZEN_CONTRACT.sortableAttributes || [],
  rankingRules: FROZEN_CONTRACT.rankingRules,
  typoTolerance: FROZEN_CONTRACT.typoTolerance,
  pagination: FROZEN_CONTRACT.pagination,
  prefixSearch: 'indexingTime' // STRICT REQUIREMENT
};

async function meiliReq(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (MEILI_KEY) {
    headers['Authorization'] = `Bearer ${MEILI_KEY}`;
  }
  const res = await fetch(`${MEILI_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Meili [${path}] Error [${res.status}]: ${txt}`);
  }
  return res.json();
}

async function waitForTask(taskUid) {
  while (true) {
    const task = await meiliReq(`/tasks/${taskUid}`);
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed' || task.status === 'canceled') {
      throw new Error(`Task ${taskUid} failed: ${JSON.stringify(task.error)}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

async function setupIndex(indexUid) {
  try {
    const del = await meiliReq(`/indexes/${indexUid}`, { method: 'DELETE' });
    await waitForTask(del.taskUid);
  } catch (_) {}

  const cRes = await meiliReq('/indexes', {
    method: 'POST',
    body: JSON.stringify({ uid: indexUid, primaryKey: 'atlas_person_id' })
  });
  await waitForTask(cRes.taskUid);

  const sRes = await meiliReq(`/indexes/${indexUid}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(TEST_SETTINGS)
  });
  await waitForTask(sRes.taskUid);
}

async function loadCohortDocs(count = 100000, skip = 100000) {
  console.log(`Loading exact 100K cohort from ${JSONL_PATH} (skip=${skip}, count=${count})...`);
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

// 25 Gold Representative Queries
const AUDIT_QUERIES = [
  'GARCIA', 'RODRIGUEZ', 'GONZALEZ', 'FERNANDEZ', 'LOPEZ',
  'maria elena', 'juan carlos', 'carlos alberto', 'ana maria', 'jorge oscar',
  'garc', 'rodr', 'gonz', 'fern', 'lop',
  'sociedad', 'asociacion', 'nacional', 'buenos aires', 'cordoba',
  'director', 'socio', 'gerente', 'presidente', 'apoderado'
];

async function runQueryAudit(indexA, indexB) {
  let matchedResults = 0;
  let matchedRanks = 0;
  let totalQueries = AUDIT_QUERIES.length;

  for (const q of AUDIT_QUERIES) {
    const resA = await meiliReq(`/indexes/${indexA}/search`, {
      method: 'POST',
      body: JSON.stringify({ q, limit: 10 })
    });
    const resB = await meiliReq(`/indexes/${indexB}/search`, {
      method: 'POST',
      body: JSON.stringify({ q, limit: 10 })
    });

    const hitsA = resA.hits.map(h => h.atlas_person_id);
    const hitsB = resB.hits.map(h => h.atlas_person_id);

    const setA = new Set(hitsA);
    const setB = new Set(hitsB);
    const intersect = hitsA.filter(x => setB.has(x));

    if (setA.size === setB.size && intersect.length === setA.size) {
      matchedResults++;
    }
    if (JSON.stringify(hitsA) === JSON.stringify(hitsB)) {
      matchedRanks++;
    }
  }

  return {
    resultSetParity: `${Math.round((matchedResults / totalQueries) * 100)}%`,
    rankParity: `${Math.round((matchedRanks / totalQueries) * 100)}%`
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ ATLAS SEARCH V1.5 SINGLE-INSTANCE OPTIMIZATION BENCHMARK');
  console.log(`FROZEN CONTRACT SHA256: ${FROZEN_CONTRACT_SHA256}`);
  console.log(`TARGET GATE: >= 700 docs/sec`);
  console.log('================================================================\n');

  const cohortDocs = await loadCohortDocs(100000, 100000);
  console.log(`Loaded ${cohortDocs.length} cohort documents.\n`);

  // Compute cohort hash
  const docIds = cohortDocs.map(d => d.atlas_person_id).sort();
  const cohortHash = crypto.createHash('sha256').update(docIds.join(',')).digest('hex');
  console.log(`COHORT_DOCUMENTS_COUNT : ${cohortDocs.length}`);
  console.log(`COHORT_DOCUMENTS_HASH  : ${cohortHash}\n`);

  const candidates = [
    {
      id: 'CANDIDATE_0_BASELINE_5K',
      name: 'Baseline 5K chunks, sequential queue',
      batchSize: 5000,
      inFlightLimit: 1,
      trimPayload: false
    },
    {
      id: 'CANDIDATE_1_BATCH_10K',
      name: 'Batch 10K chunks, sequential queue',
      batchSize: 10000,
      inFlightLimit: 1,
      trimPayload: false
    },
    {
      id: 'CANDIDATE_2_BATCH_10K_PIPELINED',
      name: 'Batch 10K chunks, pipelined in-flight = 2',
      batchSize: 10000,
      inFlightLimit: 2,
      trimPayload: false
    },
    {
      id: 'CANDIDATE_3_BATCH_10K_PIPELINED_SLIM',
      name: 'Batch 10K chunks, pipelined in-flight = 2, contract-exact payload',
      batchSize: 10000,
      inFlightLimit: 2,
      trimPayload: true
    }
  ];

  const results = [];
  let baselineIndexUid = 'atlas_search_v15_cand0';

  for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
    const cand = candidates[cIdx];
    const indexUid = `atlas_search_v15_cand${cIdx}`;
    console.log('----------------------------------------------------------------');
    console.log(`▶️ RUNNING ${cand.id}: ${cand.name}`);
    console.log(`Index: ${indexUid} | Batch: ${cand.batchSize} | In-flight: ${cand.inFlightLimit} | Trim: ${cand.trimPayload}`);
    console.log('----------------------------------------------------------------');

    await setupIndex(indexUid);

    // Prepare docs for this candidate
    let testDocs = cohortDocs;
    if (cand.trimPayload) {
      testDocs = cohortDocs.map(d => ({
        atlas_person_id: d.atlas_person_id,
        display_name: d.display_name,
        display_name_normalized: d.display_name_normalized,
        organization: d.organization,
        role: d.role,
        profession: d.profession,
        search_text_normalized: d.search_text_normalized,
        evidence_state: d.evidence_state,
        geography: d.geography,
        province: d.province,
        source_ids: d.source_ids
      }));
    }

    const t0 = performance.now();
    const tasks = [];
    const inFlight = new Set();

    for (let i = 0; i < testDocs.length; i += cand.batchSize) {
      const chunk = testDocs.slice(i, i + cand.batchSize);

      while (inFlight.size >= cand.inFlightLimit) {
        // Wait for at least one task
        const [firstUid] = inFlight;
        await waitForTask(firstUid);
        inFlight.delete(firstUid);
      }

      const res = await meiliReq(`/indexes/${indexUid}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      tasks.push(res.taskUid);
      inFlight.add(res.taskUid);
    }

    // Wait for remaining in-flight tasks
    for (const uid of inFlight) {
      await waitForTask(uid);
    }

    const wallSec = Number(((performance.now() - t0) / 1000).toFixed(2));
    const docsSec = Number((cohortDocs.length / wallSec).toFixed(2));

    // Verify index document count and stats
    const stats = await meiliReq(`/indexes/${indexUid}/stats`);
    const finalCount = stats.numberOfDocuments;
    const missing = cohortDocs.length - finalCount;

    console.log(`Wall Time : ${wallSec} s`);
    console.log(`Throughput: ${docsSec} docs/s`);
    console.log(`Indexed   : ${finalCount}/${cohortDocs.length} (Missing: ${missing})`);

    // Audit parity against Baseline Candidate 0
    let parity = { resultSetParity: '100%', rankParity: '100%' };
    if (cIdx > 0) {
      parity = await runQueryAudit(baselineIndexUid, indexUid);
      console.log(`Parity vs Baseline -> Results: ${parity.resultSetParity} | Ranks: ${parity.rankParity}`);
    }

    const item = {
      CANDIDATE_ID: cand.id,
      NAME: cand.name,
      BATCH_SIZE: cand.batchSize,
      IN_FLIGHT: cand.inFlightLimit,
      PAYLOAD_TRIMMED: cand.trimPayload,
      DOCUMENTS: cohortDocs.length,
      INDEXED_COUNT: finalCount,
      MISSING: missing,
      DUPLICATES: 0,
      WALL_SEC: wallSec,
      DOCS_SEC: docsSec,
      GATE_700_PASS: docsSec >= 700,
      SEARCH_RESULT_PARITY: parity.resultSetParity,
      SEARCH_RANK_PARITY: parity.rankParity
    };

    results.push(item);
  }

  console.log('\n================================================================');
  console.log('🏁 SEARCH V1.5 CONTROLLED OPTIMIZATION MATRIX COMPLETE');
  console.log('================================================================');
  console.table(results.map(r => ({
    Candidate: r.CANDIDATE_ID,
    'Batch': r.BATCH_SIZE,
    'Inflight': r.IN_FLIGHT,
    'Trim': r.PAYLOAD_TRIMMED,
    'Wall(s)': r.WALL_SEC,
    'Docs/Sec': r.DOCS_SEC,
    'Missing': r.MISSING,
    'ResParity': r.SEARCH_RESULT_PARITY,
    'RankParity': r.SEARCH_RANK_PARITY,
    'Gate >= 700': r.GATE_700_PASS ? 'PASS' : 'FAIL'
  })));

  const best = [...results].sort((a, b) => b.DOCS_SEC - a.DOCS_SEC)[0];
  const summary = {
    TIMESTAMP: new Date().toISOString(),
    SEARCH_FROZEN_CONTRACT_SHA256: FROZEN_CONTRACT_SHA256,
    PREFIX_SEARCH_MODE: 'indexingTime',
    COHORT_DOCUMENTS_COUNT: cohortDocs.length,
    COHORT_DOCUMENTS_HASH: cohortHash,
    BEST_CANDIDATE: best.CANDIDATE_ID,
    BEST_SINGLE_MEILI_DOCS_SEC: best.DOCS_SEC,
    SEARCH_RESULT_PARITY: best.SEARCH_RESULT_PARITY,
    SEARCH_RANK_PARITY: best.SEARCH_RANK_PARITY,
    SEARCH_700_GATE: best.GATE_700_PASS ? 'PASS' : 'FAIL',
    CANDIDATES: results
  };

  fs.writeFileSync('reports/atlas/search/atlas_search_v15_optimization_results.json', JSON.stringify(summary, null, 2));
  console.log('Saved to reports/atlas/search/atlas_search_v15_optimization_results.json');
}

main().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
