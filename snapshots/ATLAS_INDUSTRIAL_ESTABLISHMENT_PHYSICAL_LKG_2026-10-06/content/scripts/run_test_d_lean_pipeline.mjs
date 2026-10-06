/**
 * scripts/run_test_d_lean_pipeline.mjs
 * 
 * TEST D: HYPERTHROUGHPUT V3 LEAN PIPELINE BENCHMARK (75s)
 * 
 * Evaluates the full production pipeline with:
 * - Lean Minimal Outbox (atlas_reconcile_and_commit_staging_v3)
 * - Zero unnecessary outbox re-publication on existing identities
 * - Controlled Publisher background drain
 * - Concurrent Search V2 probes with strict SLA monitoring
 * 
 * Target:
 * - Throughput >= 1300 unique people/s
 * - Search P99 < 1000 ms
 * - Search Timeouts = 0
 * - Pipeline Errors = 0
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

const DURATION_MS  = 75 * 1000; // 75 seconds
const BLOCK_SIZE   = 5000;
const SOURCE_PATH  = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const REPORT_PATH  = path.resolve('reports/atlas/people/atlas_test_d_lean_report.json');
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

// ── Search Probe Worker ───────────────────────────────────────────────────────
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

// ── Publisher Worker ──────────────────────────────────────────────────────────
function makePublisherWorker() {
  let active = true;
  let published = 0;
  let drains = 0;

  async function run() {
    while (active) {
      try {
        const { data, error } = await supabase.rpc('atlas_drain_search_outbox_controlled_v2', {
          p_batch_size: 250
        });
        if (!error && data?.published_rows > 0) {
          published += data.published_rows;
          drains++;
        }
      } catch {}
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  const promise = run();
  return {
    stop: () => { active = false; return promise; },
    stats: () => ({ published, drains })
  };
}

// ── Clean Buffers ───────────────────────────────────────────────────────────
async function cleanDatabase() {
  await supabase.from('benchmark_people_staging_0').delete().neq('source_id', '__impossible__');
  await supabase.from('benchmark_people_staging_1').delete().neq('source_id', '__impossible__');
  await supabase.rpc('atlas_reconcile_and_commit_staging_v3', { p_run_id: 'clean_0', p_block_id: 0 });
  await supabase.rpc('atlas_reconcile_and_commit_staging_v3', { p_run_id: 'clean_1', p_block_id: 1 });
}

// ── Main Test D Runner ──────────────────────────────────────────────────────
async function main() {
  const RUN_ID = `test_d_${Date.now()}`;
  console.log(`\n${SEP}`);
  console.log(`🧪 TEST D: HYPERTHROUGHPUT V3 LEAN PIPELINE BENCHMARK`);
  console.log(`   RUN_ID:      ${RUN_ID}`);
  console.log(`   Duration:    ${DURATION_MS / 1000}s`);
  console.log(`   Block Size:  ${BLOCK_SIZE} rows/block`);
  console.log(`   Outbox:      Minimal Lean + Zero Duplicate Events`);
  console.log(`   Publisher:   Controlled (batch 250 / 5s)`);
  console.log(`${SEP}`);

  console.log('\n>>> Freezing baseline & cleaning staging buffers...');
  await cleanDatabase();

  const { count: obStart } = await supabase.from('atlas_search_outbox').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');

  const searchWorker = makeSearchWorker();
  const pubWorker    = makePublisherWorker();
  const startTime    = performance.now();

  const processedPeople = new Set();
  let totalStaged       = 0;
  let totalReconciled   = 0;
  let totalInsertedNew  = 0;
  let totalOutboxGen    = 0;
  let stageErrors       = 0;
  let reconcileErrors   = 0;
  let blockId           = 0;
  let stageBuffer       = [];
  let pendingReconcile  = null;

  const stageDurations     = [];
  const reconcileDurations = [];

  async function flushBlock(buffer, bId) {
    const dedup = new Map();
    for (const item of buffer) dedup.set(`${item.source_id}:${item.source_person_id}`, item);
    const cleanBlock = Array.from(dedup.values());

    const t0Stage = performance.now();
    const stagePromise = supabase.rpc('atlas_stage_people_bulk_v2', {
      p_run_id: RUN_ID,
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
      const d = reconcileResult.data;
      totalReconciled  += d.staged_total ?? 0;
      totalInsertedNew += d.inserted_new ?? 0;
      totalOutboxGen   += d.outbox_delta_produced ?? 0;
    }

    const t0Rec = performance.now();
    pendingReconcile = supabase.rpc('atlas_reconcile_and_commit_staging_v3', {
      p_run_id: RUN_ID,
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
      totalReconciled  += finalRec.data.staged_total ?? 0;
      totalInsertedNew += finalRec.data.inserted_new ?? 0;
      totalOutboxGen   += finalRec.data.outbox_delta_produced ?? 0;
    }
  }

  await searchWorker.stop();
  await pubWorker.stop();

  const totalElapsedSec = (performance.now() - startTime) / 1000;
  const throughput      = Number((processedPeople.size / totalElapsedSec).toFixed(1));
  const sStats          = searchWorker.stats();
  const pubStats        = pubWorker.stats();
  const avgStage        = stageDurations.length ? Number((stageDurations.reduce((a, b) => a + b, 0) / stageDurations.length).toFixed(1)) : 0;
  const avgRec          = reconcileDurations.length ? Number((reconcileDurations.reduce((a, b) => a + b, 0) / reconcileDurations.length).toFixed(1)) : 0;

  const { count: obEnd } = await supabase.from('atlas_search_outbox').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');

  let diag = null;
  try {
    const { data } = await supabase.rpc('debug_atlas_system_diagnostics');
    diag = data;
  } catch {}

  const activeQueries = diag?.active_queries || [];
  const waitEvent = activeQueries.length > 0 ? `${activeQueries[0].wait_event_type}:${activeQueries[0].wait_event}` : 'none';

  const isThroughputPass = throughput >= 1300;
  const isSearchP99Pass  = sStats.p99 < 1000;
  const isTimeoutsPass   = sStats.timeouts === 0;
  const isErrorsPass     = stageErrors === 0 && reconcileErrors === 0;

  const testStatus = (isThroughputPass && isSearchP99Pass && isTimeoutsPass && isErrorsPass) ? 'PASS' : 'FAIL';

  const report = {
    test: 'ATLAS_TEST_D_LEAN_PIPELINE',
    run_id: RUN_ID,
    status: testStatus,
    timestamp: new Date().toISOString(),
    duration_seconds: Number(totalElapsedSec.toFixed(1)),
    block_size: BLOCK_SIZE,
    unique_people_processed: processedPeople.size,
    throughput_people_per_second: throughput,
    rows_per_second: Number((totalReconciled / totalElapsedSec).toFixed(1)),
    blocks_processed: blockId,
    total_staged: totalStaged,
    total_reconciled: totalReconciled,
    inserted_new_identities: totalInsertedNew,
    outbox_events_produced: totalOutboxGen,
    outbox_events_drained: pubStats.published,
    outbox_pending_start: obStart || 0,
    outbox_pending_end: obEnd || 0,
    avg_stage_ms: avgStage,
    avg_reconcile_ms: avgRec,
    stage_errors: stageErrors,
    reconcile_errors: reconcileErrors,
    search_metrics: {
      probes: sStats.probes,
      p50_ms: sStats.p50,
      p95_ms: sStats.p95,
      p99_ms: sStats.p99,
      max_ms: sStats.max,
      timeouts: sStats.timeouts
    },
    wait_event: waitEvent,
    active_queries: activeQueries
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n${SEP}`);
  console.log(`🏁 TEST D RESULTS: ${testStatus === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Duration:            ${report.duration_seconds}s (${report.blocks_processed} blocks)`);
  console.log(`   Unique People:       ${report.unique_people_processed.toLocaleString()}`);
  console.log(`   Throughput:          ${report.throughput_people_per_second.toLocaleString()} people/s [Required: >=1,300] → ${isThroughputPass ? 'PASS' : 'FAIL'}`);
  console.log(`   Avg Timing/Block:    Stage: ${avgStage}ms | Reconcile: ${avgRec}ms`);
  console.log(`   Search P99:          ${sStats.p99}ms [< 1,000ms] → ${isSearchP99Pass ? 'PASS' : 'FAIL'}`);
  console.log(`   Search Timeouts:     ${sStats.timeouts} [= 0] → ${isTimeoutsPass ? 'PASS' : 'FAIL'}`);
  console.log(`   Pipeline Errors:     Stage=${stageErrors} | Rec=${reconcileErrors} [= 0] → ${isErrorsPass ? 'PASS' : 'FAIL'}`);
  console.log(`   Outbox Delta:        Produced=${totalOutboxGen} | Drained=${pubStats.published} | Net Pending Delta=${(obEnd || 0) - (obStart || 0)}`);
  console.log(`   Postgres Wait Event: ${waitEvent}`);
  console.log(`   Report Saved:        ${REPORT_PATH}`);
  console.log(SEP);
}

main().catch(err => {
  console.error('Fatal error in Test D:', err);
  process.exit(1);
});
