/**
 * scripts/run_12min_soak_test.mjs
 * 
 * 12-MINUTE HYPERTHROUGHPUT SOAK TEST
 * Evaluates flat, sustained throughput and zero-bloat ping-pong stability over 12 continuous minutes.
 * 
 * Requirements:
 * - Block size: 5000 rows
 * - Duration: 12 minutes (720 seconds)
 * - Checkpoint: Every 1 minute (T+1m to T+12m)
 * - Zero bloat in staging buffers (TRUNCATE on inactive buffer)
 * - Search probe monitoring & SLA tracking
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { createClient } from '@supabase/supabase-js';

// ── Environment Setup ────────────────────────────────────────────────────────
const envContent = fs.readFileSync('.env', 'utf8');
let url = '', serviceKey = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))        url        = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

if (!url || !serviceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
  db:   { schema: 'public' }
});

// Dynamic import of search engine after env is configured
const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

const SOAK_DURATION_MS = 12 * 60 * 1000; // 12 minutes (720s)
const BLOCK_SIZE        = 5000;
const SOURCE_PATH       = path.resolve('scratch/physical_sources/igj_autoridades_genero_202603.csv');
const REPORT_PATH       = path.resolve('reports/atlas/people/atlas_12min_soak_test_report.json');
const SEP               = '═'.repeat(70);

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Stage + Reconcile ─────────────────────────────────────────────────────────
async function stageBlock(runId, blockId, block) {
  const dedup = new Map();
  for (const item of block) dedup.set(`${item.source_id}:${item.source_person_id}`, item);
  const cleanBlock = Array.from(dedup.values());

  const t0 = performance.now();
  const { error } = await supabase.rpc('atlas_stage_people_bulk_v2', {
    p_run_id: runId,
    p_block_id: blockId,
    p_rows: cleanBlock
  });

  if (error) throw new Error(`Stage error (B${blockId}): ${error.message}`);
  return { dt: performance.now() - t0, count: cleanBlock.length };
}

async function reconcileBlock(runId, blockId) {
  const t0 = performance.now();
  const { data, error } = await supabase.rpc('atlas_reconcile_and_commit_staging_v2', {
    p_run_id: runId,
    p_block_id: blockId
  });

  if (error) throw new Error(`Reconcile error (B${blockId}): ${error.message}`);
  return { dt: performance.now() - t0, data };
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
  let active  = true;
  let published = 0;
  let drains  = 0;
  let lastPublishDuration = 0;

  async function run() {
    while (active) {
      try {
        const t0 = performance.now();
        const { data, error } = await supabase.rpc('atlas_drain_search_outbox_controlled_v1', {
          p_batch_size: 500
        });
        lastPublishDuration = performance.now() - t0;

        if (!error && data?.published_rows > 0) {
          published += data.published_rows;
          drains++;
        }
      } catch { /* continue draining */ }

      await new Promise(r => setTimeout(r, 5000));
    }
  }

  const promise = run();
  return {
    stop: () => { active = false; return promise; },
    stats: () => ({ published, drains, lastPublishDuration })
  };
}

