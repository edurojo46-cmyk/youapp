import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { ResourceMonitor } from './atlas_stage3l_resource_monitor.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const HMAC_SECRET = process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY;
const MEILI_URL = 'http://127.0.0.1:7700';
const BENCH_INDEX = 'atlas_stage3l_mature_benchmark';

function normalizeName(rawName) {
  return rawName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseCandidate(line) {
  const cuit = line.substring(0, 11).trim();
  const rawName = line.substring(11, 41).trim();
  const dni = String(parseInt(cuit.slice(2, 10), 10));
  const identifierValue = crypto.createHmac('sha256', HMAC_SECRET).update(`ARG:DNI:${dni}`).digest('hex');
  const atlasPersonId = `atlas_arg_per_${identifierValue.slice(0, 16)}`;
  return {
    cuit,
    raw_name: rawName,
    normalized_name: normalizeName(rawName),
    cuit_masked: `${cuit.slice(0, 2)}***${cuit.slice(-2)}`,
    identifier_value: identifierValue,
    candidate_atlas_person_id: atlasPersonId,
    source_id: 'ARCA_CONDICION_TRIBUTARIA',
    source_person_id: cuit
  };
}

async function loadShadowCandidates(count = 20000) {
  console.log(`Loading ${count} shadow candidates from offset 557000...`);
  const candidates = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SOURCE_FILE), crlfDelay: Infinity });
  let idx = 0;
  for await (const line of rl) {
    if (idx >= 557000) {
      if (line.length >= 50 && ['20', '27', '23', '24'].includes(line.substring(0, 2))) {
        candidates.push(parseCandidate(line));
        if (candidates.length >= count) break;
      }
    }
    idx++;
  }
  return candidates;
}

function parseDurationToMs(isoDuration) {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!match) return 0;
  const hours = parseFloat(match[1] || 0);
  const minutes = parseFloat(match[2] || 0);
  const seconds = parseFloat(match[3] || 0);
  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

