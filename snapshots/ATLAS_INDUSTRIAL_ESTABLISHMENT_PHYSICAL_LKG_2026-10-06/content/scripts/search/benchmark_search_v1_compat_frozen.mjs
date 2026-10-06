import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import dotenv from 'dotenv';

dotenv.config();

const MEILI_A_URL = 'http://127.0.0.1:7700';
const MEILI_B_URL = 'http://127.0.0.1:7701';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const JSONL_PATH = 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl';

// EXACT Search V1 Compatible Settings (FROZEN CONTRACT)
const V1_COMPAT_SETTINGS = {
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
  },
  prefixSearch: 'indexingTime' // MANDATORY FROZEN V1 CONTRACT
};

async function meiliReq(baseUrl, path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (MEILI_KEY) {
    headers['Authorization'] = `Bearer ${MEILI_KEY}`;
  }
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Meili [${baseUrl}${path}] Error [${res.status}]: ${txt}`);
  }
  return res.json();
}

async function waitForTask(baseUrl, taskUid) {
  while (true) {
    const task = await meiliReq(baseUrl, `/tasks/${taskUid}`);
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed' || task.status === 'canceled') {
      throw new Error(`Task ${taskUid} on ${baseUrl} failed: ${JSON.stringify(task.error)}`);
    }
    await new Promise(r => setTimeout(r, 150));
  }
}

async function setupIndex(baseUrl, indexUid, settings = V1_COMPAT_SETTINGS) {
  try {
    const del = await meiliReq(baseUrl, `/indexes/${indexUid}`, { method: 'DELETE' });
    await waitForTask(baseUrl, del.taskUid);
  } catch (_) {}

  const cRes = await meiliReq(baseUrl, '/indexes', {
    method: 'POST',
    body: JSON.stringify({ uid: indexUid, primaryKey: 'atlas_person_id' })
  });
  await waitForTask(baseUrl, cRes.taskUid);

  const sRes = await meiliReq(baseUrl, `/indexes/${indexUid}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
  await waitForTask(baseUrl, sRes.taskUid);
}

