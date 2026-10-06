import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';

dotenv.config();

const MEILI_URL = process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const JSONL_PATH = 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl';

const BASE_SETTINGS = {
  searchableAttributes: [
    'display_name_normalized',
    'display_name',
    'search_text_normalized',
    'role',
    'profession',
    'organization'
  ],
  filterableAttributes: [
    'evidence_state',
    'geography',
    'province',
    'source_ids'
  ],
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
    minWordSizeForTypos: {
      oneTypo: 5,
      twoTypos: 9
    },
    disableOnWords: [],
    disableOnAttributes: []
  },
  pagination: {
    maxTotalHits: 1000
  }
};

async function meiliFetch(path, options = {}) {
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
    throw new Error(`Meili Error [${res.status}]: ${txt}`);
  }
  return res.json();
}

async function waitForTask(taskUid) {
  while (true) {
    const task = await meiliFetch(`/tasks/${taskUid}`);
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed' || task.status === 'canceled') {
      throw new Error(`Task ${taskUid} failed: ${JSON.stringify(task.error)}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }
}

async function loadSlice(startIdx, count) {
  const docs = [];
  const fileStream = fs.createReadStream(JSONL_PATH);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (idx >= startIdx && idx < startIdx + count) {
      docs.push(JSON.parse(line));
    }
    idx++;
    if (idx >= startIdx + count) break;
  }
  return docs;
}

async function setupTestIndex(indexUid, prefixSearch) {
  try {
    const del = await meiliFetch(`/indexes/${indexUid}`, { method: 'DELETE' });
    await waitForTask(del.taskUid);
  } catch (_) {}

  const cRes = await meiliFetch('/indexes', {
    method: 'POST',
    body: JSON.stringify({ uid: indexUid, primaryKey: 'atlas_person_id' })
  });
  await waitForTask(cRes.taskUid);

  const sRes = await meiliFetch(`/indexes/${indexUid}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({ ...BASE_SETTINGS, prefixSearch })
  });
  await waitForTask(sRes.taskUid);
}

const QUERY_SUITES = {
  EXACT_NAME: ['GARCIA', 'RODRIGUEZ', 'GONZALEZ', 'FERNANDEZ', 'LOPEZ'],
  NORMALIZED_NAME: ['maria elena', 'juan carlos', 'jose luis', 'carlos alberto', 'ana maria'],
  PREFIX: ['garc', 'rodr', 'gonz', 'fern', 'lop'],
  ORGANIZATION: ['sociedad', 'asociacion', 'nacional', 'buenos aires', 'cordoba'],
  ROLE: ['director', 'socio', 'gerente', 'presidente', 'apoderado'],
  PROFESSION: ['abogado', 'ingeniero', 'contador', 'medico', 'arquitecto']
};