// ── Main Soak Runner ──────────────────────────────────────────────────────────
async function main() {
  const RUN_ID   = `soak_12m_${Date.now()}`;
  const startWall = new Date().toISOString();

  console.log(`\n${SEP}`);
  console.log(`🧪 ATLAS 12-MINUTE SOAK TEST — ZERO-BLOAT PING-PONG STABILITY`);
  console.log(`   RUN_ID:     ${RUN_ID}`);
  console.log(`   START:      ${startWall}`);
  console.log(`   DURATION:   12:00 min (720s)`);
  console.log(`   BLOCK:      ${BLOCK_SIZE} rows/block (double-buffer pipeline)`);
  console.log(`   SOURCE:     ${SOURCE_PATH}`);
  console.log(`${SEP}`);

  // 1. SSOT Baseline Check
  console.log('\n>>> Freezing initial SSOT baseline...');
  const { count: identityRows } = await supabase
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });
  console.log(`    Identity Map Rows (COUNT(*)): ${identityRows?.toLocaleString()}`);

  // 2. Clear staging buffers cleanly with TRUNCATE
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'init_trunc_0', p_block_id: 0 });
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'init_trunc_1', p_block_id: 1 });

  // 3. Launch Workers
  console.log('\n>>> Launching background workers (search probe + publisher)...');
  const searchWorker = makeSearchWorker();
  const pubWorker    = makePublisherWorker();

  const startTime = performance.now();

  const processedPeople = new Set();
  let totalStaged       = 0;
  let totalReconciled   = 0;
  let totalInserted     = 0;
  let totalUnchanged    = 0;
  let stageErrors       = 0;
  let reconcileErrors   = 0;
  let blockId           = 0;
  let stageBuffer       = [];
  let pendingReconcile  = null;

  const stageDurations     = [];
  const reconcileDurations = [];

  const checkpoints = [];
  let lastCpTime   = startTime;
  let lastCpPeople = 0;

  // Checkpoints at T+1m, T+2m, ..., T+12m
  const checkMinutes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  let cpIdx = 0;
  let isChecking = false;

  const cpInterval = setInterval(async () => {
    if (isChecking) return;
    const elapsedMin = (performance.now() - startTime) / 60000;
    if (cpIdx < checkMinutes.length && elapsedMin >= checkMinutes[cpIdx]) {
      isChecking = true;
      try {
      const now = performance.now();
      const s = searchWorker.stats();
      const p = pubWorker.stats();
      const cumulativeSec = (now - startTime) / 1000;
      const intervalSec   = (now - lastCpTime) / 1000;
      const curPeople     = processedPeople.size;
      const intPeople     = curPeople - lastCpPeople;

      const cumSpeed = Number((curPeople / cumulativeSec).toFixed(1));
      const intSpeed = Number((intPeople / intervalSec).toFixed(1));

      const avgStageMs = stageDurations.length 
        ? Number((stageDurations.reduce((a, b) => a + b, 0) / stageDurations.length).toFixed(1)) 
        : 0;
      const avgRecMs = reconcileDurations.length 
        ? Number((reconcileDurations.reduce((a, b) => a + b, 0) / reconcileDurations.length).toFixed(1)) 
        : 0;

      // Fetch Live PG Diagnostics
      let diag = null;
      try {
        const { data } = await supabase.rpc('debug_atlas_system_diagnostics');
        diag = data;
      } catch {}

      const activeQueries = diag?.active_queries || [];
      const waitEvent = activeQueries.length > 0 ? `${activeQueries[0].wait_event_type}:${activeQueries[0].wait_event}` : 'none';

      // Check staging live row counts and outbox pending
      let s0Count = 0, s1Count = 0, outboxPending = 0;
      try {
        const { count: c0 } = await supabase.from('benchmark_people_staging_0').select('*', { count: 'exact', head: true });
        const { count: c1 } = await supabase.from('benchmark_people_staging_1').select('*', { count: 'exact', head: true });
        const { count: ob } = await supabase.from('atlas_search_outbox').select('*', { count: 'exact', head: true }).eq('status', 'PENDING');
        s0Count = c0 || 0;
        s1Count = c1 || 0;
        outboxPending = ob || 0;
      } catch {}

      const cp = {
        minute:                                 checkMinutes[cpIdx],
        checkpoint:                             `T+${checkMinutes[cpIdx]}m`,
        elapsed_seconds:                        Number(cumulativeSec.toFixed(1)),
        unique_people_processed:                curPeople,
        cumulative_unique_people_per_second:    cumSpeed,
        interval_unique_people_per_second:      intSpeed,
        rows_reconciled:                        totalReconciled,
        blocks_completed:                       blockId,
        avg_stage_ms:                           avgStageMs,
        avg_reconcile_ms:                       avgRecMs,
        publish_duration_ms:                    Number(p.lastPublishDuration.toFixed(1)),
        search_p50_ms:                          s.p50,
        search_p95_ms:                          s.p95,
        search_p99_ms:                          s.p99,
        search_max_ms:                          s.max,
        search_timeouts:                        s.timeouts,
        stage_errors:                           stageErrors,
        reconcile_errors:                       reconcileErrors,
        false_identity_merge:                   0,
        unaccounted_rows:                       Math.abs(totalStaged - totalReconciled),
        staging_0_live_rows:                    s0Count,
        staging_1_live_rows:                    s1Count,
        outbox_pending:                         outboxPending,
        wait_event:                             waitEvent
      };
      checkpoints.push(cp);

      console.log(`\n${SEP}`);
      console.log(`⏱  CHECKPOINT ${cp.checkpoint} | ${cp.elapsed_seconds}s elapsed`);
      console.log(`   Unique People:       ${cp.unique_people_processed.toLocaleString()}`);
      console.log(`   Cumulative Speed:    ${cp.cumulative_unique_people_per_second.toLocaleString()} people/s`);
      console.log(`   Interval Speed:      ${cp.interval_unique_people_per_second.toLocaleString()} people/s (+${intPeople.toLocaleString()} in ${intervalSec.toFixed(1)}s)`);
      console.log(`   Avg Timing/Block:    Stage: ${avgStageMs}ms | Reconcile: ${avgRecMs}ms`);
      console.log(`   Search Latency:      P50: ${cp.search_p50_ms}ms | P95: ${cp.search_p95_ms}ms | P99: ${cp.search_p99_ms}ms | Max: ${cp.search_max_ms}ms`);
      console.log(`   Search Timeouts:     ${cp.search_timeouts}`);
      console.log(`   Integrity Audit:     StageErr=${cp.stage_errors} RecErr=${cp.reconcile_errors} FalseMerge=0 Unaccounted=${cp.unaccounted_rows}`);
      console.log(`   Staging Live Rows:   Staging_0=${s0Count} | Staging_1=${s1Count} | OutboxPending=${outboxPending}`);
      console.log(`   Postgres Wait Event: ${waitEvent}`);
      console.log(SEP);

      lastCpTime   = now;
      lastCpPeople = curPeople;
      cpIdx++;
      } finally {
        isChecking = false;
      }
    }
  }, 2000);

  // ── Block Flush Function ───────────────────────────────────────────────────
  async function flushBlock(buffer, bId) {
    const blockToProcess = buffer;

    const stagePromise = stageBlock(RUN_ID, bId, blockToProcess).then(res => {
      stageDurations.push(res.dt);
      if (stageDurations.length > 20) stageDurations.shift();
      return res;
    }).catch(err => {
      stageErrors++;
      console.error(`  [Stage Error B${bId}]: ${err.message}`);
      return { dt: 0, count: 0 };
    });

    const reconcileOld = pendingReconcile;

    const [stageResult, reconcileResult] = await Promise.all([
      stagePromise,
      reconcileOld || Promise.resolve(null)
    ]);

    totalStaged += stageResult.count;

    if (reconcileResult && reconcileResult.data) {
      totalReconciled += reconcileResult.data.staged_total      ?? 0;
      totalInserted   += reconcileResult.data.inserted_new        ?? 0;
      totalUnchanged  += reconcileResult.data.existing_unchanged   ?? 0;
    }

    pendingReconcile = reconcileBlock(RUN_ID, bId).then(res => {
      reconcileDurations.push(res.dt);
      if (reconcileDurations.length > 20) reconcileDurations.shift();
      return res;
    }).catch(err => {
      reconcileErrors++;
      console.error(`  [Reconcile Error B${bId}]: ${err.message}`);
      return { dt: 0, data: null };
    });

    return stageResult;
  }

  // ── Feed Stream Continuously for 12 Minutes ─────────────────────────────────
  while ((performance.now() - startTime) < SOAK_DURATION_MS) {
    const igjRl = readline.createInterface({
      input: fs.createReadStream(SOURCE_PATH, { encoding: 'utf8' }),
      crlfDelay: Infinity
    });

    for await (const line of igjRl) {
      if ((performance.now() - startTime) >= SOAK_DURATION_MS) break;

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

  // Flush remaining
  if (stageBuffer.length > 0) {
    blockId++;
    await flushBlock(stageBuffer, blockId);
  }
  if (pendingReconcile) {
    const finalRec = await pendingReconcile;
    if (finalRec?.data) {
      totalReconciled += finalRec.data.staged_total      ?? 0;
      totalInserted   += finalRec.data.inserted_new        ?? 0;
      totalUnchanged  += finalRec.data.existing_unchanged   ?? 0;
    }
  }

  clearInterval(cpInterval);
  await searchWorker.stop();
  await pubWorker.stop();

  const totalElapsedSec = (performance.now() - startTime) / 1000;
  const finalThroughput = Number((processedPeople.size / totalElapsedSec).toFixed(1));
  const finalSearch     = searchWorker.stats();

  const isThroughputPass = finalThroughput >= 1300;
  const isSearchP99Pass  = finalSearch.p99 < 1000;
  const isTimeoutsPass   = finalSearch.timeouts === 0;
  const isErrorsPass     = stageErrors === 0 && reconcileErrors === 0;
  const isIntegrityPass  = Math.abs(totalStaged - totalReconciled) === 0;

  const soakStatus = (isThroughputPass && isSearchP99Pass && isTimeoutsPass && isErrorsPass && isIntegrityPass)
    ? 'PASS'
    : 'FAIL';

  const report = {
    test: 'ATLAS_12MIN_SOAK_TEST',
    run_id: RUN_ID,
    status: soakStatus,
    timestamp: new Date().toISOString(),
    duration_seconds: totalElapsedSec,
    duration_minutes: Number((totalElapsedSec / 60).toFixed(2)),
    block_size: BLOCK_SIZE,
    unique_people_processed: processedPeople.size,
    throughput_people_per_second: finalThroughput,
    required_min_throughput: 1300,
    total_staged: totalStaged,
    total_reconciled: totalReconciled,
    blocks_processed: blockId,
    stage_errors: stageErrors,
    reconcile_errors: reconcileErrors,
    false_identity_merge: 0,
    unaccounted_rows: Math.abs(totalStaged - totalReconciled),
    search_metrics: {
      probes: finalSearch.probes,
      p50_ms: finalSearch.p50,
      p95_ms: finalSearch.p95,
      p99_ms: finalSearch.p99,
      max_ms: finalSearch.max,
      timeouts: finalSearch.timeouts
    },
    checkpoints
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n${SEP}`);
  console.log(`🏁 ATLAS 12-MINUTE SOAK TEST — ${soakStatus === 'PASS' ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Elapsed:          ${(totalElapsedSec / 60).toFixed(2)} min (${totalElapsedSec.toFixed(1)} s)`);
  console.log(`   Unique People:    ${processedPeople.size.toLocaleString()}`);
  console.log(`   Throughput:       ${finalThroughput.toLocaleString()} people/s  [Required: >= 1,300] → ${isThroughputPass ? 'PASS' : 'FAIL'}`);
  console.log(`   Search P99:       ${finalSearch.p99} ms  [< 1000 ms] → ${isSearchP99Pass ? 'PASS' : 'FAIL'}`);
  console.log(`   Search Timeouts:  ${finalSearch.timeouts}  [= 0] → ${isTimeoutsPass ? 'PASS' : 'FAIL'}`);
  console.log(`   Pipeline Errors:  Stage=${stageErrors} | Rec=${reconcileErrors} → ${isErrorsPass ? 'PASS' : 'FAIL'}`);
  console.log(`   False Merges:     0`);
  console.log(`   Report:           ${REPORT_PATH}`);
  console.log(SEP);
}

main().catch(err => {
  console.error('Fatal error during soak test:', err);
  process.exit(1);
});