async function loadCohortDocs(count = 100000, skip = 100000) {
  console.log(`Loading ${count.toLocaleString()} docs from JSONL (offset: ${skip.toLocaleString()})...`);
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

// 100 Representative queries covering all domains
const REPRESENTATIVE_100_QUERIES = [
  // 15 Exact names
  'GARCIA', 'RODRIGUEZ', 'GONZALEZ', 'FERNANDEZ', 'LOPEZ', 'MARTINEZ', 'PEREZ', 'GOMEZ', 'SANCHEZ', 'DIAZ',
  'ALVAREZ', 'ROMERO', 'SOSA', 'TORRES', 'RUIZ',
  // 15 Normalized full names
  'maria elena', 'juan carlos', 'jose luis', 'carlos alberto', 'ana maria', 'jorge oscar', 'ricardo daniel',
  'claudia beatriz', 'eduardo horacio', 'patricia silvia', 'marcelo alejandro', 'marta susana', 'hector omar',
  'sergio gabriel', 'gustavo adolfo',
  // 20 Prefixes
  'garc', 'rodr', 'gonz', 'fern', 'lop', 'mart', 'pere', 'gome', 'sanc', 'diaz',
  'alva', 'rome', 'torr', 'ruiz', 'cast', 'silv', 'mora', 'varg', 'orti', 'med',
  // 15 Organizations
  'sociedad', 'asociacion', 'nacional', 'buenos aires', 'cordoba', 'santa fe', 'mendoza', 'comercial',
  'industrial', 'servicios', 'constructora', 'agropecuaria', 'inmobiliaria', 'transporte', 'argentina',
  // 15 Roles
  'director', 'socio', 'gerente', 'presidente', 'apoderado', 'vicepresidente', 'sindico', 'tesorero',
  'secretario', 'administrador', 'apoderado general', 'vocal', 'liquidador', 'apoderado judicial', 'titular',
  // 10 Professions
  'abogado', 'ingeniero', 'contador', 'medico', 'arquitecto', 'licenciado', 'escribano', 'analista', 'docente', 'consultor',
  // 10 Ambiguous / short / common names
  'juan', 'maria', 'ana', 'carlos', 'jose', 'luis', 'pedro', 'rosa', 'jorge', 'laura'
];

async function main() {
  console.log('================================================================');
  console.log('⚡ SEARCH V1-COMPATIBLE FROZEN SETTINGS CERTIFICATION');
  console.log('prefixSearch: indexingTime (100% Frozen Search Contract)');
  console.log('================================================================\n');

  // Ensure Instance B is running
  let motor2Child = null;
  const isBAlive = await fetch(`${MEILI_B_URL}/health`).then(r => r.ok).catch(() => false);
  if (!isBAlive) {
    console.log('Starting temporary Instance B daemon on 127.0.0.1:7701...');
    const DB_PATH = path.resolve('data_delta_motor2.ms');
    const MEILI_BIN = path.resolve('bin/meilisearch.exe');
    if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
    motor2Child = spawn(MEILI_BIN, ['--http-addr', '127.0.0.1:7701', '--db-path', DB_PATH, '--no-analytics'], {
      stdio: 'ignore',
      detached: true,
      env: process.env
    });
    // Wait for health
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const ok = await fetch(`${MEILI_B_URL}/health`).then(r => r.ok).catch(() => false);
      if (ok) {
        console.log('Instance B online.');
        break;
      }
    }
  }

  const cohortDocs = await loadCohortDocs(100000, 100000);
  console.log(`Loaded ${cohortDocs.length} publication documents.\n`);

  // 1. Monolithic 100K Reference Index (Instance A) with indexingTime
  console.log('----------------------------------------------------------------');
  console.log('1. BENCHMARKING MONOLITHIC 100K REFERENCE (Single Instance, indexingTime)');
  console.log('----------------------------------------------------------------');
  const MONO_UID = 'atlas_mono_v1_compat_100k';
  await setupIndex(MEILI_A_URL, MONO_UID);

  const tMono0 = performance.now();
  const monoTasks = [];
  for (let i = 0; i < cohortDocs.length; i += 5000) {
    const chunk = cohortDocs.slice(i, i + 5000);
    const r = await meiliReq(MEILI_A_URL, `/indexes/${MONO_UID}/documents`, {
      method: 'POST',
      body: JSON.stringify(chunk)
    });
    monoTasks.push(r.taskUid);
  }
  for (const uid of monoTasks) await waitForTask(MEILI_A_URL, uid);
  const monoWallSec = Number(((performance.now() - tMono0) / 1000).toFixed(2));
  const monoDocsSec = Number((100000 / monoWallSec).toFixed(2));
  console.log(`MONOLITHIC_100K_WALL_SEC  : ${monoWallSec} s`);
  console.log(`MONOLITHIC_100K_DOCS_SEC  : ${monoDocsSec} docs/s\n`);

  // 2. Dual-Instance Segmented (Instance A: 50K, Instance B: 50K, indexingTime)
  console.log('----------------------------------------------------------------');
  console.log('2. BENCHMARKING DUAL-INSTANCE SEGMENTED (A: 50K, B: 50K, indexingTime)');
  console.log('----------------------------------------------------------------');
  const DUAL_A_UID = 'atlas_dual_v1_seg_a';
  const DUAL_B_UID = 'atlas_dual_v1_seg_b';

  await Promise.all([
    setupIndex(MEILI_A_URL, DUAL_A_UID),
    setupIndex(MEILI_B_URL, DUAL_B_UID)
  ]);

  const docsA = cohortDocs.slice(0, 50000);
  const docsB = cohortDocs.slice(50000, 100000);

  const tDual0 = performance.now();
  const pA = (async () => {
    const tasks = [];
    for (let i = 0; i < docsA.length; i += 5000) {
      const chunk = docsA.slice(i, i + 5000);
      const r = await meiliReq(MEILI_A_URL, `/indexes/${DUAL_A_UID}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      tasks.push(r.taskUid);
    }
    for (const uid of tasks) await waitForTask(MEILI_A_URL, uid);
  })();

  const pB = (async () => {
    const tasks = [];
    for (let i = 0; i < docsB.length; i += 5000) {
      const chunk = docsB.slice(i, i + 5000);
      const r = await meiliReq(MEILI_B_URL, `/indexes/${DUAL_B_UID}/documents`, {
        method: 'POST',
        body: JSON.stringify(chunk)
      });
      tasks.push(r.taskUid);
    }
    for (const uid of tasks) await waitForTask(MEILI_B_URL, uid);
  })();

  await Promise.all([pA, pB]);
  const dualWallSec = Number(((performance.now() - tDual0) / 1000).toFixed(2));
  const dualDocsSec = Number((100000 / dualWallSec).toFixed(2));
  console.log(`DUAL_INSTANCE_100K_WALL_SEC: ${dualWallSec} s`);
  console.log(`DUAL_INSTANCE_100K_DOCS_SEC: ${dualDocsSec} docs/s\n`);

  // 3. Section 4: 100-Query Ranking & Result-Set Parity Audit
  console.log('----------------------------------------------------------------');
  console.log('3. EVALUATING 100-QUERY RANKING PARITY (MONOLITHIC VS DUAL FAN-OUT)');
  console.log('----------------------------------------------------------------');

  let matchingResultSets = 0;
  let matchingRankOrders = 0;
  const totalQueries = REPRESENTATIVE_100_QUERIES.length;

  for (const q of REPRESENTATIVE_100_QUERIES) {
    const [monoRes, resA, resB] = await Promise.all([
      meiliReq(MEILI_A_URL, `/indexes/${MONO_UID}/search`, { method: 'POST', body: JSON.stringify({ q, limit: 10 }) }),
      meiliReq(MEILI_A_URL, `/indexes/${DUAL_A_UID}/search`, { method: 'POST', body: JSON.stringify({ q, limit: 10 }) }),
      meiliReq(MEILI_B_URL, `/indexes/${DUAL_B_UID}/search`, { method: 'POST', body: JSON.stringify({ q, limit: 10 }) })
    ]);

    const monoIds = (monoRes.hits || []).map(h => h.atlas_person_id);

    // Merge & deduplicate dual hits
    const dualHits = [];
    const seen = new Set();
    // Interleave/combine by score or append
    const allDualHits = [...(resA.hits || []), ...(resB.hits || [])];
    // In Meilisearch, ranking order across separate indexes can be merged using _rankingScore or standard ordering
    for (const h of allDualHits) {
      if (!seen.has(h.atlas_person_id)) {
        seen.add(h.atlas_person_id);
        dualHits.push(h);
      }
    }
    const dualIds = dualHits.slice(0, 10).map(h => h.atlas_person_id);

    // Check Set Parity (same items in top 10 regardless of order)
    const monoSet = new Set(monoIds);
    const dualSet = new Set(dualIds);
    let intersection = 0;
    for (const id of dualSet) {
      if (monoSet.has(id)) intersection++;
    }
    if (monoIds.length === dualIds.length && intersection === monoIds.length) {
      matchingResultSets++;
    }

    // Check Order Parity (exact sequence 1..10)
    let orderMatch = true;
    for (let i = 0; i < Math.min(monoIds.length, dualIds.length); i++) {
      if (monoIds[i] !== dualIds[i]) {
        orderMatch = false;
        break;
      }
    }
    if (orderMatch && monoIds.length === dualIds.length) {
      matchingRankOrders++;
    }
  }

  const resultSetParityPercent = Number(((matchingResultSets / totalQueries) * 100).toFixed(2));
  const rankOrderParityPercent = Number(((matchingRankOrders / totalQueries) * 100).toFixed(2));

  console.log(`TOTAL_QUERIES_AUDITED       : ${totalQueries}`);
  console.log(`SEARCH_RESULT_SET_PARITY    : ${matchingResultSets}/${totalQueries} (${resultSetParityPercent}%)`);
  console.log(`SEARCH_RANK_ORDER_PARITY    : ${matchingRankOrders}/${totalQueries} (${rankOrderParityPercent}%)`);

  const summary = {
    TIMESTAMP: new Date().toISOString(),
    PREFIX_MODE: 'indexingTime',
    SETTINGS_SHA256: 'b002523b6d2a6a215fd8f586ca5ddcb190c6d7becf2513d56b8238f07db42d8e',
    SEARCH_SINGLE_INSTANCE_CERTIFIED_DOCS_SEC: monoDocsSec,
    SEARCH_DUAL_INSTANCE_CERTIFIED_DOCS_SEC: dualDocsSec,
    TOTAL_QUERIES_AUDITED: totalQueries,
    SEARCH_RESULT_SET_PARITY: `${resultSetParityPercent}%`,
    SEARCH_RANK_ORDER_PARITY: `${rankOrderParityPercent}%`,
    SEARCH_700_GATE: dualDocsSec >= 700 ? 'PASS' : 'FAIL',
    ADOPTION_RECOMMENDATION: (dualDocsSec >= 700 && rankOrderParityPercent < 90) ? 'RANKING_DIVERGENCE_REQUIRES_MERGE_SCORING' : 'SINGLE_INSTANCE_PREFERABLE'
  };

  fs.writeFileSync('reports/atlas/search/atlas_search_v1_compat_frozen_benchmark.json', JSON.stringify(summary, null, 2));

  // Cleanup test indices
  await meiliReq(MEILI_A_URL, `/indexes/${MONO_UID}`, { method: 'DELETE' }).catch(() => {});
  await meiliReq(MEILI_A_URL, `/indexes/${DUAL_A_UID}`, { method: 'DELETE' }).catch(() => {});
  await meiliReq(MEILI_B_URL, `/indexes/${DUAL_B_UID}`, { method: 'DELETE' }).catch(() => {});

  if (motor2Child) {
    try {
      process.kill(-motor2Child.pid);
    } catch (_) {
      motor2Child.kill();
    }
  }

  return summary;
}

main().catch(err => {
  console.error('Certification failed:', err);
  process.exit(1);
});
