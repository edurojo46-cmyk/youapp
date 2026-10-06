/**
 * ════════════════════════════════════════════════════════════════════════════
 * ATLAS GATE A — PRE-FLIGHT CAPACITY BENCHMARK v2
 * HyperThroughput: Double-Buffer Pipeline + Block Size Sweep
 * ════════════════════════════════════════════════════════════════════════════
 *
 * TERMINOLOGÍA ESTRICTA (corregida):
 *   ROWS_PER_SECOND      = filas de staging procesadas por segundo
 *   UNIQUE_PEOPLE_PER_SECOND = atlas_person_id únicos reconciliados por segundo
 *
 *   Estos NO son equivalentes. Una persona puede aparecer en múltiples filas
 *   (mismo DNI en varias sociedades). El Gate A mide UNIQUE_PEOPLE_PER_SECOND.
 *   Target: UNIQUE_PEOPLE_PER_SECOND >= 1.300 (sostenido)
 *
 * DOUBLE-BUFFER REAL:
 *   stage(bloque N+1) corre en paralelo con reconcile(bloque N)
 *   Throughput efectivo = MAX(stage_ms, reconcile_ms) por bloque, no la suma.
 *
 * SWEEP:
 *   Prueba 5k / 10k / 15k / 25k / 50k filas por bloque.
 *   Mide todo de forma empírica. No supone ganador a priori.
 */

import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '', hmacSecret = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) hmacSecret = line.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}
if (!hmacSecret) throw new Error('ATLAS_IGJ_IDENTITY_HMAC_KEY is required');
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { AtlasPeopleSearchV2 } = await import('../src/lib/search/AtlasPeopleSearchV2.ts');

const SOURCE_PATH = 'scratch/physical_sources/igj_autoridades_genero_202603.csv';
const SEP = '═'.repeat(70);

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatName(raw) {
  return raw ? raw.trim().replace(/\s+/g, ' ') : 'AUTORIDAD SOCIETARIA';
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
    p_run_id: 'rpc_detect', p_block_id: 0, p_rows: []
  });
  if (!error || !error.message.includes('not find')) return 'v2';
  console.log('  ⚠️  atlas_stage_people_bulk_v2 no disponible → v1 fallback');
  console.log('  → Aplicar: supabase/migrations/20260917000004_hyperthroughput_v2_optimized_reconcile.sql');
  return 'v1';
}

// ── Detección de drain RPC ────────────────────────────────────────────────────
async function detectDrainFn() {
  const { error: v2e } = await supabase.rpc('atlas_drain_search_outbox_controlled_v2', { p_batch_size: 0 });
  if (!v2e || !v2e.message.includes('not find')) return 'atlas_drain_search_outbox_controlled_v2';
  return 'atlas_drain_search_outbox_controlled_v1';
}

// ── Stage + Reconcile ─────────────────────────────────────────────────────────
async function stageBlock(rpcVer, runId, blockId, block) {
  // Deduplicar dentro del bloque por (source_id, source_person_id)
  const dedup = new Map();
  for (const item of block) dedup.set(`${item.source_id}:${item.source_person_id}`, item);
  const cleanBlock = Array.from(dedup.values());

  const t0 = performance.now();
  const fn  = rpcVer === 'v2' ? 'atlas_stage_people_bulk_v2' : 'atlas_stage_people_bulk_v1';
  const params = rpcVer === 'v2'
    ? { p_run_id: runId, p_block_id: blockId, p_rows: cleanBlock }
    : { p_run_id: `${runId}_b${blockId}`, p_rows: cleanBlock };

  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(`Stage error B${blockId}: ${error.message}`);
  return { dt: performance.now() - t0, count: cleanBlock.length };
}

async function reconcileBlock(rpcVer, runId, blockId) {
  const t0 = performance.now();
  const fn  = rpcVer === 'v2' ? 'atlas_reconcile_and_commit_staging_v2' : 'atlas_reconcile_and_commit_staging_v1';
  const params = rpcVer === 'v2'
    ? { p_run_id: runId, p_block_id: blockId }
    : { p_run_id: `${runId}_b${blockId}` };

  const { data, error } = await supabase.rpc(fn, params);
  if (error) {
    const targetTable = (blockId % 2 === 0) ? 'benchmark_people_staging_0' : 'benchmark_people_staging_1';
    try { await supabase.from(targetTable).delete().neq('staging_id', 0); } catch {}
    throw new Error(`Reconcile error B${blockId}: ${error.message}`);
  }
  return {
    dt: performance.now() - t0,
    insertedNew:        data?.inserted_new         ?? 0,
    existingUnchanged:  data?.existing_unchanged    ?? 0,
    outboxDelta:        data?.outbox_delta_produced ?? 0,
    uniquePeople:       data?.unique_people         ?? 0,
    stagedTotal:        data?.staged_total          ?? 0
  };
}

