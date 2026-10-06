/**
 * DIAGNÓSTICO INMEDIATO ATLAS v2 — CORREGIDO
 * ─────────────────────────────────────────────────────────────────────────────
 * SSOT físico: COUNT(DISTINCT atlas_person_id) FROM atlas_person_identity_map
 * NO usa atlas_people como fuente de verdad física.
 * NO reinicia nada. Solo lectura.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs   from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Credenciales ──────────────────────────────────────────────────────────────
const envContent = fs.readFileSync('.env', 'utf8');
let url = '', key = '';
for (const line of envContent.split('\n')) {
  if (line.startsWith('VITE_SUPABASE_URL='))        url = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key = line.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// ── Helper: RPC o fallback para conteo SSOT ──────────────────────────────────
async function getPhysicalCount() {
  // Intento 1: RPC certificado existente
  try {
    const { data, error } = await sb.rpc('get_exact_identity_count');
    if (!error && data !== null) return { count: Number(data), method: 'rpc:get_exact_identity_count' };
  } catch {}
  // Intento 2: count directo sobre identity_map
  const { count, error } = await sb
    .from('atlas_person_identity_map')
    .select('*', { count: 'exact', head: true });
  if (!error) return { count: Number(count), method: 'count:atlas_person_identity_map' };
  return { count: null, method: 'ERROR', error: error?.message };
}

// ── Helper: exec_sql genérica ─────────────────────────────────────────────────
async function execSql(sql) {
  try {
    const { data, error } = await sb.rpc('exec_sql', { sql });
    if (error) return { ok: false, err: error.message };
    return { ok: true, rows: data };
  } catch (e) {
    return { ok: false, err: String(e) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. SNAPSHOT T0 — CONTEO FÍSICO SSOT
// ════════════════════════════════════════════════════════════════════════════
const T0 = Date.now();
const T0_ISO = new Date(T0).toISOString();

const { count: PHYSICAL_COUNT_T0, method: countMethod, error: countError } = await getPhysicalCount();

// ── Conteo buscable ───────────────────────────────────────────────────────────
const { count: SEARCHABLE_COUNT, error: searchErr } = await sb
  .from('atlas_argentina_people_search_projection_v1')
  .select('*', { count: 'exact', head: true });

const PHYSICAL_NOT_SEARCHABLE = (PHYSICAL_COUNT_T0 !== null && SEARCHABLE_COUNT !== null)
  ? PHYSICAL_COUNT_T0 - SEARCHABLE_COUNT
  : 'INCALCULABLE';

// ── Último registro insertado en identity_map ─────────────────────────────────
const { data: lastMapRow, error: lastMapErr } = await sb
  .from('atlas_person_identity_map')
  .select('created_at, source_id')
  .order('created_at', { ascending: false })
  .limit(1);

let LAST_SUCCESSFUL_COMMIT_AT = 'UNKNOWN';
let SECONDS_SINCE_LAST_COMMIT = null;
let LAST_SUCCESSFUL_BATCH_AT = 'UNKNOWN';
if (!lastMapErr && lastMapRow?.length > 0) {
  LAST_SUCCESSFUL_COMMIT_AT = lastMapRow[0].created_at;
  LAST_SUCCESSFUL_BATCH_AT  = lastMapRow[0].created_at;
  SECONDS_SINCE_LAST_COMMIT = Math.floor((T0 - new Date(LAST_SUCCESSFUL_COMMIT_AT).getTime()) / 1000);
}

// ── Personas SSOT añadidas en últimos 5 min ───────────────────────────────────
const FIVE_MIN_AGO = new Date(T0 - 5 * 60 * 1000).toISOString();
const { count: recentMapCount, error: recentMapErr } = await sb
  .from('atlas_person_identity_map')
  .select('*', { count: 'exact', head: true })
  .gte('created_at', FIVE_MIN_AGO);

// Esto es un proxy válido: filas nuevas en identity_map = identidades físicas nuevas
// (puede incluir aliases, pero es el mejor indicador disponible sin snapshot previo)
const UNIQUE_PEOPLE_ADDED_LAST_5_MIN = recentMapErr
  ? `ERROR:${recentMapErr.message}`
  : (recentMapCount ?? 0);

// ════════════════════════════════════════════════════════════════════════════
// 2. WORKER — HEARTBEAT LOCAL
// ════════════════════════════════════════════════════════════════════════════
const REPORTS_DIR    = path.resolve('reports/atlas/realtime');
const HEARTBEAT_FILE = path.join(REPORTS_DIR, 'worker_heartbeat.json');
const FACTORY_STATE  = path.join(REPORTS_DIR, 'factory_state.json');
const WORKER_LOG     = path.join(REPORTS_DIR, 'worker_stdout.log');
const WORKER_ERR_LOG = path.join(REPORTS_DIR, 'worker_stderr.log');

function isPidAlive(pid) {
  try { process.kill(Number(pid), 0); return true; } catch { return false; }
}

let WORKER_STATUS         = 'UNKNOWN';
let WORKER_PID            = null;
let HEARTBEAT_AGE_SECONDS = null;
let CURRENT_FACTORY_STAGE = 'UNKNOWN';
let SOURCE_OFFSET         = 'UNKNOWN';
let SOURCE_TOTAL_ROWS     = 'UNKNOWN';
let SOURCE_EOF            = false;
let COMMIT_QUEUE_DEPTH    = 'UNKNOWN';
let INDEX_QUEUE_DEPTH     = 'UNKNOWN';
let LAST_WORKER_ERROR     = 'NONE';
let LAST_SUCCESSFUL_BATCH_ID = 'UNKNOWN';

// Heartbeat
if (fs.existsSync(HEARTBEAT_FILE)) {
  try {
    const hb = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf-8'));
    WORKER_PID            = hb.pid ?? null;
    HEARTBEAT_AGE_SECONDS = Math.floor((T0 - new Date(hb.timestamp).getTime()) / 1000);
    // Priorizar hb.stage / hb.current_stage sobre runtime_status genérico
    CURRENT_FACTORY_STAGE = hb.stage ?? hb.current_stage ?? hb.runtime_status ?? 'UNKNOWN';
    LAST_SUCCESSFUL_BATCH_ID = hb.last_batch_id ?? hb.batch_id ?? 'UNKNOWN';

    const alive = WORKER_PID ? isPidAlive(WORKER_PID) : false;
    if (!alive)                        WORKER_STATUS = 'DEAD';
    else if (HEARTBEAT_AGE_SECONDS > 90) WORKER_STATUS = 'STALE';
    else                               WORKER_STATUS = 'ALIVE';
  } catch { WORKER_STATUS = 'HEARTBEAT_CORRUPTED'; }
} else {
  WORKER_STATUS = 'NO_HEARTBEAT_FILE';
}

// Factory state
if (fs.existsSync(FACTORY_STATE)) {
  try {
    const fs_data = JSON.parse(fs.readFileSync(FACTORY_STATE, 'utf-8'));
    SOURCE_OFFSET      = fs_data.source_offset ?? fs_data.offset ?? 'UNKNOWN';
    SOURCE_TOTAL_ROWS  = fs_data.source_total_rows ?? fs_data.total_rows ?? 'UNKNOWN';
    SOURCE_EOF         = fs_data.source_eof ?? fs_data.eof ?? false;
    COMMIT_QUEUE_DEPTH = fs_data.commit_queue ?? fs_data.queue_depth ?? 'UNKNOWN';
    INDEX_QUEUE_DEPTH  = fs_data.index_queue ?? 'UNKNOWN';
    // No sobreescribir CURRENT_FACTORY_STAGE si ya viene del heartbeat
    if (CURRENT_FACTORY_STAGE === 'UNKNOWN') {
      CURRENT_FACTORY_STAGE = fs_data.stage ?? fs_data.current_stage ?? fs_data.status ?? 'UNKNOWN';
    }
  } catch {}
}

// SOURCE_ROWS_REMAINING
const SOURCE_ROWS_REMAINING = (typeof SOURCE_OFFSET === 'number' && typeof SOURCE_TOTAL_ROWS === 'number')
  ? SOURCE_TOTAL_ROWS - SOURCE_OFFSET
  : 'UNKNOWN';

// EOF certificado
const SOURCE_EOF_CERTIFIED = SOURCE_EOF === true ||
  (typeof SOURCE_OFFSET === 'number' && typeof SOURCE_TOTAL_ROWS === 'number' && SOURCE_OFFSET >= SOURCE_TOTAL_ROWS);

// Últimas líneas de logs
let LAST_LOG_LINES = [];
let LAST_ERR_LINES = [];
if (fs.existsSync(WORKER_LOG)) {
  try {
    const content = fs.readFileSync(WORKER_LOG, 'utf-8');
    LAST_LOG_LINES = content.split('\n').filter(l => l.trim()).slice(-15);
  } catch {}
}
if (fs.existsSync(WORKER_ERR_LOG)) {
  try {
    const content = fs.readFileSync(WORKER_ERR_LOG, 'utf-8');
    const errLines = content.split('\n').filter(l => l.trim());
    LAST_ERR_LINES = errLines.slice(-5);
    if (errLines.length > 0) LAST_WORKER_ERROR = errLines[errLines.length - 1].slice(0, 200);
  } catch {}
}

// ════════════════════════════════════════════════════════════════════════════
// 3. DB — LOCKS Y TRANSACCIONES (detallado)
// ════════════════════════════════════════════════════════════════════════════
let LOCK_WAIT_COUNT       = 'UNKNOWN';
let LONGEST_LOCK_WAIT_MS  = 'UNKNOWN';
let BLOCKING_PID          = 'UNKNOWN';
let BLOCKED_PID           = 'UNKNOWN';
let BLOCKED_QUERY         = 'UNKNOWN';
let DB_ACTIVE_TRANSACTIONS = 'UNKNOWN';

const lockDetailSql = `
  SELECT
    count(*)                                              AS lock_wait_count,
    coalesce(max(extract(epoch from clock_timestamp() - query_start)*1000)::bigint, 0) AS longest_lock_wait_ms,
    min(pg_blocking_pids(pid)[1])                         AS blocking_pid,
    min(pid)                                              AS blocked_pid,
    left(min(query), 300)                                 AS blocked_query
  FROM pg_stat_activity
  WHERE wait_event_type = 'Lock' AND state != 'idle'
`;
const lockResult = await execSql(lockDetailSql);
if (lockResult.ok && lockResult.rows?.length > 0) {
  const r = lockResult.rows[0];
  LOCK_WAIT_COUNT      = r.lock_wait_count ?? 0;
  LONGEST_LOCK_WAIT_MS = r.longest_lock_wait_ms ?? 0;
  BLOCKING_PID         = r.blocking_pid ?? 'NONE';
  BLOCKED_PID          = r.blocked_pid ?? 'NONE';
  BLOCKED_QUERY        = r.blocked_query ?? 'NONE';
} else {
  LOCK_WAIT_COUNT = `NO_RPC(${lockResult.err ?? 'unknown'})`;
}

const txSql = `SELECT count(*) as active_tx FROM pg_stat_activity WHERE state='active' AND query NOT ILIKE '%pg_stat_activity%'`;
const txResult = await execSql(txSql);
if (txResult.ok && txResult.rows?.length > 0) {
  DB_ACTIVE_TRANSACTIONS = txResult.rows[0].active_tx ?? 0;
} else {
  DB_ACTIVE_TRANSACTIONS = `NO_RPC(${txResult.err ?? 'unknown'})`;
}

// Commit progress últimos 5 min en identity_map
const COMMIT_PROGRESS_LAST_5MIN = recentMapErr ? 'ERROR' : (recentMapCount ?? 0);

// ════════════════════════════════════════════════════════════════════════════
// 4. SOURCE_OFFSET_CHANGE y ROWS_PROCESSED — snapshot T0 vs live_metrics
// ════════════════════════════════════════════════════════════════════════════
// Si existe live_metrics, comparamos su rows_processed vs el snapshot anterior
let SOURCE_OFFSET_CHANGE_LAST_5_MIN = 'NO_DATA';
let ROWS_PROCESSED_LAST_5_MIN       = 'NO_DATA';
let CURRENT_TASK_BEING_EXECUTED     = 'UNKNOWN';

const { data: liveMetrics, error: metErr } = await sb
  .from('atlas_people_live_metrics')
  .select('*')
  .eq('id', 'current')
  .single();

if (!metErr && liveMetrics) {
  ROWS_PROCESSED_LAST_5_MIN   = liveMetrics.rows_processed_last_5min ?? liveMetrics.rows_processed ?? 'NO_FIELD';
  CURRENT_TASK_BEING_EXECUTED = liveMetrics.current_task ?? liveMetrics.stage ?? CURRENT_FACTORY_STAGE;
  // source_offset_change: si la tabla guarda el offset anterior
  if (liveMetrics.source_offset !== undefined && liveMetrics.source_offset_prev !== undefined) {
    SOURCE_OFFSET_CHANGE_LAST_5_MIN = liveMetrics.source_offset - liveMetrics.source_offset_prev;
  } else if (liveMetrics.source_offset !== undefined) {
    // Tomar como referencia el SOURCE_OFFSET del heartbeat si existe
    if (typeof SOURCE_OFFSET === 'number') {
      SOURCE_OFFSET_CHANGE_LAST_5_MIN = liveMetrics.source_offset - SOURCE_OFFSET;
    } else {
      SOURCE_OFFSET_CHANGE_LAST_5_MIN = 'SNAPSHOT_UNAVAILABLE';
    }
    // Actualizar SOURCE_OFFSET con el valor más fresco
    SOURCE_OFFSET = liveMetrics.source_offset;
  }
}

if (CURRENT_TASK_BEING_EXECUTED === 'UNKNOWN') CURRENT_TASK_BEING_EXECUTED = CURRENT_FACTORY_STAGE;

// ════════════════════════════════════════════════════════════════════════════
// 5. CLASIFICACIÓN ESTRICTA
// ════════════════════════════════════════════════════════════════════════════
const workerDead   = ['DEAD','NO_HEARTBEAT_FILE','HEARTBEAT_CORRUPTED'].includes(WORKER_STATUS);
const workerAlive  = WORKER_STATUS === 'ALIVE';
const workerStale  = WORKER_STATUS === 'STALE';

const physicalGrowing = typeof UNIQUE_PEOPLE_ADDED_LAST_5_MIN === 'number' && UNIQUE_PEOPLE_ADDED_LAST_5_MIN > 0;
const commitRecent    = typeof SECONDS_SINCE_LAST_COMMIT === 'number' && SECONDS_SINCE_LAST_COMMIT < 300;

// DB bloqueada: requiere count > 0 Y duración considerable (>2000ms) Y commit sin avanzar
const dbBlocked = (
  typeof LOCK_WAIT_COUNT === 'number' && LOCK_WAIT_COUNT > 0 &&
  typeof LONGEST_LOCK_WAIT_MS === 'number' && LONGEST_LOCK_WAIT_MS > 2000 &&
  COMMIT_PROGRESS_LAST_5MIN === 0
);

// Source offset congelado (no cambia y no es EOF)
const sourceOffsetFrozen = (
  SOURCE_OFFSET_CHANGE_LAST_5_MIN !== 'SNAPSHOT_UNAVAILABLE' &&
  SOURCE_OFFSET_CHANGE_LAST_5_MIN !== 'NO_DATA' &&
  Number(SOURCE_OFFSET_CHANGE_LAST_5_MIN) === 0 &&
  !SOURCE_EOF_CERTIFIED
);

// Rows procesados pero sin personas nuevas → duplicados dominantes
const rowsIncreasingButNoGrowth = (
  typeof ROWS_PROCESSED_LAST_5_MIN === 'number' && ROWS_PROCESSED_LAST_5_MIN > 0 && !physicalGrowing
);

// Index bloqueado: physical crece pero searchable no
const indexBlocked = (
  physicalGrowing &&
  typeof PHYSICAL_NOT_SEARCHABLE === 'number' &&
  PHYSICAL_NOT_SEARCHABLE > 1000
);

let ATLAS_STATUS;
let ATLAS_STATUS_EVIDENCE;

if (workerDead) {
  ATLAS_STATUS = 'WORKER_DEAD';
  ATLAS_STATUS_EVIDENCE = `WORKER_STATUS=${WORKER_STATUS}, PID=${WORKER_PID}`;
} else if (dbBlocked) {
  ATLAS_STATUS = 'DB_BLOCKED';
  ATLAS_STATUS_EVIDENCE = `LOCK_WAIT_COUNT=${LOCK_WAIT_COUNT}, LONGEST=${LONGEST_LOCK_WAIT_MS}ms, BLOCKING_PID=${BLOCKING_PID}, COMMIT_PROGRESS_5MIN=0`;
} else if (SOURCE_EOF_CERTIFIED) {
  ATLAS_STATUS = 'SOURCE_EXHAUSTED';
  ATLAS_STATUS_EVIDENCE = `SOURCE_OFFSET=${SOURCE_OFFSET} >= SOURCE_TOTAL_ROWS=${SOURCE_TOTAL_ROWS} OR EOF=true`;
} else if (physicalGrowing && commitRecent) {
  ATLAS_STATUS = indexBlocked ? 'INDEX_BLOCKED' : 'RUNNING_AND_GROWING';
  ATLAS_STATUS_EVIDENCE = `PHYSICAL_DELTA_5MIN=${UNIQUE_PEOPLE_ADDED_LAST_5_MIN}, SECONDS_SINCE_COMMIT=${SECONDS_SINCE_LAST_COMMIT}`;
} else if (rowsIncreasingButNoGrowth && !sourceOffsetFrozen) {
  ATLAS_STATUS = 'RUNNING_DUPLICATE_DOMINANT';
  ATLAS_STATUS_EVIDENCE = `ROWS_PROCESSED=${ROWS_PROCESSED_LAST_5_MIN}, PHYSICAL_DELTA=0, SOURCE_OFFSET_CHANGE=${SOURCE_OFFSET_CHANGE_LAST_5_MIN}`;
} else if (workerAlive && sourceOffsetFrozen && !physicalGrowing) {
  ATLAS_STATUS = 'SOURCE_BLOCKED';
  ATLAS_STATUS_EVIDENCE = `WORKER=ALIVE, SOURCE_OFFSET_CHANGE=0, NO_EOF, PHYSICAL_DELTA=0`;
} else if (workerStale) {
  ATLAS_STATUS = 'SOURCE_BLOCKED';
  ATLAS_STATUS_EVIDENCE = `WORKER_STALE (heartbeat ${HEARTBEAT_AGE_SECONDS}s ago > 90s)`;
} else {
  ATLAS_STATUS = 'UNKNOWN';
  ATLAS_STATUS_EVIDENCE = `Evidencia insuficiente para clasificar. workerAlive=${workerAlive}, growing=${physicalGrowing}, commitRecent=${commitRecent}, sourceOffset=${SOURCE_OFFSET_CHANGE_LAST_5_MIN}`;
}

const ANTIGRAVITY_TASK_BLOCKED = workerDead || workerStale || dbBlocked || ATLAS_STATUS === 'SOURCE_BLOCKED';

// ════════════════════════════════════════════════════════════════════════════
// 6. OUTPUT
// ════════════════════════════════════════════════════════════════════════════
const SEP = '═'.repeat(62);
const sep = '─'.repeat(62);

function row(label, value, note = '') {
  const v = value === null || value === undefined ? 'NULL' : String(value);
  const n = note ? `  // ${note}` : '';
  console.log(`  ${label.padEnd(42)} = ${v}${n}`);
}

console.log(`\n${SEP}`);
console.log(`  DIAGNÓSTICO INMEDIATO ATLAS v2 — ${T0_ISO}`);
console.log(`${SEP}\n`);

console.log(`  ${sep}`);
console.log(`  CONTEO FÍSICO (SSOT = atlas_person_identity_map)`);
console.log(`  ${sep}`);
row('CURRENT_PHYSICAL_PEOPLE',       PHYSICAL_COUNT_T0,  `via ${countMethod}`);
row('SEARCHABLE_COUNT',              SEARCHABLE_COUNT,   'atlas_argentina_people_search_projection_v1');
row('PHYSICAL_NOT_SEARCHABLE',       PHYSICAL_NOT_SEARCHABLE);
row('PHYSICAL_COUNT_T0',             PHYSICAL_COUNT_T0,  'snapshot al inicio de este diagnóstico');
row('PHYSICAL_COUNT_T1',             '(requiere 2ª ejecución en 5min)');
row('PHYSICAL_DELTA_5MIN',           typeof UNIQUE_PEOPLE_ADDED_LAST_5_MIN === 'number' ? UNIQUE_PEOPLE_ADDED_LAST_5_MIN : 'ERROR', 'filas nuevas en identity_map últimos 5min');
row('UNIQUE_PEOPLE_ADDED_LAST_5_MIN',UNIQUE_PEOPLE_ADDED_LAST_5_MIN);

console.log(`\n  ${sep}`);
console.log(`  WORKER`);
console.log(`  ${sep}`);
row('WORKER_STATUS',             WORKER_STATUS);
row('WORKER_PID',                WORKER_PID);
row('HEARTBEAT_AGE_SECONDS',     HEARTBEAT_AGE_SECONDS);
row('CURRENT_FACTORY_STAGE',     CURRENT_FACTORY_STAGE, 'prioriza hb.stage > hb.current_stage > runtime_status');
row('CURRENT_TASK_BEING_EXECUTED',CURRENT_TASK_BEING_EXECUTED);
row('LAST_SUCCESSFUL_BATCH_ID',  LAST_SUCCESSFUL_BATCH_ID);
row('LAST_SUCCESSFUL_BATCH_AT',  LAST_SUCCESSFUL_BATCH_AT);
row('LAST_WORKER_ERROR',         LAST_WORKER_ERROR.slice(0, 120));

console.log(`\n  ${sep}`);
console.log(`  VELOCIDAD DE PROCESAMIENTO (últimos 5 min)`);
console.log(`  ${sep}`);
row('ROWS_PROCESSED_LAST_5_MIN',        ROWS_PROCESSED_LAST_5_MIN);
row('SOURCE_OFFSET',                    SOURCE_OFFSET);
row('SOURCE_OFFSET_CHANGE_LAST_5_MIN',  SOURCE_OFFSET_CHANGE_LAST_5_MIN);
row('SOURCE_TOTAL_ROWS',                SOURCE_TOTAL_ROWS);
row('SOURCE_ROWS_REMAINING',            SOURCE_ROWS_REMAINING);
row('SOURCE_EOF',                       SOURCE_EOF_CERTIFIED, 'solo TRUE si offset>=total o EOF real');

console.log(`\n  ${sep}`);
console.log(`  COMMITS`);
console.log(`  ${sep}`);
row('LAST_SUCCESSFUL_COMMIT_AT',   LAST_SUCCESSFUL_COMMIT_AT);
row('SECONDS_SINCE_LAST_COMMIT',   SECONDS_SINCE_LAST_COMMIT);
row('COMMIT_QUEUE_DEPTH',          COMMIT_QUEUE_DEPTH);
row('INDEX_QUEUE_DEPTH',           INDEX_QUEUE_DEPTH);
row('COMMIT_PROGRESS_LAST_5MIN',   COMMIT_PROGRESS_LAST_5MIN, 'filas nuevas confirmadas en identity_map');

console.log(`\n  ${sep}`);
console.log(`  DB — LOCKS DETALLADOS`);
console.log(`  ${sep}`);
row('LOCK_WAIT_COUNT',       LOCK_WAIT_COUNT);
row('LONGEST_LOCK_WAIT_MS',  LONGEST_LOCK_WAIT_MS);
row('BLOCKING_PID',          BLOCKING_PID);
row('BLOCKED_PID',           BLOCKED_PID);
row('BLOCKED_QUERY',         String(BLOCKED_QUERY).slice(0, 120));
row('DB_ACTIVE_TRANSACTIONS',DB_ACTIVE_TRANSACTIONS);

console.log(`\n${SEP}`);
console.log(`  CLASIFICACIÓN FINAL`);
console.log(`${SEP}`);
row('ATLAS_STATUS',             ATLAS_STATUS);
console.log(`  EVIDENCIA                                = ${ATLAS_STATUS_EVIDENCE}`);
row('ANTIGRAVITY_TASK_BLOCKED', `${ANTIGRAVITY_TASK_BLOCKED}  ${ANTIGRAVITY_TASK_BLOCKED ? '⚠️  BLOQUEADO' : '✅ OK'}`);
console.log(`\n  ${sep}`);
console.log(`  STALL ASSESSMENT`);
console.log(`  ${sep}`);
const stall_real       = ATLAS_STATUS === 'WORKER_DEAD' || ATLAS_STATUS === 'DB_BLOCKED';
const stall_duplicates = ATLAS_STATUS === 'RUNNING_DUPLICATE_DOMINANT';
const stall_db         = ATLAS_STATUS === 'DB_BLOCKED';
const stall_exhausted  = ATLAS_STATUS === 'SOURCE_EXHAUSTED';
const stall_false_pos  = ATLAS_STATUS === 'RUNNING_AND_GROWING';
console.log(`  A) STALL REAL              = ${stall_real}`);
console.log(`  B) PROCESANDO DUPLICADOS   = ${stall_duplicates}`);
console.log(`  C) DB BLOQUEADA            = ${stall_db}`);
console.log(`  D) FUENTE AGOTADA          = ${stall_exhausted}`);
console.log(`  E) FALSO POSITIVO DETECTOR = ${stall_false_pos}`);

if (LAST_LOG_LINES.length > 0) {
  console.log(`\n  ${sep}`);
  console.log(`  ÚLTIMAS ${LAST_LOG_LINES.length} LÍNEAS — worker_stdout.log`);
  console.log(`  ${sep}`);
  LAST_LOG_LINES.forEach(l => console.log(`    ${l}`));
}
if (LAST_ERR_LINES.length > 0) {
  console.log(`\n  ${sep}`);
  console.log(`  ÚLTIMAS ${LAST_ERR_LINES.length} LÍNEAS — worker_stderr.log`);
  console.log(`  ${sep}`);
  LAST_ERR_LINES.forEach(l => console.log(`    ${l}`));
}

console.log(`\n${SEP}\n`);
