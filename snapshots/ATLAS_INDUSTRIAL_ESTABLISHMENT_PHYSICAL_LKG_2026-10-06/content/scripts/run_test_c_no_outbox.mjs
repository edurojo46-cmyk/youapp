/**
 * scripts/run_test_c_no_outbox.mjs
 * 
 * DIAGNOSTIC TEST C: Reconcile Against Existing SSOT WITHOUT Outbox Insert
 * 
 * Strict Invariants:
 * 1. Executes against existing records in atlas_person_identity_map.
 * 2. HARD STOP if inserted_new > 0 in ANY block.
 * 3. Concurrent Search V2 probes active during entire 75s.
 * 4. Measures pure Reconcile + Search throughput and latency.
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
const REPORT_PATH  = path.resolve('reports/atlas/people/atlas_test_c_diagnostic_report.json');
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

// ── Clean Buffers Helper ────────────────────────────────────────────────────
async function cleanDatabase() {
  await supabase.from('benchmark_people_staging_0').delete().neq('source_id', '__impossible__');
  await supabase.from('benchmark_people_staging_1').delete().neq('source_id', '__impossible__');
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'clean_0', p_block_id: 0 });
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'clean_1', p_block_id: 1 });
}

// ── Main Test C Runner ──────────────────────────────────────────────────────
async function main() {
  const RUN_ID = `test_c_${Date.now()}`;
  console.log(`\n${SEP}`);
  console.log(`🧪 TEST C: RECONCILE AGAINST EXISTING SSOT (ZERO OUTBOX INSERT)`);
  console.log(`   RUN_ID:      ${RUN_ID}`);
  console.log(`   Duration:    ${DURATION_MS / 1000}s`);
  console.log(`   Block Size:  ${BLOCK_SIZE} rows/block`);
  console.log(`   Invariant:   HARD STOP if inserted_new > 0`);
  console.log(`${SEP}`);

  console.log('\n>>> Cleaning staging buffers...');
  await cleanDatabase();

  const searchWorker = makeSearchWorker();
  const startTime    = performance.now();

  const processedPeople = new Set();
  let totalStaged       = 0;
  let totalReconciled   = 0;
  let totalInsertedNew  = 0;
  let stageErrors       = 0;
  let reconcileErrors   = 0;
  let blockId           = 0;
  let stageBuffer       = [];
  let pendingReconcile  = null;
  let hardStopTriggered = false;

  const stageDurations     = [];
  const reconcileDurations = [];

  async function flushBlock(buffer, bId) {
    if (hardStopTriggered) return;

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

      if ((d.inserted_new ?? 0) > 0) {
        hardStopTriggered = true;
        console.error(`\n🚨 HARD STOP TRIGGERED: inserted_new = ${d.inserted_new} > 0 on block ${d.block_id}!`);
      }
    }

    if (hardStopTriggered) return stageResult;

    const t0Rec = performance.now();
    pendingReconcile = supabase.rpc('atlas_reconcile_and_commit_staging_no_outbox_test', {
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

  while ((performance.now() - startTime) < DURATION_MS && !hardStopTriggered) {
    const igjRl = readline.createInterface({
      input: fs.createReadStream(SOURCE_PATH, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    for await (const line of igjRl) {
      if ((performance.now() - startTime) >= DURATION_MS || hardStopTriggered) break;

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

  if (stageBuffer.length > 0 && !hardStopTriggered) {
    blockId++;
    await flushBlock(stageBuffer, blockId);
  }
  if (pendingReconcile && !hardStopTriggered) {
    const finalRec = await pendingReconcile;
    if (finalRec?.data) {
      totalReconciled  += finalRec.data.staged_total ?? 0;
      totalInsertedNew += finalRec.data.inserted_new ?? 0;
    }
  }

  await searchWorker.stop();

  const totalElapsedSec = (performance.now() - startTime) / 1000;
  const throughput      = Number((processedPeople.size / totalElapsedSec).toFixed(1));
  const sStats          = searchWorker.stats();
  const avgStage        = stageDurations.length ? Number((stageDurations.reduce((a, b) => a + b, 0) / stageDurations.length).toFixed(1)) : 0;
  const avgRec          = reconcileDurations.length ? Number((reconcileDurations.reduce((a, b) => a + b, 0) / reconcileDurations.length).toFixed(1)) : 0;

  let diag = null;
  try {
    const { data } = await supabase.rpc('debug_atlas_system_diagnostics');
    diag = data;
  } catch {}

  const activeQueries = diag?.active_queries || [];
  const waitEvent = activeQueries.length > 0 ? `${activeQueries[0].wait_event_type}:${activeQueries[0].wait_event}` : 'none';

  const report = {
    test: 'ATLAS_TEST_C_DIAGNOSTIC',
    run_id: RUN_ID,
    timestamp: new Date().toISOString(),
    duration_seconds: Number(totalElapsedSec.toFixed(1)),
    block_size: BLOCK_SIZE,
    unique_people_processed: processedPeople.size,
    throughput_people_per_second: throughput,
    blocks_processed: blockId,
    total_staged: totalStaged,
    total_reconciled: totalReconciled,
    inserted_new: totalInsertedNew,
    hard_stop_triggered: hardStopTriggered,
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
  console.log(`🏁 TEST C RESULTS SUMMARY:`);
  console.log(`   Unique People:       ${report.unique_people_processed.toLocaleString()} in ${report.duration_seconds}s`);
  console.log(`   Throughput:          ${report.throughput_people_per_second.toLocaleString()} people/s`);
  console.log(`   Avg Timing/Block:    Stage: ${avgStage}ms | Reconcile: ${avgRec}ms`);
  console.log(`   Search P99:          ${sStats.p99}ms (Max: ${sStats.max}ms, Timeouts: ${sStats.timeouts})`);
  console.log(`   Pipeline Errors:     Stage=${stageErrors} | Rec=${reconcileErrors}`);
  console.log(`   Inserted New:        ${totalInsertedNew} (Required: 0) → ${totalInsertedNew === 0 ? '✅ 0 NEW' : '❌ UNEXPECTED INSERTS'}`);
  console.log(`   Wait Event:          ${waitEvent}`);
  console.log(`   Report Saved:        ${REPORT_PATH}`);
  console.log(SEP);
}

main().catch(err => {
  console.error('Fatal error in Test C:', err);
  process.exit(1);
});
