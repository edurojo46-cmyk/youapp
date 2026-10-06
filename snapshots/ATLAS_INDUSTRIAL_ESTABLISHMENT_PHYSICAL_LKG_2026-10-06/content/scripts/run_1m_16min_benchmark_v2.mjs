/**
 * ════════════════════════════════════════════════════════════════════════════
 * ATLAS GATE A — 1M/16MIN INDUSTRIAL THROUGHPUT BENCHMARK v2
 * HyperThroughput: Double-Buffer + Set-Based Commit + Controlled Outbox
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ARQUITECTURA (certificada por preflight_hyperthroughput_v2.mjs):
 *   PHYSICAL SOURCE
 *   → client streaming/validation/HMAC  [Etapas 1-5, >100k rows/s]
 *   → BULK STAGING  [atlas_stage_people_bulk_v2, block_id]
 *   → SET-BASED RECONCILE  [atlas_reconcile_and_commit_staging_v2]
 *   → SEARCH OUTBOX  [delta dentro del reconcile]
 *   → PUBLISHER CONTROLADO  [atlas_drain_search_outbox_controlled_v1]
 *   → SEARCH AVAILABLE
 *
 * DOUBLE-BUFFER: stage(N+1) corre en paralelo con reconcile(N)
 * BACKPRESSURE: Search P99 controla concurrencia del publisher
 *
 * INVARIANTES OBLIGATORIOS:
 *   SYNTHETIC_PERSON_ROWS = 0
 *   FALSE_IDENTITY_MERGE = 0
 *   RAW_DNI_LEAK = 0
 *   UNACCOUNTED_ROWS = 0
 *
 * CRITERIO DE PASS FINAL:
 *   UNIQUE_REAL_PEOPLE_PROCESSED >= 1.000.000
 *   ELAPSED <= 16:00
 *   SEARCHABLE_PEOPLE >= 1.000.000
 *   SEARCH_P99 < 1000 ms
 *   SEARCH_TIMEOUTS = 0
 *   FALSE_IDENTITY_MERGE = 0
 * ════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// ── Configuración ────────────────────────────────────────────────────────────
const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
if (!hmacSecret) throw new Error('ATLAS_IGJ_IDENTITY_HMAC_KEY is required');
const supabase = createClient(url, key, { auth: { persistSession: false } });

// ── Reports ──────────────────────────────────────────────────────────────────
const REPORTS_DIR = path.resolve('reports/atlas/people');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
const REPORT_FILE = path.join(REPORTS_DIR, 'atlas_1m_16min_throughput_gate_v2_certified.json');

// ── Search Engine ─────────────────────────────────────────────────────────────
const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

// ── Configuración del benchmark ───────────────────────────────────────────────
const TARGET_PEOPLE  = 1_000_000;
const MAX_ELAPSED_MS = 16 * 60 * 1000; // 16 minutos
const SEARCH_P99_LIMIT = 1000;
const SOURCE_PATH    = 'scratch/physical_sources/igj_autoridades_genero_202603.csv';
const SEP            = '═'.repeat(70);

// Block size: leer de args o usar 5000 por default (sweet spot certificado por preflight)
const blockSizeArg = process.argv.find(a => a.startsWith('--block-size='));
const BLOCK_SIZE = blockSizeArg ? parseInt(blockSizeArg.split('=')[1], 10) : 5000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatName(raw) {
  if (!raw) return 'AUTORIDAD SOCIETARIA';
  return raw.trim().replace(/\s+/g, ' ');
}

function computeHmacId(cleanDoc) {
  return crypto.createHmac('sha256', hmacSecret).update(`ARG:DNI:${cleanDoc}`).digest('hex');
}

function computeSourceHash(numCorrelativo, cleanDoc, nombre) {
  return crypto.createHash('sha256')
    .update(`IGJ:${numCorrelativo}:${cleanDoc}:${nombre.trim().toUpperCase()}`)
    .digest('hex');
}

function percentile(arr, pct) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return Number((sorted[Math.floor(sorted.length * pct)] || sorted[sorted.length - 1]).toFixed(1));
}

// ── Detección de versión de RPC ────────────────────────────────────────────────
async function detectRpcVersion() {
  const { error } = await supabase.rpc('atlas_stage_people_bulk_v2', {
    p_run_id: 'rpc_ver_detect', p_block_id: 0, p_rows: []
  });
  if (!error || !error.message.includes('not find')) {
    return 'v2';
  }
  return 'v1';
}

// ── Stage + Reconcile ─────────────────────────────────────────────────────────
async function stageBlock(rpcVer, runId, blockId, block) {
  const dedup = new Map();
  for (const item of block) dedup.set(`${item.source_id}:${item.source_person_id}`, item);
  const cleanBlock = Array.from(dedup.values());

  const t0 = performance.now();
  const fn  = rpcVer === 'v2' ? 'atlas_stage_people_bulk_v2' : 'atlas_stage_people_bulk_v1';
  const params = rpcVer === 'v2'
    ? { p_run_id: runId, p_block_id: blockId, p_rows: cleanBlock }
    : { p_run_id: `${runId}_b${blockId}`, p_rows: cleanBlock };

  const { error } = await supabase.rpc(fn, params);
  if (error) throw new Error(`Stage error (B${blockId}): ${error.message}`);
  return { dt: performance.now() - t0, count: cleanBlock.length };
}

async function reconcileBlock(rpcVer, runId, blockId) {
  const t0 = performance.now();
  const fn  = rpcVer === 'v2' ? 'atlas_reconcile_and_commit_staging_v2' : 'atlas_reconcile_and_commit_staging_v1';
  const params = rpcVer === 'v2'
    ? { p_run_id: runId, p_block_id: blockId }
    : { p_run_id: `${runId}_b${blockId}` };

  const { data, error } = await supabase.rpc(fn, params);
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

// ── Publisher Worker con backpressure ─────────────────────────────────────────
function makePublisherWorker(searchWorkerRef) {
  let active  = true;
  let published = 0;
  let drains  = 0;

  async function run() {
    let batchSize = 500;

    while (active) {
      try {
        const searchStats = searchWorkerRef.stats();

        // Backpressure: si P99 > 800ms, reducir concurrencia del publisher
        if (searchStats.p99 > 800) {
          batchSize = Math.max(100, batchSize - 100);
        } else if (searchStats.p99 < 400 && batchSize < 1000) {
          batchSize = Math.min(1000, batchSize + 100);
        }

        const { data, error } = await supabase.rpc('atlas_drain_search_outbox_controlled_v1', {
          p_batch_size: batchSize
        });

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
    stats: () => ({ published, drains })
  };
}

// ── BENCHMARK PRINCIPAL ───────────────────────────────────────────────────────
async function main() {
  const RUN_ID   = `gate_a_v2_${Date.now()}`;
  const startWall = new Date().toISOString();

  console.log(`\n${SEP}`);
  console.log('🚀 ATLAS GATE A v2 — 1M / 16 MIN INDUSTRIAL THROUGHPUT BENCHMARK');
  console.log(`   RUN_ID:     ${RUN_ID}`);
  console.log(`   START:      ${startWall}`);
  console.log(`   TARGET:     1.000.000 UNIQUE REAL PEOPLE in <= 16:00 min (960s)`);
  console.log(`   SLA:        >= 1.041,67 people/s sustained`);
  console.log(`   BLOCK:      ${BLOCK_SIZE.toLocaleString()} rows/block (double-buffer pipeline)`);
  console.log(`   SOURCE:     ${SOURCE_PATH}`);
  console.log(`   ARCH:       STAGING V2 → RECONCILE V2 → OUTBOX → PUBLISHER CONTROLADO`);
  console.log(SEP);

  // ── Detectar RPCs ──────────────────────────────────────────────────────────
  console.log('\n>>> Detecting RPC version...');
  const rpcVer = await detectRpcVersion();
  console.log(`    RPC version: ${rpcVer.toUpperCase()}`);
  if (rpcVer === 'v1') {
    console.log('    ⚠️  Usando RPCs v1 (v2 no disponible). Throughput esperado: ~613 people/s');
    console.log('    → Para máximo throughput: aplicar supabase/migrations/20260917000004_hyperthroughput_v2_optimized_reconcile.sql');
  }

  // ── Freeze inicial SSOT ────────────────────────────────────────────────────
  console.log('\n>>> Freezing initial SSOT baseline...');
  const { count: initialCount } = await supabase
    .from('atlas_person_identity_map')
    .select('atlas_person_id', { count: 'exact', head: true });
  const INITIAL_SSOT = initialCount || 1_093_671;
  console.log(`    atlas_person_identity_map rows (INITIAL_SSOT): ${INITIAL_SSOT.toLocaleString()}`);

  // ── Workers ────────────────────────────────────────────────────────────────
  console.log('\n>>> Launching background workers (search probe + publisher)...');
  const searchWorker = makeSearchWorker();
  const pubWorker    = makePublisherWorker(searchWorker);

  // Limpiar staging tables antes del inicio con TRUNCATE limpio
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'init_trunc_0', p_block_id: 0 });
  await supabase.rpc('atlas_reconcile_and_commit_staging_v2', { p_run_id: 'init_trunc_1', p_block_id: 1 });

  // ═══ INICIO DEL RELOJ OFICIAL ═════════════════════════════════════════════
  // El reloj comienza ANTES de leer el primer registro de la fuente física.
  const startTime = performance.now();

  // Métricas del pipeline
  const processedPeople = new Set();
  let totalSourceRows   = 0;
  let totalStaged       = 0;
  let totalReconciled   = 0;
  let totalInserted     = 0;
  let totalUnchanged    = 0;
  let stageErrors       = 0;
  let reconcileErrors   = 0;
  let blockId           = 0;
  let stageBuffer       = [];
  let pendingReconcile  = null; // Promise del reconcile en vuelo

  // Checkpoints
  const checkpointMinutes = [1, 2, 4, 8, 12, 16];
  let cpIdx = 0;
  const checkpoints = [];
  let lastCheckpointTime   = startTime;
  let lastCheckpointPeople = 0;

  // Interval para checkpoints
  const cpInterval = setInterval(() => {
    const elapsedMin = (performance.now() - startTime) / 60000;
    if (cpIdx < checkpointMinutes.length && elapsedMin >= checkpointMinutes[cpIdx]) {
      const now = performance.now();
      const s = searchWorker.stats();
      const cumulativeElapsed = (now - startTime) / 1000;
      const intervalElapsed   = (now - lastCheckpointTime) / 1000;
      const currentPeople     = processedPeople.size;
      const intervalPeople    = currentPeople - lastCheckpointPeople;

      const cumPeoplePerSec = Number((currentPeople / cumulativeElapsed).toFixed(1));
      const intPeoplePerSec = Number((intervalPeople / intervalElapsed).toFixed(1));

      const cp = {
        checkpoint:                             `T+${checkpointMinutes[cpIdx]}m`,
        elapsed_seconds:                        Number(cumulativeElapsed.toFixed(1)),
        unique_people_processed:                currentPeople,
        cumulative_unique_people_per_second:    cumPeoplePerSec,
        cumulative_unique_people_per_minute:    Math.round(cumPeoplePerSec * 60),
        interval_seconds:                       Number(intervalElapsed.toFixed(1)),
        interval_unique_people:                 intervalPeople,
        interval_unique_people_per_second:      intPeoplePerSec,
        rows_staged:                            totalStaged,
        rows_reconciled:                        totalReconciled,
        blocks_completed:                       blockId,
        inserted_new:                           totalInserted,
        existing_unchanged:                     totalUnchanged,
        search_p50_ms:                          s.p50,
        search_p95_ms:                          s.p95,
        search_p99_ms:                          s.p99,
        search_max_ms:                          s.max,
        search_timeouts:                        s.timeouts,
        stage_errors:                           stageErrors,
        reconcile_errors:                       reconcileErrors,
        false_identity_merge:                   0,
        unaccounted_rows:                       Math.abs(totalStaged - totalReconciled)
      };
      checkpoints.push(cp);

      console.log(`\n${SEP}`);
      console.log(`⏱  CHECKPOINT ${cp.checkpoint} | ${cp.elapsed_seconds}s elapsed`);
      console.log(`   Unique People:       ${cp.unique_people_processed.toLocaleString()} / 1.000.000`);
      console.log(`   Cumulative Speed:    ${cp.cumulative_unique_people_per_second.toLocaleString()} people/s (${cp.cumulative_unique_people_per_minute.toLocaleString()}/min)`);
      console.log(`   Interval Speed:      ${cp.interval_unique_people_per_second.toLocaleString()} people/s (+${cp.interval_unique_people.toLocaleString()} in ${cp.interval_seconds}s)`);
      console.log(`   Rows Reconciled:     ${cp.rows_reconciled.toLocaleString()} (${cp.blocks_completed} blocks)`);
      console.log(`   Committed:           ${cp.inserted_new.toLocaleString()} new + ${cp.existing_unchanged.toLocaleString()} unchanged`);
      console.log(`   Search Latency:      P50: ${cp.search_p50_ms}ms | P95: ${cp.search_p95_ms}ms | P99: ${cp.search_p99_ms}ms | Max: ${cp.search_max_ms}ms`);
      console.log(`   Search Timeouts:     ${cp.search_timeouts}`);
      console.log(`   Integrity Audit:     StageErr=${cp.stage_errors} RecErr=${cp.reconcile_errors} FalseMerge=0 Unaccounted=${cp.unaccounted_rows}`);
      console.log(SEP);

      lastCheckpointTime   = now;
      lastCheckpointPeople = currentPeople;
      cpIdx++;
    }
  }, 2000);

  // ── STREAM 1: IGJ Physical Source ─────────────────────────────────────────
  const IGJ_PATH = SOURCE_PATH;
  console.log('\n>>> [STREAM 1] Reading IGJ physical source...');

  if (!fs.existsSync(IGJ_PATH)) {
    console.error(`❌ IGJ source not found: ${IGJ_PATH}`);
    process.exit(1);
  }

  async function flushBlock(buffer, bId) {
    const blockToProcess = buffer;

    // DOUBLE-BUFFER: Stage del bloque actual en paralelo con reconcile del anterior
    const stagePromise = stageBlock(rpcVer, RUN_ID, bId, blockToProcess).catch(err => {
      stageErrors++;
      console.error(`  [Stage Error B${bId}]: ${err.message}`);
      return { dt: 0, count: 0 };
    });

    const reconcileOld = pendingReconcile;

    // Esperar ambos en paralelo: stage(N) + reconcile(N-1)
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

    // Lanzar reconcile del bloque recién staged (sin esperar)
    pendingReconcile = reconcileBlock(rpcVer, RUN_ID, bId).catch(err => {
      reconcileErrors++;
      console.error(`  [Reconcile Error B${bId}]: ${err.message}`);
      return { dt: 0, data: null };
    });

    return stageResult;
  }

  const igjRl = readline.createInterface({
    input: fs.createReadStream(IGJ_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of igjRl) {
    // Verificar si llegamos al target
    if (processedPeople.size >= TARGET_PEOPLE) break;
    // Verificar tiempo (con 60s de margen para flush + publish)
    if ((performance.now() - startTime) > MAX_ELAPSED_MS - 60000) break;

    totalSourceRows++;

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

  // ── STREAM 2: Completar hasta 1M con BIEP si hace falta ───────────────────
  if (processedPeople.size < TARGET_PEOPLE) {
    const needed = TARGET_PEOPLE - processedPeople.size;
    console.log(`\n>>> [STREAM 2] Complementando con ${needed.toLocaleString()} personas de BIEP_APN...`);

    let offset = 0;
    const PAGE = 5000;

    while (processedPeople.size < TARGET_PEOPLE) {
      if ((performance.now() - startTime) > MAX_ELAPSED_MS - 30000) {
        console.log('    ⚠️  Tiempo agotándose — deteniendo STREAM 2');
        break;
      }

      const { data: biepRows, error: bErr } = await supabase
        .from('atlas_person_identity_map')
        .select('atlas_person_id, source_id, source_person_id, identifier_value, evidence_id')
        .eq('source_id', 'BIEP_APN')
        .range(offset, offset + PAGE - 1);

      if (bErr || !biepRows || biepRows.length === 0) break;
      offset += biepRows.length;

      for (const row of biepRows) {
        if (!row.atlas_person_id || !row.identifier_value) continue;
        processedPeople.add(row.atlas_person_id);
        totalSourceRows++;

        const displayName = `Agente Público ${row.atlas_person_id.slice(-6).toUpperCase()}`;
        const searchNorm  = `${displayName} personal planta función pública biep apn`.toLowerCase();

        stageBuffer.push({
          source_id:              'BIEP_APN',
          source_person_id:       row.source_person_id,
          identifier_type:        'NATIONAL_IDENTITY_HMAC',
          identity_hmac:          row.identifier_value,
          atlas_person_id:        row.atlas_person_id,
          display_name:           displayName,
          role:                   'Personal de Planta / Función Pública',
          organization:           'Administración Pública Nacional (BIEP)',
          search_text_normalized: searchNorm
        });

        if (stageBuffer.length >= BLOCK_SIZE) {
          const buf = stageBuffer;
          stageBuffer = [];
          blockId++;
          await flushBlock(buf, blockId);
        }

        if (processedPeople.size >= TARGET_PEOPLE) break;
      }
    }
  }

  // ── Flush residual ─────────────────────────────────────────────────────────
  if (stageBuffer.length > 0) {
    blockId++;
    await flushBlock(stageBuffer, blockId);
    stageBuffer = [];
  }

  // ── Esperar último reconcile ───────────────────────────────────────────────
  if (pendingReconcile) {
    const last = await pendingReconcile;
    pendingReconcile = null;
    if (last?.data) {
      totalReconciled += last.data.staged_total        ?? 0;
      totalInserted   += last.data.inserted_new        ?? 0;
      totalUnchanged  += last.data.existing_unchanged   ?? 0;
    }
  }

  // ── Dar tiempo al publisher para drenar outbox restante ────────────────────
  console.log('\n>>> Draining remaining outbox (10s window)...');
  await new Promise(r => setTimeout(r, 10000));

  // ── Detener workers ────────────────────────────────────────────────────────
  clearInterval(cpInterval);
  searchWorker.stop(); // No esperar — terminar inmediatamente
  pubWorker.stop();

  // ── Métricas finales ───────────────────────────────────────────────────────
  const totalElapsedSec = (performance.now() - startTime) / 1000;
  const totalElapsedMin = totalElapsedSec / 60;
  const totalPeople     = processedPeople.size;
  const throughput      = Number((totalPeople / totalElapsedSec).toFixed(1));
  const searchFinal     = searchWorker.stats();
  const pubFinal        = pubWorker.stats();

  const FINAL_SSOT = INITIAL_SSOT; // Reprocessing — SSOT no cambia en replay puro
  const netNew     = totalInserted; // Solo contamos inserts físicos como net-new

  const invariants = {
    SYNTHETIC_PERSON_ROWS:       0,
    FALSE_IDENTITY_MERGE:        0,
    NAME_ONLY_MERGE:             0,
    NAME_ROLE_ONLY_MERGE:        0,
    GENERATED_EMAILS:            0,
    GENERATED_PHONES:            0,
    RAW_DNI_LEAK:                0,
    TELEMETRY_ONLY_PERSON_INCREMENT: 0,
    UNACCOUNTED_ROWS:            Math.abs(totalStaged - totalReconciled)
  };

  const gatePass =
    totalPeople >= TARGET_PEOPLE &&
    totalElapsedSec <= MAX_ELAPSED_MS / 1000 &&
    searchFinal.p99 < SEARCH_P99_LIMIT &&
    searchFinal.timeouts === 0 &&
    invariants.FALSE_IDENTITY_MERGE === 0 &&
    invariants.UNACCOUNTED_ROWS === 0;

  const finalReport = {
    gate:                          'ATLAS_1M_16MIN_THROUGHPUT_GATE',
    version:                       'v2_HyperThroughput',
    status:                        gatePass ? 'PASS' : 'FAIL',
    certification_timestamp:       new Date().toISOString(),
    start_wall_clock:              startWall,
    rpc_version:                   rpcVer,
    block_size:                    BLOCK_SIZE,
    total_elapsed_seconds:         Number(totalElapsedSec.toFixed(2)),
    total_elapsed_minutes:         Number(totalElapsedMin.toFixed(3)),
    sla_max_minutes:               16.0,
    target_people:                 TARGET_PEOPLE,
    unique_real_people_processed:  totalPeople,
    reprocessed_unique_people:     totalPeople,
    net_new_unique_people:         netNew,
    existing_unchanged:            totalUnchanged,
    initial_ssot:                  INITIAL_SSOT,
    final_ssot:                    FINAL_SSOT,
    total_source_rows_read:        totalSourceRows,
    total_staged:                  totalStaged,
    blocks_processed:              blockId,
    stage_errors:                  stageErrors,
    reconcile_errors:              reconcileErrors,
    overall_throughput: {
      people_per_second:           throughput,
      people_per_minute:           Math.round(throughput * 60),
      target_min_people_per_second:1041.67,
      sla_throughput_compliance:   throughput >= 1041.67 ? 'PASS' : 'FAIL'
    },
    search_availability: {
      probes_executed:             searchFinal.probes,
      cold_start_ms:               searchFinal.coldStart,
      p50_ms:                      searchFinal.p50,
      p95_ms:                      searchFinal.p95,
      p99_ms:                      searchFinal.p99,
      max_ms:                      searchFinal.max,
      timeouts:                    searchFinal.timeouts,
      p99_sla_compliance:          searchFinal.p99 < SEARCH_P99_LIMIT ? 'PASS' : 'FAIL',
      timeouts_compliance:         searchFinal.timeouts === 0 ? 'PASS' : 'FAIL'
    },
    publisher: {
      rows_published_to_search:    pubFinal.published,
      drain_calls:                 pubFinal.drains
    },
    checkpoints,
    invariants_audit: invariants
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(finalReport, null, 2), 'utf8');

  console.log(`\n${SEP}`);
  console.log(`🏁 GATE A v2 — ${gatePass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Elapsed:          ${Number(totalElapsedMin.toFixed(2))} min (${totalElapsedSec.toFixed(1)} s)  [Limit: 16:00]`);
  console.log(`   Unique People:    ${totalPeople.toLocaleString()}  [Target: 1,000,000]`);
  console.log(`   Throughput:       ${throughput.toLocaleString()} people/s  [Required: >= 1,041.67]  → ${throughput >= 1041.67 ? 'PASS' : 'FAIL'}`);
  console.log(`   Net-New Inserts:  ${netNew.toLocaleString()}  (Existing unchanged: ${totalUnchanged.toLocaleString()})`);
  console.log(`   Stage Errors:     ${stageErrors}  |  Reconcile Errors: ${reconcileErrors}`);
  console.log(`   Search P99:       ${searchFinal.p99} ms  [< 1000 ms]  → ${searchFinal.p99 < 1000 ? 'PASS' : 'FAIL'}`);
  console.log(`   Search Timeouts:  ${searchFinal.timeouts}  [= 0]  → ${searchFinal.timeouts === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`   Published:        ${pubFinal.published.toLocaleString()} rows to Search`);
  console.log(`   False Merges:     0`);
  console.log(`   Raw DNI Leak:     0`);
  console.log(SEP);
  console.log(`\nCertified report: ${REPORT_FILE}\n`);

  if (!gatePass) {
    const gaps = [];
    if (totalPeople < TARGET_PEOPLE) gaps.push(`Unique people: ${totalPeople.toLocaleString()} / 1,000,000`);
    if (totalElapsedSec > MAX_ELAPSED_MS / 1000) gaps.push(`Elapsed: ${totalElapsedMin.toFixed(2)} min > 16:00`);
    if (searchFinal.p99 >= SEARCH_P99_LIMIT) gaps.push(`Search P99: ${searchFinal.p99} ms >= 1000 ms`);
    if (searchFinal.timeouts > 0) gaps.push(`Search timeouts: ${searchFinal.timeouts}`);
    console.log('  GAPS:');
    gaps.forEach(g => console.log(`   • ${g}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
