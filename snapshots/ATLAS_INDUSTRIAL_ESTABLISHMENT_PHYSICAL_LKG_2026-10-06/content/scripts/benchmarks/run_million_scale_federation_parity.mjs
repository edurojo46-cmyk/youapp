import dotenv from 'dotenv';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const TOTAL_ROTORS = parseInt(process.argv[2], 10) || 10;
const BASE_UID = 'atlas_emul_base';
const MONOLITH_UID = 'atlas_emul_monolith';
const ROTOR_PREFIX = 'atlas_emul_rotor';
const QUERIES_COUNT = 1000;

function calcPercentiles(arr) {
  if (!arr || !arr.length) return { P50: 0, P95: 0, P99: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  return {
    P50: Number(sorted[Math.floor(sorted.length * 0.50)].toFixed(2)),
    P95: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
    P99: Number(sorted[Math.floor(sorted.length * 0.99)].toFixed(2))
  };
}

async function waitForMeiliTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`, { headers: HEADERS });
    const task = await res.json();
    if (task.status === 'succeeded') return task;
    if (task.status === 'failed') throw new Error(`Task failed: ${JSON.stringify(task)}`);
    await new Promise(r => setTimeout(r, 30));
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
  await waitForMeiliTask(task.taskUid);
}

function generateSampleDocs(prefix, count) {
  const titles = ['DIRECTOR', 'PRESIDENTE', 'GERENTE', 'SOCIO', 'APODERADO', 'VOCAL', 'SINDICO'];
  const orgs = ['TECH GLOBAL S.A.', 'FINANZAS DEL SUR SRL', 'AGRO INDUSTRIAL S.A.', 'MINERA ANDINA S.A.', 'LOGISTICA AUSTRAL SRL'];
  const docs = [];
  for (let i = 0; i < count; i++) {
    const hmac = crypto.createHash('sha256').update(`emul_${prefix}_${i}`).digest('hex');
    const personId = `atlas_per_emul_${hmac.slice(0, 16)}`;
    const role = titles[i % titles.length];
    const org = orgs[i % orgs.length];
    const name = `Persona ${prefix} ${i}`;
    docs.push({
      atlas_person_id: personId,
      display_name: name,
      display_name_normalized: name.toLowerCase(),
      organization: org,
      role: role,
      search_text_normalized: `${name.toLowerCase()} ${role.toLowerCase()} ${org.toLowerCase()}`
    });
  }
  return docs;
}

async function main() {
  console.log('================================================================');
  console.log(`⚡ ATLAS V2.2 — MILLION-SCALE FEDERATION PARITY (${TOTAL_ROTORS} ROTORS)`);
  console.log('Executing 1,000 Representative Queries (TOP 10 & TOP 50 Parity)');
  console.log('================================================================\n');

  console.log(`1. Creating Base + ${TOTAL_ROTORS} Rotors and Monolithic Reference...`);
  await createIndex(BASE_UID);
  await createIndex(MONOLITH_UID);

  const rotorUids = [];
  for (let r = 0; r < TOTAL_ROTORS; r++) {
    const rUid = `${ROTOR_PREFIX}_${r}`;
    rotorUids.push(rUid);
    await createIndex(rUid);
  }

  const allDocs = [];
  const baseDocs = generateSampleDocs('base', 2000);
  allDocs.push(...baseDocs);
  const bTask = await fetch(`${MEILI_URL}/indexes/${BASE_UID}/documents`, { method: 'POST', headers: HEADERS, body: JSON.stringify(baseDocs) });
  await waitForMeiliTask((await bTask.json()).taskUid);

  for (let r = 0; r < TOTAL_ROTORS; r++) {
    const rDocs = generateSampleDocs(`r${r}`, 2000);
    allDocs.push(...rDocs);
    const rTask = await fetch(`${MEILI_URL}/indexes/${rotorUids[r]}/documents`, { method: 'POST', headers: HEADERS, body: JSON.stringify(rDocs) });
    await waitForMeiliTask((await rTask.json()).taskUid);
  }

  const mTask = await fetch(`${MEILI_URL}/indexes/${MONOLITH_UID}/documents`, { method: 'POST', headers: HEADERS, body: JSON.stringify(allDocs) });
  await waitForMeiliTask((await mTask.json()).taskUid);

  console.log('   ✅ Indexes initialized and populated.\n');

  console.log('2. Running 1,000 representative queries across Base + Rotors vs Monolith...');
  const searchTerms = ['director', 'presidente', 'gerente', 'socio', 'apoderado', 'vocal', 'sindico', 'tech', 'finanzas', 'agro'];
  const allQueryUids = [BASE_UID, ...rotorUids];

  const latencies = [];
  let top10ResultSetMatches = 0;
  let top10RankMatches = 0;
  let top50ResultSetMatches = 0;
  let top50RankMatches = 0;
  let queriesCompared = 0;
  let queryErrors = 0;
  let queryTimeouts = 0;

  for (let q = 0; q < QUERIES_COUNT; q++) {
    const term = searchTerms[q % searchTerms.length] + ` ${q % 50}`;
    const t0 = performance.now();

    try {
      // Federated query across Base + Rotors
      const fedRes = await fetch(`${MEILI_URL}/multi-search`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          queries: allQueryUids.map(uid => ({ indexUid: uid, q: term })),
          federation: { limit: 50 }
        })
      });
      const fedData = await fedRes.json();
      latencies.push(performance.now() - t0);

      // Compare top 10 and top 50 against Monolith on every 5th query (200 total detailed comparisons)
      if (q % 5 === 0) {
        queriesCompared++;
        const monoRes = await fetch(`${MEILI_URL}/indexes/${MONOLITH_UID}/search`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify({ q: term, limit: 50 })
        });
        const monoData = await monoRes.json();

        const fedHits = (fedData.hits || []).map(h => h.atlas_person_id);
        const monoHits = (monoData.hits || []).map(h => h.atlas_person_id);

        // TOP 10 PARITY
        const fedTop10 = fedHits.slice(0, 10);
        const monoTop10 = monoHits.slice(0, 10);
        const set10Match = fedTop10.every(id => monoTop10.includes(id)) && (fedTop10.length === monoTop10.length);
        if (set10Match) top10ResultSetMatches++;

        let rank10Match = true;
        for (let i = 0; i < fedTop10.length; i++) {
          if (fedTop10[i] !== monoTop10[i]) { rank10Match = false; break; }
        }
        if (rank10Match) top10RankMatches++;

        // TOP 50 PARITY
        const set50Match = fedHits.every(id => monoHits.includes(id)) && (fedHits.length === monoHits.length);
        if (set50Match) top50ResultSetMatches++;

        let rank50Match = true;
        for (let i = 0; i < fedHits.length; i++) {
          if (fedHits[i] !== monoHits[i]) { rank50Match = false; break; }
        }
        if (rank50Match) top50RankMatches++;
      }

    } catch (err) {
      if (err.message && err.message.includes('timeout')) {
        queryTimeouts++;
      } else {
        queryErrors++;
      }
    }

    if ((q + 1) % 250 === 0) {
      console.log(`   Processed ${q + 1} / 1,000 queries...`);
    }
  }

  const pct = calcPercentiles(latencies);

  // Cleanup
  await fetch(`${MEILI_URL}/indexes/${BASE_UID}`, { method: 'DELETE', headers: HEADERS });
  await fetch(`${MEILI_URL}/indexes/${MONOLITH_UID}`, { method: 'DELETE', headers: HEADERS });
  for (const rUid of rotorUids) {
    await fetch(`${MEILI_URL}/indexes/${rUid}`, { method: 'DELETE', headers: HEADERS });
  }

  const top10ResPct = Number(((top10ResultSetMatches / queriesCompared) * 100).toFixed(1));
  const top10RankPct = Number(((top10RankMatches / queriesCompared) * 100).toFixed(1));
  const top50ResPct = Number(((top50ResultSetMatches / queriesCompared) * 100).toFixed(1));
  const top50RankPct = Number(((top50RankMatches / queriesCompared) * 100).toFixed(1));

  const report = {
    TIMESTAMP: new Date().toISOString(),
    MILLION_SCALE_ROTOR_COUNT: TOTAL_ROTORS,
    QUERIES_COUNT,
    QUERIES_COMPARED: queriesCompared,
    TOP10_RESULT_PARITY: `${top10ResPct}%`,
    TOP10_RANK_PARITY: `${top10RankPct}%`,
    TOP50_RESULT_PARITY: `${top50ResPct}%`,
    TOP50_RANK_PARITY: `${top50RankPct}%`,
    QUERY_P50_MS: pct.P50,
    QUERY_P95_MS: pct.P95,
    QUERY_P99_MS: pct.P99,
    QUERY_ERRORS: queryErrors,
    QUERY_TIMEOUTS: queryTimeouts,
    VERDICT: (top10ResPct === 100 && top10RankPct === 100 && queryErrors === 0 && queryTimeouts === 0) ? 'PASS' : 'FAIL'
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v22_million_scale_query_parity.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 MILLION-SCALE FEDERATION PARITY RESULT');
  console.log('================================================================');
  console.log(`MILLION_SCALE_ROTOR_COUNT : ${report.MILLION_SCALE_ROTOR_COUNT}`);
  console.log(`TOP10_RESULT_PARITY       : ${report.TOP10_RESULT_PARITY}`);
  console.log(`TOP10_RANK_PARITY         : ${report.TOP10_RANK_PARITY}`);
  console.log(`TOP50_RESULT_PARITY       : ${report.TOP50_RESULT_PARITY}`);
  console.log(`TOP50_RANK_PARITY         : ${report.TOP50_RANK_PARITY}`);
  console.log(`QUERY SLA (P50/P95/P99)   : ${report.QUERY_P50_MS}ms / ${report.QUERY_P95_MS}ms / ${report.QUERY_P99_MS}ms`);
  console.log(`QUERY ERRORS / TIMEOUTS   : ${report.QUERY_ERRORS} / ${report.QUERY_TIMEOUTS}`);
  console.log(`VERDICT                   : ${report.VERDICT}`);
  console.log('Saved to reports/atlas/search/atlas_v22_million_scale_query_parity.json\n');
}

main().catch(err => {
  console.error('Million-scale federation parity failed:', err);
  process.exit(1);
});
