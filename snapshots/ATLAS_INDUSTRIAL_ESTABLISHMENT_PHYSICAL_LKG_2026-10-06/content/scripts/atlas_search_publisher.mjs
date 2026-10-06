/**
 * atlas_search_publisher.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Search Publication Consumer — proceso Node.js independiente.
 * Lee atlas_search_outbox y publica en atlas_people_discovery_candidates.
 *
 * Garantías:
 *   LOST_SEARCH_PUBLICATIONS = 0   (QUARANTINED, nunca DROPPED)
 *   SEARCH_PUBLISH_IDEMPOTENT = TRUE  (ON CONFLICT DO UPDATE)
 *   STUCK_PROCESSING_ROWS = 0  (lease/reclaim)
 *   MULTI_PUBLISHER_READY = TRUE  (SKIP LOCKED via RPC claim)
 *   DOUBLE_CLAIM = 0
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

// ── Configuración ─────────────────────────────────────────────────────────────
const WORKER_ID              = `pub_${process.pid}_${Date.now()}`;
const REPORTS_DIR            = path.resolve('reports/atlas/realtime');
const PUBLISHER_HB_FILE      = path.join(REPORTS_DIR, 'search_publisher_heartbeat.json');
const PUBLISHER_LOCK_FILE    = path.join(REPORTS_DIR, 'search_publisher.lock');
const PUBLISHER_STATE_FILE   = path.join(REPORTS_DIR, 'search_publisher_state.json');
const PUBLISHER_CONTROL_FILE = path.join(REPORTS_DIR, 'publisher_control.json');

// Tunables
const BATCH_SIZE             = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 100;
const PROCESSING_LEASE_SEC   = 120;      // Segundos antes de reclamar un PROCESSING stale
const MAX_ATTEMPTS_BEFORE_QUARANTINE = 20;
const QUARANTINE_RETRY_INTERVAL_SEC  = 3600;   // 1h entre reintentos de QUARANTINED
const MAIN_LOOP_SLEEP_MS     = 200;     // Pausa rápida entre ciclos cuando hay trabajo
const IDLE_SLEEP_MS          = 3000;    // Pausa cuando outbox está vacío
const QUARANTINE_CHECK_EVERY = 30;      // ciclos entre checks de quarantine
const BACKPRESSURE_THRESHOLD = 50_000;  // OUTBOX_DEPTH máximo antes de ralentizar ingesta

function readPublisherControl() {
  try {
    if (fs.existsSync(PUBLISHER_CONTROL_FILE)) {
      return JSON.parse(fs.readFileSync(PUBLISHER_CONTROL_FILE, 'utf8'));
    }
  } catch {}
  return { paused: false, throttle_sleep_ms: MAIN_LOOP_SLEEP_MS, batch_size: BATCH_SIZE };
}

fs.mkdirSync(REPORTS_DIR, { recursive: true });

// ── Singleton lock ────────────────────────────────────────────────────────────
function acquireLock() {
  if (fs.existsSync(PUBLISHER_LOCK_FILE)) {
    try {
      const lock = JSON.parse(fs.readFileSync(PUBLISHER_LOCK_FILE, 'utf-8'));
      if (lock.pid) {
        try { process.kill(lock.pid, 0); console.error(`[Publisher] Another publisher running (PID ${lock.pid}). Exiting.`); process.exit(0); } catch {}
      }
    } catch {}
  }
  fs.writeFileSync(PUBLISHER_LOCK_FILE, JSON.stringify({ pid: process.pid, worker_id: WORKER_ID, acquired_at: new Date().toISOString() }), 'utf-8');
}
function releaseLock() {
  try {
    if (fs.existsSync(PUBLISHER_LOCK_FILE)) {
      const lock = JSON.parse(fs.readFileSync(PUBLISHER_LOCK_FILE, 'utf-8'));
      if (lock.pid === process.pid) fs.unlinkSync(PUBLISHER_LOCK_FILE);
    }
  } catch {}
}
acquireLock();
process.on('exit', releaseLock);
process.on('SIGINT',  () => { releaseLock(); process.exit(0); });
process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

// ── Métricas en memoria ───────────────────────────────────────────────────────
const metrics = {
  published_total: 0,
  retry_total: 0,
  quarantined_total: 0,
  recovered_from_processing: 0,
  quarantine_recovered_total: 0,
  cycles: 0,
  errors: 0,
  current_chunk_size: BATCH_SIZE,
  rows_per_sec: 0,
  outbox_depth: 0,
  outbox_oldest_age_sec: 0,
  started_at: new Date().toISOString(),
  last_publish_at: null,
};
let sessionPublished = 0;
let sessionStartMs   = Date.now();
const latencies = []; // commit→searchable latencies

// ── Heartbeat ─────────────────────────────────────────────────────────────────
function writeHeartbeat() {
  const uptime = Math.floor((Date.now() - sessionStartMs) / 1000);
  const hb = {
    pid:         process.pid,
    worker_id:   WORKER_ID,
    timestamp:   new Date().toISOString(),
    uptime_sec:  uptime,
    runtime_status: 'RUNNING',
    ...metrics,
    // Latency percentiles
    p50_ms: percentile(latencies, 0.50),
    p95_ms: percentile(latencies, 0.95),
    p99_ms: percentile(latencies, 0.99),
  };
  fs.writeFileSync(PUBLISHER_HB_FILE, JSON.stringify(hb, null, 2), 'utf-8');
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a,b) => a-b);
  return sorted[Math.floor(sorted.length * p)] ?? 0;
}
setInterval(writeHeartbeat, 8000);

// (Obsoleta en V2, eliminada)

// ── Reclamar PROCESSING stale (lease expirado) ────────────────────────────────
async function reclaimStaleProcessing() {
  const leaseExpiry = new Date(Date.now() - PROCESSING_LEASE_SEC * 1000).toISOString();
  const { data: stale, error } = await sb
    .from('atlas_search_outbox_v2')
    .select('outbox_id, processing_worker_id')
    .eq('status', 'PROCESSING')
    .lt('processing_started_at', leaseExpiry);

  if (error || !stale?.length) return 0;

  const ids = stale.map(r => r.outbox_id);
  let reclaimedCount = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { error: updErr } = await sb
      .from('atlas_search_outbox_v2')
      .update({
        status:        'RETRY',
        next_retry_at:  new Date().toISOString(),
        last_error:    `LEASE_EXPIRED: worker did not complete in ${PROCESSING_LEASE_SEC}s`,
      })
      .in('outbox_id', chunk)
      .eq('status', 'PROCESSING');
    if (!updErr) reclaimedCount += chunk.length;
  }

  if (reclaimedCount > 0) {
    console.log(`[Lease Reclaim] Recovered ${reclaimedCount} stale PROCESSING rows → RETRY (V2)`);
    metrics.recovered_from_processing += reclaimedCount;
  }
  return reclaimedCount;
}

// ── Publicar un lote a discovery_candidates (Single-RPC V2) ───────────────────
async function publishRowsV2(batchSize) {
  const results = {
    claimed: 0,
    published: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    quarantined: 0,
    failed: 0,
    errors: [],
    timings: null
  };
  
  try {
    const { data, error } = await sb.rpc('process_search_outbox_batch', {
      p_limit: batchSize,
      p_worker_id: WORKER_ID
    });

    if (error) {
      results.failed += batchSize;
      results.errors.push({ error: error.message });
      return results;
    }

    if (data && data.ok) {
      results.published += data.total_published || 0;
      results.quarantined += data.total_quarantined || 0;
      results.inserted += data.total_inserted || 0;
      results.updated += data.total_updated || 0;
      results.unchanged += data.total_unchanged || 0;
      if (data.timings) results.timings = data.timings;
    } else if (data && !data.ok) {
      results.failed += batchSize;
      results.errors.push({ error: data.error || 'RPC execution failed' });
    }
  } catch (e) {
    results.failed += batchSize;
    results.errors.push({ error: String(e) });
  }

  return results;
}

// ── Métricas del outbox ────────────────────────────────────────────────────────
async function updateOutboxMetrics() {
  try {
    // Only query Postgres for depth every 100 cycles to minimize DB load
    if (metrics.cycles % 100 === 0) {
      const { count: pending } = await sb
        .from('atlas_search_outbox_v2')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      if (pending !== null && pending !== undefined) {
        metrics.outbox_depth = pending;
      }
    }

    // Publicar métricas en live_metrics de forma ágil
    await sb.from('atlas_people_live_metrics').update({
      search_outbox_depth:        metrics.outbox_depth,
      search_publish_rows_sec:    metrics.rows_per_sec,
      search_publish_quarantined: metrics.quarantined_total,
      updated_at: new Date().toISOString(),
    }).eq('id', 'current');
  } catch {}
}

// ── Reconciliar QUARANTINED ───────────────────────────────────────────────────
async function reconcileQuarantined() {
  const { data: q, error } = await sb
    .from('atlas_search_outbox_v2')
    .select('outbox_id, attempt_count')
    .eq('status', 'QUARANTINED')
    .lte('next_retry_at', new Date().toISOString())
    .limit(20); // Baja prioridad: lotes pequeños

  if (error || !q?.length) return;

  console.log(`[Reconciler] Re-queuing ${q.length} QUARANTINED rows → RETRY in V2`);
  const ids = q.map(r => r.outbox_id);
  await sb.from('atlas_search_outbox_v2').update({
    status: 'RETRY',
    next_retry_at: new Date().toISOString(),
    last_error: `QUARANTINE_RECONCILER: re-queued at ${new Date().toISOString()}`,
  }).in('outbox_id', ids);

  metrics.quarantine_recovered_total += ids.length;
}

// ── Loop principal ────────────────────────────────────────────────────────────
let cycle = 0;
const startMs = Date.now();

console.log('═'.repeat(60));
console.log(`  ATLAS SEARCH PUBLISHER — PID ${process.pid}`);
console.log(`  Worker ID: ${WORKER_ID}`);
console.log(`  Batch size: ${BATCH_SIZE} | Lease: ${PROCESSING_LEASE_SEC}s | Quarantine after: ${MAX_ATTEMPTS_BEFORE_QUARANTINE} attempts`);
console.log('═'.repeat(60));

while (true) {
  cycle++;
  metrics.cycles = cycle;

  try {
    const ctrl = readPublisherControl();
    if (ctrl.paused) {
      if (cycle % 5 === 0) console.log(`[Publisher Paused] Control paused=true. Sleeping 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    // ── Reclamar stale PROCESSING (lease recovery) ──────────────────────────
    await reclaimStaleProcessing();

    // ── Reconciliar QUARANTINED periódicamente ──────────────────────────────
    if (cycle % QUARANTINE_CHECK_EVERY === 0) {
      await reconcileQuarantined();
      await updateOutboxMetrics();
    }

    // ── Publicar V2 ────────────────────────────────────────────────────────────
    const effectiveLimit = ctrl.batch_size ? Math.min(ctrl.batch_size, metrics.current_chunk_size) : metrics.current_chunk_size;
    const t0 = performance.now();
    const result = await publishRowsV2(effectiveLimit);
    const dtSec  = (performance.now() - t0) / 1000;

    if (result.published === 0 && result.failed === 0 && result.quarantined === 0) {
      // Outbox vacío — pausa larga
      if (cycle % 5 === 0) {
        console.log(`[Idle] Cycle ${cycle} — outbox empty. Depth: ${metrics.outbox_depth}`);
      }
      await new Promise(r => setTimeout(r, IDLE_SLEEP_MS));
      continue;
    }

    sessionPublished += result.published;
    metrics.published_total += result.published;
    metrics.rows_per_sec     = dtSec > 0 ? Number((result.published / dtSec).toFixed(1)) : 0;
    if (result.published > 0) metrics.last_publish_at = new Date().toISOString();

    // POISON ROW ISOLATION
    if (result.failed > 0 && metrics.current_chunk_size === 1) {
      // Si falló incluso con límite de 1 fila, identificamos cuál es exactamente
      const { data: toxicRows } = await sb
        .from('atlas_search_outbox_v2')
        .select('outbox_id, payload_version')
        .in('status', ['PENDING', 'RETRY'])
        .lte('next_retry_at', new Date().toISOString())
        .order('next_retry_at', { ascending: true })
        .limit(1);

      if (toxicRows && toxicRows.length > 0) {
        const toxic = toxicRows[0];
        const quarantineRes = await sb.rpc('quarantine_exact_search_outbox_row', {
          p_outbox_id: toxic.outbox_id,
          p_payload_version: toxic.payload_version,
          p_error: result.errors[0]?.error || 'Unknown poison row error',
          p_worker_id: WORKER_ID
        });
        
        if (quarantineRes.data?.ok) {
          console.warn(`[POISON ROW] Quarantined toxic outbox row: ${quarantineRes.data.quarantined_id}`);
          metrics.quarantined_total++;
        } else {
          console.error(`[POISON ROW] Failed to quarantine toxic row: ${quarantineRes.error?.message || quarantineRes.data?.error}`);
        }
      } else {
        console.warn(`[POISON ROW] Failed batch=1 but no pending rows found to quarantine.`);
      }
      
      // Después de procesar/cuarentenar, reseteamos el tamaño del chunk
      metrics.current_chunk_size = BATCH_SIZE;
    } else {
      // Ajuste dinámico de chunk size normal
      if (result.failed === 0 && metrics.current_chunk_size < BATCH_SIZE) {
        metrics.current_chunk_size = Math.min(metrics.current_chunk_size * 2, BATCH_SIZE);
      } else if (result.failed > 0 && metrics.current_chunk_size > 1) {
        metrics.current_chunk_size = Math.max(Math.floor(metrics.current_chunk_size / 2), 1);
      }
    }

    if (result.quarantined > 0) {
      metrics.quarantined_total += result.quarantined;
      console.warn(`[POISON ROW] Set-based quarantined: ${result.quarantined} rows in this batch`);
    }

    const uptimeSec = Math.floor((Date.now() - startMs) / 1000);
    let timingStr = '';
    if (result.timings) {
      timingStr = ` | ms(c:${Math.round(result.timings.claim_ms)},vq:${Math.round(result.timings.validate_quarantine_ms)},u:${Math.round(result.timings.search_upsert_ms)},a:${Math.round(result.timings.ack_ms)})`;
    }
    const upStr = `[ins:${result.inserted} upd:${result.updated} unch:${result.unchanged}]`;
    console.log(`[Cycle ${cycle}] Published: ${result.published} ${upStr} | Failed: ${result.failed} | Quar: ${result.quarantined} | rows/s: ${metrics.rows_per_sec} | chunk: ${metrics.current_chunk_size} | total: ${metrics.published_total} | uptime: ${uptimeSec}s${timingStr}`);

    if (result.errors.length > 0) {
      result.errors.slice(0,3).forEach(e => console.warn(`  [Error] ${e.error?.slice(0,100)}`));
    }

    metrics.errors += result.failed;

  } catch (err) {
    console.error(`[Publisher Error] Cycle ${cycle}: ${err.message}`);
    metrics.errors++;
    await new Promise(r => setTimeout(r, 5000));
  }

  const ctrlAfter = readPublisherControl();
  const sleepMs = (ctrlAfter.throttle_sleep_ms !== undefined) ? ctrlAfter.throttle_sleep_ms : MAIN_LOOP_SLEEP_MS;
  await new Promise(r => setTimeout(r, sleepMs));
}
