/**
 * profile_discovery_candidates_timeout.mjs — v2 (VALID)
 * ─────────────────────────────────────────────────────────────────────────────
 * Corrección v1: usaba discovery_id con colisiones de PK → INVALID BENCHMARK
 * v2: genera discovery_id con uuid + timestamp para garantizar unicidad absoluta.
 *
 * Verifica PROFILE_TEST_VALID = TRUE antes de aceptar cada resultado.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs   from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))        url = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const SEP = '═'.repeat(65);
const sep = '─'.repeat(65);
const RUN_ID = `prof_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const NOW    = new Date().toISOString();

console.log(`\n${SEP}`);
console.log(`  PROFILING v2 — discovery_candidates — RUN_ID: ${RUN_ID}`);
console.log(`  STATEMENT_TIMEOUT_ROOT_CAUSE = UNDER_INVESTIGATION`);
console.log(`${SEP}\n`);

// ── Helper: exec_sql si está disponible ──────────────────────────────────────
async function sql(query) {
  try {
    const { data, error } = await sb.rpc('exec_sql', { sql: query });
    if (error) return { ok: false, err: error.message, rows: [] };
    return { ok: true, rows: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { ok: false, err: String(e), rows: [] };
  }
}

// ── 1. Índices (via exec_sql o info_schema fallback) ─────────────────────────
console.log(`  ${sep}`);
console.log('  1. ÍNDICES');
console.log(`  ${sep}`);

const idxR = await sql(`
  SELECT indexname,
         indexdef,
         pg_size_pretty(pg_relation_size(indexrelid)) AS idx_size
  FROM pg_indexes
  WHERE tablename = 'atlas_people_discovery_candidates'
  ORDER BY indexname;
`);

let GIN_FOUND = false, TRIGGERS_FOUND = false, RLS_ENABLED = false;

if (idxR.ok) {
  for (const r of idxR.rows) {
    const isGin = /\bgin\b|\btrgm\b|\bgist\b/i.test(r.indexdef ?? '');
    if (isGin) GIN_FOUND = true;
    console.log(`  [${r.indexname}] ${r.idx_size ?? '?'} ${isGin ? '⚠️ GIN/TRGM' : ''}`);
    console.log(`    ${r.indexdef?.slice(0,120)}`);
  }
} else {
  console.log(`  exec_sql no disponible: ${idxR.err}`);
  console.log('  → índices no consultables vía API actual');
}

// ── 2. Triggers ───────────────────────────────────────────────────────────────
console.log(`\n  ${sep}`);
console.log('  2. TRIGGERS');
console.log(`  ${sep}`);
const trigR = await sql(`
  SELECT trigger_name, event_manipulation, action_timing
  FROM information_schema.triggers
  WHERE event_object_table = 'atlas_people_discovery_candidates';
`);
if (trigR.ok) {
  if (!trigR.rows.length) console.log('  Sin triggers');
  else {
    TRIGGERS_FOUND = true;
    trigR.rows.forEach(t => console.log(`  ⚠️  [${t.trigger_name}] ${t.action_timing} ${t.event_manipulation}`));
  }
} else {
  console.log(`  exec_sql no disponible: ${trigR.err}`);
}

// ── 3. Tamaño ────────────────────────────────────────────────────────────────
console.log(`\n  ${sep}`);
console.log('  3. TAMAÑO');
console.log(`  ${sep}`);
const { count: rowCount } = await sb.from('atlas_people_discovery_candidates')
  .select('*', { count: 'exact', head: true });
console.log(`  ROW_COUNT: ${rowCount?.toLocaleString() ?? 'unknown'}`);

const sizeR = await sql(`
  SELECT pg_size_pretty(pg_total_relation_size('atlas_people_discovery_candidates')) AS total,
         pg_size_pretty(pg_relation_size('atlas_people_discovery_candidates')) AS heap,
         pg_size_pretty(pg_total_relation_size('atlas_people_discovery_candidates')
           - pg_relation_size('atlas_people_discovery_candidates')) AS indexes;
`);
if (sizeR.ok && sizeR.rows[0]) {
  const s = sizeR.rows[0];
  console.log(`  TABLE: ${s.heap} | INDEXES: ${s.indexes} | TOTAL: ${s.total}`);
}

// ── 4. Benchmark de escritura — con IDs ÚNICOS GARANTIZADOS ──────────────────
console.log(`\n  ${sep}`);
console.log('  4. BENCHMARK DE ESCRITURA (IDs únicos garantizados)');
console.log(`  ${sep}`);

// Función generadora con IDs únicos — usa RUN_ID + índice + Math.random para
// garantizar que discovery_id no colisione con nada en producción ni entre runs.
let rowCounter = 0;
function makeUniqueTestRow() {
  rowCounter++;
  // Formato: "disc_proftest_" + RUN_ID + "_" + counter con padding
  const uid = `disc_proftest_${RUN_ID}_${String(rowCounter).padStart(8,'0')}`;
  return {
    discovery_id:           uid,           // PK — garantizadamente único
    display_name:           `Perf Test ${rowCounter}`,
    profession:             'Profiling',
    role:                   'PERF_TEST',
    organization:           'Atlas Profiling',
    geography_id:           'arg_nacional',
    neighborhood:           'Nacional',
    location_relation_type: 'PROF_TEST',
    location_evidence:      `Profile test row ${rowCounter} — safe to delete after ${RUN_ID}`,
    location_source_url:    'https://test.internal',
    source_id:              `PROFILING_${RUN_ID}`,  // Fuente única por run
    source_record_id:       uid,                   // Coincide con discovery_id (también único)
    person_source_url:      'https://test.internal',
    search_text_normalized: `perf test ${rowCounter} atlas profiling`.toLowerCase(),
    current_activity_state: 'ACTIVE',
    evidence_strength:      'LOW',
    social_profiles:        [],
    first_seen_at:          new Date().toISOString(),
    last_seen_at:           new Date().toISOString(),
    source_last_checked_at: new Date().toISOString(),
  };
}

const CHUNK_SIZES   = [1, 5, 10, 25, 50, 100, 200, 500, 1000];
const ROWS_PER_TEST = 200; // Rows por test de chunk — suficiente para medir throughput
const benchResults  = [];

for (const chunkSize of CHUNK_SIZES) {
  const nChunks  = Math.max(2, Math.ceil(ROWS_PER_TEST / chunkSize));
  const testRows = Array.from({ length: nChunks * chunkSize }, () => makeUniqueTestRow());

  let totalWritten = 0;
  let failedChunk  = null;
  const t0 = performance.now();

  for (let i = 0; i < testRows.length; i += chunkSize) {
    const chunk = testRows.slice(i, i + chunkSize);
    const ct0 = performance.now();
    const { error } = await sb
      .from('atlas_people_discovery_candidates')
      .upsert(chunk, { onConflict: 'source_id,source_record_id' });
    const ctMs = performance.now() - ct0;

    if (error) {
      failedChunk = { chunk_at: i, error_code: error.code, error_msg: error.message.slice(0, 150), chunk_ms: Math.round(ctMs) };
      break;
    }
    totalWritten += chunk.length;
  }

  const totalMs  = Math.round(performance.now() - t0);
  const rowsSec  = totalMs > 0 ? Math.round((totalWritten / (totalMs / 1000))) : 0;
  const testValid = failedChunk === null;

  const result = {
    chunk_size:      chunkSize,
    rows_attempted:  testRows.length,
    rows_written:    totalWritten,
    duration_ms:     totalMs,
    rows_sec:        rowsSec,
    timeout:         failedChunk?.error_code === '57014' || failedChunk?.error_msg?.includes('timeout'),
    error_code:      failedChunk?.error_code ?? null,
    error_message:   failedChunk?.error_msg ?? null,
    profile_test_valid: testValid,
  };
  benchResults.push(result);

  if (testValid) {
    console.log(`  chunk=${String(chunkSize).padStart(5)} → ${String(rowsSec).padStart(7)} rows/s  (${totalMs}ms, ${totalWritten} rows) ✅ VALID`);
  } else {
    console.log(`  chunk=${String(chunkSize).padStart(5)} → FAILED [${failedChunk.error_code}] ${failedChunk.error_msg?.slice(0,60)} ❌ INVALID`);
  }

  // Cleanup de esta ronda
  try { await sb.from('atlas_people_discovery_candidates').delete().eq('source_id', `PROFILING_${RUN_ID}`); } catch {}
  await new Promise(r => setTimeout(r, 300));
}

// ── Análisis ──────────────────────────────────────────────────────────────────
const validResults   = benchResults.filter(r => r.profile_test_valid);
const timeoutResults = benchResults.filter(r => r.timeout);
const bestResult     = validResults.sort((a,b) => b.rows_sec - a.rows_sec)[0];

let ROOT_CAUSE = 'UNDER_INVESTIGATION';
if (timeoutResults.length > 0 && validResults.length > 0) {
  const maxValidChunk  = Math.max(...validResults.map(r => r.chunk_size));
  const minTimeoutChunk = Math.min(...timeoutResults.map(r => r.chunk_size));
  ROOT_CAUSE = `STATEMENT_TIMEOUT above chunk=${minTimeoutChunk} (max valid=${maxValidChunk}) — investigating index update cost`;
} else if (timeoutResults.length > 0) {
  ROOT_CAUSE = 'STATEMENT_TIMEOUT on all chunk sizes — severe write latency, investigate GIN/trgm or table bloat';
} else if (validResults.length === CHUNK_SIZES.length) {
  ROOT_CAUSE = 'NO_TIMEOUT_DETECTED in current load — timeout may be transient or load-dependent';
}

console.log(`\n${SEP}`);
console.log('  RESUMEN PROFILING v2');
console.log(`${SEP}`);
console.log(`  PROFILE_TEST_VALID       = ${validResults.length > 0}`);
console.log(`  VALID_BENCHMARKS         = ${validResults.length}/${CHUNK_SIZES.length}`);
console.log(`  TIMEOUT_BENCHMARKS       = ${timeoutResults.length}/${CHUNK_SIZES.length}`);
console.log(`  GIN_TRGM_INDEX_PRESENT   = ${GIN_FOUND}`);
console.log(`  TRIGGERS_PRESENT         = ${TRIGGERS_FOUND}`);
console.log(`  BEST_CHUNK               = ${bestResult?.chunk_size ?? 'N/A'} (${bestResult?.rows_sec ?? 0} rows/s)`);
console.log(`\n  STATEMENT_TIMEOUT_ROOT_CAUSE = ${ROOT_CAUSE}`);

// Guardar reporte
const reportPath = path.resolve('reports/atlas/people/discovery_candidates_profiling_v2.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  run_id: RUN_ID, profiling_at: NOW, row_count: rowCount,
  gin_found: GIN_FOUND, triggers_found: TRIGGERS_FOUND,
  root_cause: ROOT_CAUSE, benchmarks: benchResults,
  best_chunk: bestResult?.chunk_size, best_rows_sec: bestResult?.rows_sec,
}, null, 2), 'utf-8');
console.log(`\n  Reporte: ${reportPath}`);
console.log(`${SEP}\n`);
