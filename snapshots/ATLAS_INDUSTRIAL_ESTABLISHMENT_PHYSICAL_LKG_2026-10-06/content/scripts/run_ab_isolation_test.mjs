/**
 * scripts/run_ab_isolation_test.mjs
 * 
 * A/B ISOLATION BENCHMARK (75s per test)
 * TEST A: Reconcile + Search V2 (NO Outbox Drain)
 * TEST B: Reconcile + Search V2 (WITH Outbox Drain)
 * 
 * Compares:
 * - Throughput (unique people/s)
 * - Avg Stage & Reconcile ms
 * - Search Latency (P50, P95, P99, Max, Timeouts)
 * - Errors & Outbox backlog
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))          url        = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY='))   serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db:   { schema: 'public' }
});

const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

const DURATION_MS  = 75 * 1000; // 75 seconds per test
const BLOCK_SIZE   = 5000;
const SOURCE_PATH  = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const SEP          = '═'.repeat(70);

function computeHmacId(doc) {
  return crypto.createHmac('sha256', hmacSecret || 'ATLAS_ARGENTINA_CORE_PEP_CANONICAL_2026')
    .update(String(doc).trim())
    .digest('hex');
}

function computeSourceHash(numCorrelativo, doc, nombre) {
  return crypto.createHash('sha256')
    .update(`${numCorrelativo}:${doc}:${nombre.trim().toUpperCase()}`)
    .digest('hex');
}

function formatName(raw) {
  return raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

function percentile(arr, pct) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return Number((sorted[Math.floor(sorted.length * pct)] || sorted[sorted.length - 1]).toFixed(1));
}

// ── Search Worker ───────────────────────────────────────────────────────────
function makeSearchWorker() {
  const latencies = [];
  let timeouts = 0;
  let active = true;
  const terms = ['SOCIEDAD', 'GOMEZ', 'SALUD', 'FERNANDEZ', 'PRESIDENTE', 'DIRECTOR', 'GERENTE'];
  let idx = 0;
  let coldStart = 0;

  async function run() {
    while (active) {
      const term = terms[idx++ % terms.length];
      const t0 = performance.now();
      try {
        const res = await AtlasPeopleSearchV2.search({ query: term, limit: 5 });
        const dt  = performance.now() - t0;
        if (latencies.length === 0) coldStart = Number(dt.toFixed(1));
        latencies.push(dt);
        if (res?.error) timeouts++;
      } catch {
        timeouts++;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const promise = run();
  return {
    stop: () => { active = false; return promise; },
    stats: () => ({
      probes: latencies.length,
      coldStart,
      timeouts,
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length ? Number(Math.max(...latencies).toFixed(1)) : 0
    })
  };
}

// ── Publisher Worker ────────────────────────────────────────────────────────
function makePublisherWorker() {
  let active = true;
  let published = 0;
  let drains = 0;

  async function run() {
    while (active) {
      try {
        const { data, error } = await supabase.rpc('atlas_drain_search_outbox_controlled_v2', {
          p_batch_size: 500
        });
        if (!error && data?.published_rows > 0) {
          published += data.published_rows;
          drains++;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  const promise = run();
  return {
    stop: () => { active = false; return promise; },
    stats: () => ({ published, drains })
  };
}

// ── Clean DB helper ─────────────────────────────────────────────────────────
async function cleanDatabase() {
  await supabase.from('benchmark_people_staging_0').delete().neq('source_id', '__impossible__');
  await supabase.from('benchmark_people_staging_1').delete().neq('source_id', '__impossible__');
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'clean_0', p_block_id: 0 });
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'clean_1', p_block_id: 1 });
}

// ── Single Test Runner ──────────────────────────────────────────────────────
async function runSingleTest(testName, withDrain) {
  console.log(`\n${SEP}`);
  console.log(`🧪 STARTING ${testName} (Drain: ${withDrain ? 'ENABLED' : 'DISABLED'})`);
  console.log(`   Duration: ${DURATION_MS / 1000}s | Block Size: ${BLOCK_SIZE}`);
  console.log(`${SEP}`);

  await cleanDatabase();

  const searchWorker = makeSearchWorker();
  const pubWorker    = withDrain ? makePublisherWorker() : null;

  const startTime = performance.now();
  const processedPeople = new Set();
  let totalStaged = 0;
  let totalReconciled = 0;
  let stageErrors = 0;
  let reconcileErrors = 0;
  let blockId = 0;
  let stageBuffer = [];
  let pendingReconcile = null;

  const stageDurations = [];
  const reconcileDurations = [];

  async function flushBlock(buffer, bId) {
    const dedup = new Map();
    for (const item of buffer) dedup.set(`${item.source_id}:${item.source_person_id}`, item);
    const cleanBlock = Array.from(dedup.values());

    const t0Stage = performance.now();
    const stagePromise = supabase.rpc('atlas_stage_people_bulk_v2', {
      p_run_id: testName,
      p_block_id: bId,
      p_rows: cleanBlock
    }).then(res => {
      const dt = performance.now() - t0Stage;
      stageDurations.push(dt);
      if (res.error) {
        stageErrors++;
        console.error(`  [Stage Error B${bId}]: ${res.error.message}`);
        return { dt, count: 0 };
      }
      return { dt, count: cleanBlock.length };
    });

    const reconcileOld = pendingReconcile;
    const [stageResult, reconcileResult] = await Promise.all([
      stagePromise,
      reconcileOld || Promise.resolve(null)
    ]);

    totalStaged += stageResult.count;
    if (reconcileResult?.data) {
      totalReconciled += reconcileResult.data.staged_total ?? 0;
    }

    const t0Rec = performance.now();
    pendingReconcile = supabase.rpc('atlas_reconcile_and_commit_staging_v2', {
      p_run_id: testName,
      p_block_id: bId
    }).then(res => {
      const dt = performance.now() - t0Rec;
      reconcileDurations.push(dt);
      if (res.error) {
        reconcileErrors++;
        console.error(`  [Reconcile Error B${bId}]: ${res.error.message}`);
        return { dt, data: null };
      }
      return { dt, data: res.data };
    });

    return stageResult;
  }

  while ((performance.now() - startTime) < DURATION_MS) {
    const igjRl = readline.createInterface({
      input: fs.createReadStream(SOURCE_PATH, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    for await (const line of igjRl) {
      if ((performance.now() - startTime) >= DURATION_MS) break;

      const match = line.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"/);
      if (!match) continue;

      const [, numCorrelativo, nombre, , docNum, , tipoSoc] = match;
      const cleanDoc = docNum.replace(/\D/g, '');
      if (!cleanDoc || cleanDoc.length < 6 || cleanDoc.length > 9 || !nombre || nombre.trim().length < 3) continue;

      const displayName   = formatName(nombre);
      const orgName       = `Sociedad Correlativo ${numCorrelativo} (${tipoSoc.trim() || 'SOCIEDAD COMERCIAL'})`;
      const roleName      = `AUTORIDAD SOCIETARIA (${tipoSoc.trim() || 'DIRECTORIO'})`;
      const searchNorm    = `${displayName} ${roleName} ${orgName}`.toLowerCase().replace(/\s+/g, ' ').trim();
      const docHmac       = computeHmacId(cleanDoc);
      const atlasPersonId = `atlas_arg_per_${docHmac.slice(0, 16)}`;
      const sourceHash    = computeSourceHash(numCorrelativo, cleanDoc, nombre);

      processedPeople.add(atlasPersonId);

      stageBuffer.push({
        source_id:              'IGJ_AUTORIDADES_GENERO_2026',
        source_person_id:       sourceHash,
        identifier_type:        'NATIONAL_IDENTITY_HMAC',
        identity_hmac:          docHmac,
        atlas_person_id:        atlasPersonId,
        display_name:           displayName,
        role:                   roleName,
        organization:           orgName,
        search_text_normalized: searchNorm
      });

      if (stageBuffer.length >= BLOCK_SIZE) {
        const buf = stageBuffer;
        stageBuffer = [];
        blockId++;
        await flushBlock(buf, blockId);
      }
    }
  }

  if (stageBuffer.length > 0) {
    blockId++;
    await flushBlock(stageBuffer, blockId);
  }
  if (pendingReconcile) {
    const finalRec = await pendingReconcile;
    if (finalRec?.data) {
      totalReconciled += finalRec.data.staged_total ?? 0;
    }
  }

  await searchWorker.stop();
  if (pubWorker) await pubWorker.stop();

  const totalElapsedSec = (performance.now() - startTime) / 1000;
  const throughput      = Number((processedPeople.size / totalElapsedSec).toFixed(1));
  const sStats          = searchWorker.stats();
  const avgStage        = stageDurations.length ? Number((stageDurations.reduce((a, b) => a + b, 0) / stageDurations.length).toFixed(1)) : 0;
  const avgRec          = reconcileDurations.length ? Number((reconcileDurations.reduce((a, b) => a + b, 0) / reconcileDurations.length).toFixed(1)) : 0;

  // Final Diagnostics
  let diag = null;
  try {
    const { data } = await supabase.rpc('debug_atlas_system_diagnostics');
    diag = data;
  } catch {}

  const { count: obPending } = await supabase.from('atlas_search_outbox').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');

  const result = {
    test: testName,
    drain_enabled: withDrain,
    duration_sec: Number(totalElapsedSec.toFixed(1)),
    unique_people: processedPeople.size,
    throughput_people_per_sec: throughput,
    blocks_processed: blockId,
    total_staged: totalStaged,
    total_reconciled: totalReconciled,
    avg_stage_ms: avgStage,
    avg_reconcile_ms: avgRec,
    stage_errors: stageErrors,
    reconcile_errors: reconcileErrors,
    search_p50_ms: sStats.p50,
    search_p95_ms: sStats.p95,
    search_p99_ms: sStats.p99,
    search_max_ms: sStats.max,
    search_timeouts: sStats.timeouts,
    outbox_pending: obPending || 0,
    active_queries: diag?.active_queries || []
  };

  console.log(`\n📊 RESULT FOR ${testName}:`);
  console.log(`   Unique People:    ${result.unique_people.toLocaleString()} in ${result.duration_sec}s`);
  console.log(`   Throughput:       ${result.throughput_people_per_sec.toLocaleString()} people/s`);
  console.log(`   Avg Timing:       Stage: ${avgStage}ms | Reconcile: ${avgRec}ms`);
  console.log(`   Search P99:       ${result.search_p99_ms}ms (Max: ${result.search_max_ms}ms, Timeouts: ${result.search_timeouts})`);
  console.log(`   Errors:           Stage=${stageErrors} | Rec=${reconcileErrors}`);
  console.log(`   Outbox Pending:   ${result.outbox_pending.toLocaleString()}`);
  console.log(SEP);

  return result;
}

// ── Main A/B Coordinator ────────────────────────────────────────────────────
async function main() {
  console.log(`\n${SEP}`);
  console.log(`🔬 ATLAS A/B ISOLATION BENCHMARK — OUTBOX PUBLISH PATH`);
  console.log(`   Evaluating contention between Canonical Ingestion and Outbox Publishing`);
  console.log(`${SEP}`);

  // 1. RUN TEST A (NO DRAIN)
  const resultA = await runSingleTest('TEST_A_NO_DRAIN', false);

  // Pause 10s to let PostgreSQL settle
  console.log('\n⏳ Settling PostgreSQL for 10 seconds before Test B...');
  await new Promise(r => setTimeout(r, 10000));

  // 2. RUN TEST B (WITH DRAIN)
  const resultB = await runSingleTest('TEST_B_WITH_DRAIN', true);

  const report = {
    test: 'ATLAS_AB_ISOLATION_BENCHMARK',
    timestamp: new Date().toISOString(),
    result_a_no_drain: resultA,
    result_b_with_drain: resultB,
    comparison: {
      speed_delta_percent: Number((((resultA.throughput_people_per_sec - resultB.throughput_people_per_sec) / resultA.throughput_people_per_sec) * 100).toFixed(1)),
      reconcile_ms_ratio: Number((resultB.avg_reconcile_ms / Math.max(1, resultA.avg_reconcile_ms)).toFixed(2)),
      bottleneck_certified: resultA.throughput_people_per_sec >= 1500 && resultB.throughput_people_per_sec < resultA.throughput_people_per_sec * 0.7
    }
  };

  const reportPath = path.resolve('reports/atlas/people/atlas_ab_isolation_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n${SEP}`);
  console.log(`🏁 A/B ISOLATION COMPARISON SUMMARY:`);
  console.log(`   TEST A (No Drain):   ${resultA.throughput_people_per_sec.toLocaleString()} people/s | Reconcile: ${resultA.avg_reconcile_ms}ms | Search P99: ${resultA.search_p99_ms}ms | Errors: ${resultA.reconcile_errors}`);
  console.log(`   TEST B (With Drain): ${resultB.throughput_people_per_sec.toLocaleString()} people/s | Reconcile: ${resultB.avg_reconcile_ms}ms | Search P99: ${resultB.search_p99_ms}ms | Errors: ${resultB.reconcile_errors}`);
  console.log(`   Speed Delta:         -${report.comparison.speed_delta_percent}% with Outbox Drain`);
  console.log(`   Reconcile Inflation: ${report.comparison.reconcile_ms_ratio}x slower`);
  console.log(`   Bottleneck Certified:${report.comparison.bottleneck_certified ? ' YES (Outbox Drain Contention)' : ' NO'}`);
  console.log(`   Report Saved:        ${reportPath}`);
  console.log(`${SEP}`);
}

main().catch(err => {
  console.error('Fatal error in A/B test:', err);
  process.exit(1);
});