export async function runContractParityAudit() {
  console.log('================================================================');
  console.log('🧪 SEARCH V2 CONTRACT & PREFIX QUERY PARITY AUDIT');
  console.log('================================================================\n');

  // Load test corpus (10,000 documents)
  console.log('Loading 10,000 validation documents...');
  const testDocs = await loadSlice(0, 10000);
  console.log(`Loaded ${testDocs.length} documents.`);

  const INDEX_V1 = 'atlas_contract_v1_indexing_time';
  const INDEX_V2 = 'atlas_contract_v2_prefix_disabled';

  console.log(`Setting up Index V1 (prefixSearch: indexingTime)...`);
  await setupTestIndex(INDEX_V1, 'indexingTime');

  console.log(`Setting up Index V2 (prefixSearch: disabled)...`);
  await setupTestIndex(INDEX_V2, 'disabled');

  // Seed both indexes with identical 10,000 documents
  console.log('Seeding documents into Index V1...');
  const tasksV1 = [];
  for (let i = 0; i < testDocs.length; i += 2500) {
    const chunk = testDocs.slice(i, i + 2500);
    const r = await meiliFetch(`/indexes/${INDEX_V1}/documents`, { method: 'POST', body: JSON.stringify(chunk) });
    tasksV1.push(r.taskUid);
  }
  for (const uid of tasksV1) await waitForTask(uid);

  console.log('Seeding documents into Index V2...');
  const tasksV2 = [];
  for (let i = 0; i < testDocs.length; i += 2500) {
    const chunk = testDocs.slice(i, i + 2500);
    const r = await meiliFetch(`/indexes/${INDEX_V2}/documents`, { method: 'POST', body: JSON.stringify(chunk) });
    tasksV2.push(r.taskUid);
  }
  for (const uid of tasksV2) await waitForTask(uid);

  // Check document completeness
  const statsV1 = await meiliFetch(`/indexes/${INDEX_V1}/stats`);
  const statsV2 = await meiliFetch(`/indexes/${INDEX_V2}/stats`);

  console.log(`Index V1 Doc Count: ${statsV1.numberOfDocuments}`);
  console.log(`Index V2 Doc Count: ${statsV2.numberOfDocuments}`);

  const missingDocsV1 = testDocs.length - statsV1.numberOfDocuments;
  const missingDocsV2 = testDocs.length - statsV2.numberOfDocuments;

  // Run Query Suites across both indexes
  let totalQueries = 0;
  let matchingQueries = 0;
  let totalVisibleDuplicates = 0;
  const suiteResults = {};

  for (const [suiteName, queries] of Object.entries(QUERY_SUITES)) {
    console.log(`\nEvaluating Suite: ${suiteName}...`);
    const queryDiffs = [];

    for (const q of queries) {
      totalQueries++;
      const [res1, res2] = await Promise.all([
        meiliFetch(`/indexes/${INDEX_V1}/search`, { method: 'POST', body: JSON.stringify({ q, limit: 10 }) }),
        meiliFetch(`/indexes/${INDEX_V2}/search`, { method: 'POST', body: JSON.stringify({ q, limit: 10 }) })
      ]);

      const hits1 = res1.hits || [];
      const hits2 = res2.hits || [];

      // Check duplicates
      const seenIds = new Set();
      for (const h of hits2) {
        if (seenIds.has(h.atlas_person_id)) totalVisibleDuplicates++;
        seenIds.add(h.atlas_person_id);
      }

      // Check top hit primary identity
      const top1 = hits1[0]?.atlas_person_id;
      const top2 = hits2[0]?.atlas_person_id;
      const totalHitsMatch = res1.estimatedTotalHits === res2.estimatedTotalHits;
      const topMatches = top1 === top2;

      if (topMatches && hits1.length === hits2.length) {
        matchingQueries++;
      } else {
        queryDiffs.push({
          query: q,
          v1_hits: hits1.length,
          v2_hits: hits2.length,
          v1_top: top1,
          v2_top: top2,
          total_v1: res1.estimatedTotalHits,
          total_v2: res2.estimatedTotalHits
        });
      }
    }

    suiteResults[suiteName] = {
      total: queries.length,
      perfectMatch: queries.length - queryDiffs.length,
      diffs: queryDiffs
    };
    console.log(`  ${suiteName}: ${suiteResults[suiteName].perfectMatch}/${queries.length} matching`);
  }

  const overallParity = Number(((matchingQueries / totalQueries) * 100).toFixed(2));

  const contractAudit = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_DOCUMENTS: testDocs.length,
    INDEX_V1_DOCS: statsV1.numberOfDocuments,
    INDEX_V2_DOCS: statsV2.numberOfDocuments,
    MISSING_DOCUMENTS: missingDocsV1 + missingDocsV2,
    VISIBLE_DUPLICATES: totalVisibleDuplicates,
    TOTAL_QUERIES_TESTED: totalQueries,
    MATCHING_QUERIES: matchingQueries,
    CONTRACT_PARITY_PERCENT: `${overallParity}%`,
    SUITES: suiteResults,
    PREFIX_OPTIMIZATION_DECISION: (missingDocsV2 === 0 && totalVisibleDuplicates === 0 && overallParity >= 90) ? 'ACCEPT_PREFIX_OPTIMIZATION' : 'REJECT_PREFIX_OPTIMIZATION'
  };

  console.log('\n================================================================');
  console.log('🏆 SEARCH CONTRACT & PREFIX PARITY AUDIT SUMMARY');
  console.log('================================================================');
  console.log(`MISSING_DOCUMENTS            : ${contractAudit.MISSING_DOCUMENTS}`);
  console.log(`VISIBLE_DUPLICATES           : ${contractAudit.VISIBLE_DUPLICATES}`);
  console.log(`TOTAL_QUERIES_TESTED         : ${contractAudit.TOTAL_QUERIES_TESTED}`);
  console.log(`CONTRACT_PARITY_PERCENT      : ${contractAudit.CONTRACT_PARITY_PERCENT}`);
  console.log(`PREFIX_OPTIMIZATION_DECISION : ${contractAudit.PREFIX_OPTIMIZATION_DECISION}`);
  console.log('================================================================\n');

  fs.writeFileSync(
    'reports/atlas/search/atlas_search_v2_contract_parity_audit.json',
    JSON.stringify(contractAudit, null, 2)
  );

  // Cleanup test indices
  await meiliFetch(`/indexes/${INDEX_V1}`, { method: 'DELETE' }).catch(() => {});
  await meiliFetch(`/indexes/${INDEX_V2}`, { method: 'DELETE' }).catch(() => {});

  return contractAudit;
}

runContractParityAudit().catch(err => {
  console.error('Contract parity audit failed:', err);
  process.exit(1);
});