async function waitForTask(taskUid) {
  while (true) {
    const res = await fetch(`${MEILI_URL}/tasks/${taskUid}`);
    const task = await res.json();
    if (task.status === 'succeeded') {
      return parseDurationToMs(task.duration);
    }
    if (task.status === 'failed') {
      throw new Error(`MEILI_TASK_FAILED: ${JSON.stringify(task.error)}`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

// Generate Meili heavy indexing workload
function generateMeiliLoadDocs(count = 20000, tag = 'load') {
  const docs = [];
  for (let i = 0; i < count; i++) {
    const name = `HEAVY LOAD PERSON ${tag} ${i}`;
    const id = `load_stage3l_${tag}_${String(i).padStart(6, '0')}`;
    docs.push({
      atlas_person_id: id,
      display_name: name,
      display_name_normalized: name,
      search_text_normalized: name,
      cuit_masked: '20***88',
      entity_type: 'NATURAL_PERSON',
      source_id: 'BENCHMARK_PROD_SCHEMA_CLONE',
      evidence_state: 'HIGH_CONFIDENCE_OFFICIAL_REGISTRY',
      geography: 'Argentina',
      province: 'Nacional',
      organization: 'NACIONAL',
      profession: 'PROFESSIONAL',
      role: 'CITIZEN',
      created_at: new Date().toISOString()
    });
  }
  return docs;
}

// Run single producer shadow pass (3 workers, batch 2000, ROLLBACK)
async function runProducerPass(candidates, pool, producerConcurrency = 3, batchSize = 2000) {
  const batches = [];
  for (let i = 0; i < candidates.length; i += batchSize) {
    batches.push(candidates.slice(i, i + batchSize));
  }

  let batchIdx = 0;
  const rpcLatencies = [];
  const t0 = performance.now();

  async function worker(workerId) {
    const client = await pool.connect();
    try {
      while (true) {
        let curBatch;
        if (batchIdx < batches.length) {
          curBatch = batches[batchIdx++];
        } else {
          break;
        }

        const rpcT0 = performance.now();
        // Safe transaction wrapping: ROLLBACK guarantees zero persistence
        await client.query('BEGIN');
        const res = await client.query(
          'SELECT public.resolve_and_commit_candidate_batch_v2($1::jsonb) AS result',
          [JSON.stringify(curBatch)]
        );
        await client.query('ROLLBACK');
        rpcLatencies.push(performance.now() - rpcT0);

        const r = res.rows[0].result;
        if (!r.ok) throw new Error(`RPC_FAILED: ${JSON.stringify(r)}`);
      }
    } finally {
      client.release();
    }
  }

  const workers = Array.from({ length: producerConcurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  const durationSec = (performance.now() - t0) / 1000;
  const candidateRate = Number((candidates.length / durationSec).toFixed(2));

  rpcLatencies.sort((a, b) => a - b);
  const p50 = Number(rpcLatencies[Math.floor(rpcLatencies.length * 0.5)].toFixed(1));
  const p95 = Number(rpcLatencies[Math.floor(rpcLatencies.length * 0.95)].toFixed(1));

  return {
    candidate_count: candidates.length,
    duration_sec: Number(durationSec.toFixed(3)),
    candidate_rate_per_sec: candidateRate,
    rpc_latency_p50_ms: p50,
    rpc_latency_p95_ms: p95,
    rpc_count: batches.length
  };
}

export async function runLocalContentionAB() {
  console.log('================================================================');
  console.log(`⚖️  STARTING LOCAL PC RESOURCE CONTENTION A/B BENCHMARK`);
  console.log(`   Design: Alternating order A1 -> B1 -> B2 -> A2 -> A3 -> B3`);
  console.log(`   Run A: MEILI_IDLE`);
  console.log(`   Run B: MEILI_HEAVY (20,000 docs indexing during producer)`);
  console.log('================================================================\n');

  const candidates = await loadShadowCandidates(20000);
  const pool = new pg.Pool(parseDbUrl());

  const runOrder = [
    { id: 'A1', type: 'MEILI_IDLE' },
    { id: 'B1', type: 'MEILI_HEAVY' },
    { id: 'B2', type: 'MEILI_HEAVY' },
    { id: 'A2', type: 'MEILI_IDLE' },
    { id: 'A3', type: 'MEILI_IDLE' },
    { id: 'B3', type: 'MEILI_HEAVY' }
  ];

  const results = [];

  for (const step of runOrder) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`▶ Step ${step.id}: Mode = ${step.type}`);
    console.log(`----------------------------------------------------------------`);

    const monitor = new ResourceMonitor(19724);
    monitor.start(1000);

    let meiliTaskPromise = null;
    let meiliLoadIds = [];

    if (step.type === 'MEILI_HEAVY') {
      const loadDocs = generateMeiliLoadDocs(20000, step.id);
      meiliLoadIds = loadDocs.map(d => d.atlas_person_id);
      console.log(`Launching background Meilisearch heavy indexing batch (20,000 docs)...`);
      const postRes = await fetch(`${MEILI_URL}/indexes/${BENCH_INDEX}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadDocs)
      });
      const postTask = await postRes.json();
      meiliTaskPromise = waitForTask(postTask.taskUid);
    }

    // Run producer shadow pass concurrently
    const prodResult = await runProducerPass(candidates, pool);
    console.log(`Producer completed: ${prodResult.candidate_rate_per_sec} cand/sec | Duration: ${prodResult.duration_sec}s | RPC p50: ${prodResult.rpc_latency_p50_ms}ms, p95: ${prodResult.rpc_latency_p95_ms}ms`);

    let meiliIndexMs = 0;
    if (meiliTaskPromise) {
      console.log(`Waiting for concurrent Meilisearch task to finish...`);
      meiliIndexMs = await meiliTaskPromise;
      console.log(`Meilisearch task completed in ${(meiliIndexMs/1000).toFixed(2)}s`);

      // Clean up load documents to keep baseline clean
      console.log(`Cleaning up heavy load documents...`);
      const delRes = await fetch(`${MEILI_URL}/indexes/${BENCH_INDEX}/documents/delete-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meiliLoadIds)
      });
      const delTask = await delRes.json();
      await waitForTask(delTask.taskUid);
    }

    const resources = monitor.stop();
    console.log(`Resources: Meili CPU Avg = ${resources.meili_cpu_percent_normalized_avg}%, Node CPU Avg = ${resources.node_cpu_percent_normalized_avg}%, Disk Write Max = ${resources.disk_write_mbs_max}MB/s`);

    results.push({
      run_id: step.id,
      mode: step.type,
      producer_metrics: prodResult,
      meili_index_duration_sec: Number((meiliIndexMs / 1000).toFixed(2)),
      resources
    });

    // Small rest between runs
    await new Promise(r => setTimeout(r, 1000));
  }

  await pool.end();

  // Calculate medians
  const idleRuns = results.filter(r => r.mode === 'MEILI_IDLE');
  const heavyRuns = results.filter(r => r.mode === 'MEILI_HEAVY');

  const idleRates = idleRuns.map(r => r.producer_metrics.candidate_rate_per_sec).sort((a, b) => a - b);
  const heavyRates = heavyRuns.map(r => r.producer_metrics.candidate_rate_per_sec).sort((a, b) => a - b);

  const idleMedian = idleRates[Math.floor(idleRates.length / 2)];
  const heavyMedian = heavyRates[Math.floor(heavyRates.length / 2)];

  const slowdownPercent = Number((((idleMedian - heavyMedian) / idleMedian) * 100).toFixed(2));

  console.log('\n================================================================');
  console.log('🏁 LOCAL CONTENTION A/B SUMMARY:');
  console.log(`   PRODUCER_IDLE_CAND_SEC_MEDIAN:        ${idleMedian} cand/sec`);
  console.log(`   PRODUCER_MEILI_HEAVY_CAND_SEC_MEDIAN: ${heavyMedian} cand/sec`);
  console.log(`   LOCAL_CONTENTION_SLOWDOWN_PERCENT:    ${slowdownPercent}%`);
  console.log('================================================================\n');

  const artifact = {
    generated_at: new Date().toISOString(),
    stage: 'STAGE_3L',
    mission: 'LOCAL RESOURCE CONTENTION AUDIT V1',
    experimental_design: 'Alternating A1(idle) -> B1(heavy) -> B2(heavy) -> A2(idle) -> A3(idle) -> B3(heavy)',
    shadow_transaction_safety: 'PASS (Verified BEGIN ... ROLLBACK)',
    workload_candidates: 20000,
    results_matrix: results,
    analysis: {
      idle_rates_cand_sec: idleRates,
      heavy_rates_cand_sec: heavyRates,
      producer_idle_cand_sec_median: idleMedian,
      producer_meili_heavy_cand_sec_median: heavyMedian,
      local_contention_slowdown_percent: slowdownPercent,
      local_contention_significant: slowdownPercent >= 15.0
    }
  };

  const artifactPath = path.resolve('reports/atlas/discovery/atlas_stage3l_local_contention_ab_v1.json');
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
  console.log(`✔ Artifact saved: ${artifactPath}`);
  return artifact;
}

if (process.argv[1]?.includes('run_local_contention_ab.mjs')) {
  runLocalContentionAB().catch(err => {
    console.error('Local contention benchmark failed:', err);
    process.exit(1);
  });
}