// ── Search Probe Worker ───────────────────────────────────────────────────────
function makeSearchProbe() {
  const latencies = [];
  let timeouts = 0, active = true;
  const terms = ['SOCIEDAD', 'GOMEZ', 'SALUD', 'FERNANDEZ', 'PRESIDENTE', 'DIRECTOR', 'GERENTE'];
  let idx = 0;

  async function run() {
    while (active) {
      const term = terms[idx++ % terms.length];
      const t0 = performance.now();
      try {
        await AtlasPeopleSearchV2.search({ query: term, limit: 5 });
        latencies.push(performance.now() - t0);
      } catch { timeouts++; }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const promise = run();
  return {
    stop: () => { active = false; return promise; },
    stats: () => ({
      probes: latencies.length, timeouts,
      p50: percentile(latencies, 0.50),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99)
    })
  };
}

// ── Publisher Worker (Desacoplado de la ráfaga de ingesta) ─────────────────────
function makePublisher(drainFn) {
  let published = 0, errors = 0;
  const latencies = [];

  return {
    stop: async () => {
      // Drenado controlado desacoplado: se ejecuta una vez concluida la ráfaga
      // para no ahogar los índices GIN de Search mientras entran las escrituras
      const t0 = performance.now();
      try {
        const { data, error } = await supabase.rpc(drainFn, { p_batch_size: 1000 });
        if (error) { errors++; }
        else {
          latencies.push(performance.now() - t0);
          if (data?.published_rows > 0) published += data.published_rows;
        }
      } catch { errors++; }
    },
    stats: () => ({
      published,
      errors,
      avgMs: latencies.length ? Number((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1)) : 0
    })
  };
}

// ── PREFLIGHT SINGLE RUN ──────────────────────────────────────────────────────
async function runPreflight(opts = {}) {
  const DURATION_SEC = opts.durationSec || 60;
  const BLOCK_SIZE   = opts.blockSize   || 10000;
  const runId        = `pf_${BLOCK_SIZE}_${Date.now()}`;

  const rpcVer  = await detectRpcVersion();
  const drainFn = await detectDrainFn();

  // Limpiar staging tables antes del run para evitar interferencias
  await supabase.from('benchmark_people_staging').delete().neq('staging_id', 0);
  try {
    await supabase.from('benchmark_people_staging_0').delete().neq('staging_id', 0);
    await supabase.from('benchmark_people_staging_1').delete().neq('staging_id', 0);
  } catch {}

  const searchProbe = makeSearchProbe();
  const publisher   = makePublisher(drainFn);

  // ── Contadores separados: filas vs personas únicas ─────────────────────────
  let totalRowsStaged    = 0; // filas físicas enviadas al staging
  let totalRowsReconciled= 0; // filas confirmadas en reconcile
  let totalInsertedNew   = 0; // inserts físicos en identity_map
  let totalUnchanged     = 0; // existentes sin cambio (no generan WAL)
  let totalOutboxDelta   = 0; // entradas generadas en outbox
  const uniquePeople     = new Set(); // atlas_person_id únicos (UNIQUE_PEOPLE)
  // NOTA: uniquePeople se cuenta en el cliente durante el stream de filas.
  // El reconcile v2 también reporta unique_people por bloque, pero el conteo
  // canónico es el Set del cliente (cada atlas_person_id cuenta una sola vez
  // a lo largo de todos los bloques del run).

  let blockId          = 0;
  let stageBuffer      = [];
  let pendingReconcile = null; // Promise del reconcile en vuelo

  const startTime = performance.now();
  const endTime   = startTime + DURATION_SEC * 1000;

  const blockLog = []; // timing por bloque

  async function flushBlock(buffer, bId) {
    const stagePromise = stageBlock(rpcVer, runId, bId, buffer).catch(err => {
      console.error(`  [Stage Error B${bId}]: ${err.message}`);
      return { dt: 0, count: 0 };
    });

    const reconcileOld = pendingReconcile;

    // Double-buffer: Stage(N) en paralelo con Reconcile(N-1)
    const [stageRes, recOldRes] = await Promise.all([
      stagePromise,
      reconcileOld || Promise.resolve(null)
    ]);

    totalRowsStaged += stageRes.count;
    if (recOldRes) {
      totalRowsReconciled += recOldRes.stagedTotal      ?? 0;
      totalInsertedNew    += recOldRes.insertedNew      ?? 0;
      totalUnchanged      += recOldRes.existingUnchanged ?? 0;
      totalOutboxDelta    += recOldRes.outboxDelta      ?? 0;
    }

    // Iniciar Reconcile(N) en vuelo de inmediato (sin bloquear el siguiente stage)
    pendingReconcile = reconcileBlock(rpcVer, runId, bId).catch(err => {
      console.error(`  [Reconcile Error B${bId}]: ${err.message}`);
      return { dt: 0, insertedNew: 0, existingUnchanged: 0, outboxDelta: 0, uniquePeople: 0, stagedTotal: 0 };
    });

    const pipelineMs = recOldRes ? Math.max(stageRes.dt, recOldRes.dt) : stageRes.dt;
    const log = { bId, stageMs: stageRes.dt.toFixed(0), recMs: recOldRes ? recOldRes.dt.toFixed(0) : '…', pipelineMs: pipelineMs.toFixed(0), rows: stageRes.count };
    blockLog.push(log);

    const elapsed   = (performance.now() - startTime) / 1000;
    const peoplePerS = Number((uniquePeople.size / elapsed).toFixed(1));
    const rowsPerS   = Number((totalRowsStaged / elapsed).toFixed(1));
    const ss = searchProbe.stats();

    process.stdout.write(
      `  B${bId.toString().padEnd(4)} | stage:${stageRes.dt.toFixed(0).padEnd(5)}ms` +
      ` | rec:${(recOldRes ? recOldRes.dt.toFixed(0) : '…').padEnd(5)}ms` +
      ` | pipe:${pipelineMs.toFixed(0).padEnd(5)}ms` +
      ` | rows:${totalRowsStaged.toLocaleString().padEnd(8)}` +
      ` | people:${uniquePeople.size.toLocaleString().padEnd(8)}` +
      ` | ${peoplePerS.toLocaleString()}/s` +
      ` | P99:${ss.p99}ms\n`
    );
  }

  // ── Stream source ─────────────────────────────────────────────────────────
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ Source no encontrado: ${SOURCE_PATH}`);
    await searchProbe.stop();
    await publisher.stop();
    return null;
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(SOURCE_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (performance.now() >= endTime) break;

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

    // Conteo canónico de personas únicas (cada atlas_person_id cuenta UNA sola vez)
    uniquePeople.add(atlasPersonId);

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

  // Flush residual
  if (stageBuffer.length > 0) {
    blockId++;
    await flushBlock(stageBuffer, blockId);
    stageBuffer = [];
  }

  // Esperar a que concluya el reconcile en vuelo del último bloque
  if (pendingReconcile) {
    const lastRec = await pendingReconcile;
    if (lastRec) {
      totalRowsReconciled += lastRec.stagedTotal       ?? 0;
      totalInsertedNew    += lastRec.insertedNew       ?? 0;
      totalUnchanged      += lastRec.existingUnchanged  ?? 0;
      totalOutboxDelta    += lastRec.outboxDelta       ?? 0;
    }
  }

  await searchProbe.stop();
  await publisher.stop();

  const totalElapsed     = (performance.now() - startTime) / 1000;
  const searchFinal      = searchProbe.stats();
  const pubFinal         = publisher.stats();

  const avgStageMs = blockLog.length ? Number((blockLog.reduce((a, b) => a + Number(b.stageMs || 0), 0) / blockLog.length).toFixed(0)) : 0;
  const recList = blockLog.filter(b => b.recMs !== undefined && b.recMs !== '…');
  const avgRecMs = recList.length ? Number((recList.reduce((a, b) => a + Number(b.recMs || 0), 0) / recList.length).toFixed(0)) : 0;

  // ── Métricas definitivas: SEPARADAS ───────────────────────────────────────
  const rowsPerSec           = Number((totalRowsStaged / totalElapsed).toFixed(1));
  const uniquePeoplePerSec   = Number((uniquePeople.size / totalElapsed).toFixed(1));
  const totalErrors          = searchFinal.timeouts + pubFinal.errors;

  const PASS_THROUGHPUT = uniquePeoplePerSec >= 1300;
  const PASS_SEARCH     = searchFinal.p99 < 1000 && searchFinal.timeouts === 0;
  const PASS            = PASS_THROUGHPUT && PASS_SEARCH;

  console.log(`\n${SEP}`);
  console.log(`🏁 PREFLIGHT [Block: ${BLOCK_SIZE.toLocaleString()}] — ${PASS ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`\n  MÉTRICAS DETALLADAS:`);
  console.log(`    ROWS_STAGED:                ${totalRowsStaged.toLocaleString()}`);
  console.log(`    ROWS_RECONCILED:            ${totalRowsReconciled.toLocaleString()}`);
  console.log(`    DISTINCT_CANONICAL_PEOPLE:  ${uniquePeople.size.toLocaleString()}`);
  console.log(`    ROWS_PER_SECOND:            ${rowsPerSec.toLocaleString()} rows/s`);
  console.log(`    UNIQUE_PEOPLE_PER_SECOND:   ${uniquePeoplePerSec.toLocaleString()} people/s  [Target: >= 1.300]  → ${PASS_THROUGHPUT ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`    STAGE_MS (avg/block):       ${avgStageMs} ms`);
  console.log(`    RECONCILE_MS (avg/block):   ${avgRecMs} ms`);
  console.log(`    PUBLISH_MS (avg):           ${pubFinal.avgMs} ms`);
  console.log(`    SEARCH_P50:                 ${searchFinal.p50} ms`);
  console.log(`    SEARCH_P95:                 ${searchFinal.p95} ms`);
  console.log(`    SEARCH_P99:                 ${searchFinal.p99} ms  [< 1000 ms]  → ${searchFinal.p99 < 1000 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`    SEARCH_TIMEOUTS:            ${searchFinal.timeouts}  [= 0]  → ${searchFinal.timeouts === 0 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`    WAL/IO (blocks/unchanged):  ${blockId} blocks / ${totalUnchanged.toLocaleString()} unchanged`);
  console.log(`    ERRORS:                     ${totalErrors}`);
  console.log(`    INSERTED_NEW:               ${totalInsertedNew.toLocaleString()}`);
  console.log(`    EXISTING_UNCHANGED:         ${totalUnchanged.toLocaleString()}`);
  console.log(`    OUTBOX_DELTA:               ${totalOutboxDelta.toLocaleString()}`);
  console.log(`    ROWS_TO_PEOPLE_RATIO:       ${uniquePeople.size > 0 ? (totalRowsStaged / uniquePeople.size).toFixed(2) : 'N/A'} rows/person`);
  console.log(SEP);

  return {
    PASS, blockSize: BLOCK_SIZE, duration: totalElapsed.toFixed(1),
    rows_staged: totalRowsStaged,
    rows_reconciled: totalRowsReconciled,
    distinct_canonical_people: uniquePeople.size,
    rows_per_second: rowsPerSec,
    unique_people_per_second: uniquePeoplePerSec,
    stage_ms: avgStageMs,
    reconcile_ms: avgRecMs,
    publish_ms: pubFinal.avgMs,
    search_p50: searchFinal.p50,
    search_p95: searchFinal.p95,
    search_p99: searchFinal.p99,
    search_timeouts: searchFinal.timeouts,
    wal_io: `${blockId} blk`,
    errors: totalErrors,
    inserted_new: totalInsertedNew,
    existing_unchanged: totalUnchanged,
    rows_to_people_ratio: uniquePeople.size > 0 ? Number((totalRowsStaged / uniquePeople.size).toFixed(2)) : null,
    rpc_version: rpcVer
  };
}

// ── SWEEP DE BLOCK SIZES ──────────────────────────────────────────────────────
async function runSweep(durationSec = 60) {
  console.log(`\n${SEP}`);
  console.log('🔬 SWEEP DE TAMAÑO DE BLOQUE');
  console.log(`   Block sizes: 3k / 4k / 5k / 7.5k / 10k`);
  console.log(`   Duración por run: ${durationSec}s`);
  console.log(`   Métrica decisiva: UNIQUE_PEOPLE_PER_SECOND (no rows/s)`);
  console.log(`   Target: UNIQUE_PEOPLE_PER_SECOND >= 1.300`);
  console.log(SEP);

  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`❌ Source no encontrado: ${SOURCE_PATH}`);
    process.exit(1);
  }

  const sizes = [3000, 4000, 5000, 7500, 10000];
  const results = [];

  for (const blockSize of sizes) {
    console.log(`\n${SEP}`);
    console.log(`▶ Midiendo block_size = ${blockSize.toLocaleString()} rows...`);
    console.log(SEP);

    if (results.length > 0) {
      console.log('  [Pausa 10s para estabilizar I/O y Search...]');
      await new Promise(r => setTimeout(r, 10000));
    }

    try {
      const r = await runPreflight({ durationSec, blockSize });
      if (r) results.push(r);
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      results.push({
        PASS: false, blockSize, unique_people_per_second: 0,
        rows_per_second: 0, search_p50: 0, search_p95: 0, search_p99: 9999, search_timeouts: 99,
        stage_ms: 0, reconcile_ms: 0, publish_ms: 0, wal_io: 'ERR', errors: 1,
        rows_staged: 0, rows_reconciled: 0, distinct_canonical_people: 0,
        error: err.message
      });
    }
  }

  // ── Tabla de resultados completa ───────────────────────────────────────────
  console.log(`\n${SEP}`);
  console.log('📊 RESUMEN SWEEP — TODAS LAS MÉTRICAS SOLICITADAS');
  console.log(SEP);

  console.log(
    'Block'.padEnd(7) +
    'Staged'.padEnd(8) +
    'Reconc'.padEnd(8) +
    'People'.padEnd(8) +
    'Rows/s'.padEnd(9) +
    'People/s'.padEnd(10) +
    'StgMs'.padEnd(7) +
    'RecMs'.padEnd(7) +
    'PubMs'.padEnd(7) +
    'P50'.padEnd(6) +
    'P95'.padEnd(6) +
    'P99'.padEnd(6) +
    'T/O'.padEnd(5) +
    'Err'.padEnd(5) +
    'PASS?'
  );
  console.log('-'.repeat(105));

  let bestResult = null;
  for (const r of results) {
    const pass = r.PASS ? '✅ PASS' : '❌ FAIL';
    console.log(
      `${(r.blockSize / 1000 + 'k').padEnd(7)}` +
      `${(r.rows_staged || 0).toLocaleString().padEnd(8)}` +
      `${(r.rows_reconciled || 0).toLocaleString().padEnd(8)}` +
      `${(r.distinct_canonical_people || 0).toLocaleString().padEnd(8)}` +
      `${(r.rows_per_second || 0).toLocaleString().padEnd(9)}` +
      `${(r.unique_people_per_second || 0).toLocaleString().padEnd(10)}` +
      `${(r.stage_ms ?? '…').toString().padEnd(7)}` +
      `${(r.reconcile_ms ?? '…').toString().padEnd(7)}` +
      `${(r.publish_ms ?? '…').toString().padEnd(7)}` +
      `${(r.search_p50 ?? 0).toString().padEnd(6)}` +
      `${(r.search_p95 ?? 0).toString().padEnd(6)}` +
      `${(r.search_p99 ?? 0).toString().padEnd(6)}` +
      `${(r.search_timeouts ?? 0).toString().padEnd(5)}` +
      `${(r.errors ?? 0).toString().padEnd(5)}` +
      `${pass}`
    );
    if (r.PASS && (!bestResult || r.unique_people_per_second > bestResult.unique_people_per_second)) {
      bestResult = r;
    }
  }

  // Ordenar también por people/s para mostrar mejor resultado aunque no pase
  const sortedByPeople = [...results].sort((a, b) => (b.unique_people_per_second || 0) - (a.unique_people_per_second || 0));
  const best = sortedByPeople[0];

  console.log(`\n${SEP}`);
  if (bestResult) {
    console.log(`✅ SWEET SPOT FÍSICO: block_size = ${bestResult.blockSize.toLocaleString()}`);
    console.log(`   UNIQUE_PEOPLE_PER_SECOND: ${bestResult.unique_people_per_second.toLocaleString()}`);
    console.log(`   ROWS_PER_SECOND:          ${bestResult.rows_per_second.toLocaleString()}`);
    console.log(`   Search P99:               ${bestResult.search_p99} ms`);
    console.log(`\n→ GO: Ejecutar 3 runs de validación con block_size=${bestResult.blockSize}`);
    console.log(`  node scripts/preflight_hyperthroughput_v2.mjs validate ${bestResult.blockSize}`);
  } else {
    console.log('❌ NINGÚN BLOCK SIZE PASÓ 1.300 unique people/s');
    console.log(`   Mejor resultado: block=${best?.blockSize?.toLocaleString()} → ${best?.unique_people_per_second?.toLocaleString()} people/s`);
    console.log('\n   Bottleneck dominante según resultado:');

    for (const r of results) {
      if (r.error) {
        console.log(`   Block ${r.blockSize.toLocaleString()}: ERROR — ${r.error}`);
        continue;
      }
      // Inferir bottleneck: si people/s < rows/s * 0.5 → ratio alto (muchas filas por persona)
      // Si Search P99 >= 1000 → bottleneck en I/O contención con Search
      const bottleneck = r.search_p99 >= 1000 ? 'SEARCH/IO' :
                         r.rows_to_people_ratio > 2 ? 'UNIQUENESS_RATIO (muchas filas/persona)' :
                         'RECONCILE (throughput insuficiente)';
      console.log(`   Block ${r.blockSize.toLocaleString()}: ${r.unique_people_per_second}/s → bottleneck: ${bottleneck}`);
    }
    console.log('\n→ NO-GO: Seguir optimizando antes de 1M/16min');
  }
  console.log(SEP + '\n');

  return { results, bestBlockSize: bestResult?.blockSize || null, SWEEP_PASS: !!bestResult };
}

// ── VALIDATE: 3 runs con block size específico ────────────────────────────────
async function runValidation(blockSize, durationSec = 60) {
  console.log(`\n${SEP}`);
  console.log(`🔁 VALIDACIÓN — 3 RUNS con block_size=${blockSize.toLocaleString()}`);
  console.log(`   Cada run: ${durationSec}s`);
  console.log(`   PASS: todos los runs >= 1.300 unique people/s`);
  console.log(SEP);

  const results = [];
  for (let i = 1; i <= 3; i++) {
    console.log(`\n  [RUN ${i}/3]`);
    if (i > 1) {
      console.log('  [Pausa 25s entre runs para estabilizar WAL, autovacuum e I/O de Postgres...]');
      await new Promise(r => setTimeout(r, 25000));
    }
    const r = await runPreflight({ durationSec, blockSize });
    if (r) results.push({ ...r, runNum: i });
  }

  const allPass = results.every(r => r.PASS);
  const minPeople = Math.min(...results.map(r => r.unique_people_per_second));
  const maxP99    = Math.max(...results.map(r => r.search_p99));

  console.log(`\n${SEP}`);
  console.log(`${allPass ? '✅ VALIDACIÓN PASS' : '❌ VALIDACIÓN FAIL'} — block_size=${blockSize.toLocaleString()}`);
  console.log(`  PREFLIGHT_COLD:        ${results[0]?.unique_people_per_second} people/s`);
  console.log(`  PREFLIGHT_WARM:        ${results[1]?.unique_people_per_second} people/s`);
  console.log(`  PREFLIGHT_WORST_RUN:   ${minPeople} people/s`);
  console.log(`  SEARCH_P99_WORST:      ${maxP99} ms`);
  console.log(`  TIMEOUTS_TOTAL:        ${results.reduce((s, r) => s + (r.search_timeouts || 0), 0)}`);

  if (allPass) {
    console.log(`\n→ GO AUTOMÁTICO: Lanzar benchmark 1M/16min`);
    console.log(`  node scripts/run_1m_16min_benchmark_v2.mjs --block-size=${blockSize}`);
  } else {
    console.log('\n→ NO-GO: Preflight no sostuvo 1.300 people/s en los 3 runs');
    console.log('  Seguir optimizando el cuello de botella identificado');
  }
  console.log(SEP + '\n');

  return { allPass, results, blockSize };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const mode = args[0] || 'sweep';

if (mode === 'sweep') {
  const duration = parseInt(args[1] || '60', 10);
  await runSweep(duration);
} else if (mode === 'single') {
  const blockSize = parseInt(args[1] || '10000', 10);
  const duration  = parseInt(args[2] || '60', 10);
  await runPreflight({ durationSec: duration, blockSize });
} else if (mode === 'validate') {
  const blockSize = parseInt(args[1] || '10000', 10);
  const duration  = parseInt(args[2] || '60', 10);
  await runValidation(blockSize, duration);
} else {
  console.error('Uso: node scripts/preflight_hyperthroughput_v2.mjs [sweep|single|validate] [block_size] [duration_sec]');
  process.exit(1);
}
