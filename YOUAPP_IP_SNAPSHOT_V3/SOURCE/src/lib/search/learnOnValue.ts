/**
 * learnOnValue.ts - Fase v3.4: Learn on Value (Organic Empirical Learning)
 *
 * Pipeline:
 *   DISCOVERED -> SHOWN -> CLICKED -> WATCH_STARTED -> ENGAGED -> COMPLETED -> VALUED
 */

import { supabase } from '../supabase';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface ValueSignal {
  attributionId?: string; // ID opaco para rastrear la sesión de búsqueda

  event:
    | "clicked"
    | "watch_started"
    | "engaged"
    | "completed"
    | "saved"
    | "value";

  watchTimeMs?: number;
  progressPct?: number;
  valueResponse?: "yes" | "no";

  // Retained for Atlas / Learn on Value (Home context)
  contentId: string;
  sessionId?: string;
  queryNormalized?: string;
  watchContext?: 'search' | 'home' | 'signal' | 'director' | 'you4';
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Registrar una señal de valor para un contenido.
 * Se llama desde el player (múltiples veces durante la reproducción).
 * Best-effort: nunca bloquea la experiencia del usuario.
 */
export async function recordValueSignal(signal: ValueSignal): Promise<void> {
  if (!signal.contentId) return;

  const sessionId = signal.sessionId || localStorage.getItem('youapp_session_id') || 'anon';
  const now = new Date().toISOString();

  // 1. Search Attribution (Dynamic Router Empirical Learning)
  if (signal.attributionId) {
    const attrUpdates: any = { updated_at: now };
    
    if (signal.event === 'clicked') attrUpdates.clicked_at = now;
    if (signal.event === 'watch_started') attrUpdates.watch_started_at = now;
    if (signal.event === 'engaged') attrUpdates.engaged_at = now;
    if (signal.event === 'completed') attrUpdates.completed_at = now;
    if (signal.event === 'saved') attrUpdates.saved_at = now;
    
    if (signal.event === 'value' && signal.valueResponse) {
      attrUpdates.value_responded_at = now;
      attrUpdates.value_response = signal.valueResponse;
      // also set legacy value_yes for compatibility if needed
      attrUpdates.value_yes = signal.valueResponse === 'yes';
    }

    if (signal.watchTimeMs !== undefined) attrUpdates.watch_time_ms = signal.watchTimeMs;
    if (signal.progressPct !== undefined) attrUpdates.max_progress_pct = signal.progressPct;

    // We do an update on the attribution row
    const { error: attrErr } = await supabase.from('search_result_attribution').update(attrUpdates).eq('id', signal.attributionId);
    if (attrErr && import.meta.env?.DEV) console.error('[Telemetry] Failed to update attribution:', attrErr);
  }

  // 2. Atlas Content Values (Personalization / Recommendation)
  const { data: existing } = await supabase
    .from('content_values')
    .select('id, played_pct, engaged, completed, saved, created_moment, valued')
    .eq('content_id', signal.contentId)
    .eq('session_id', sessionId)
    .maybeSingle();

  const played = ['watch_started', 'engaged', 'completed'].includes(signal.event);
  const engaged = signal.event === 'engaged' || signal.event === 'completed';
  const completed = signal.event === 'completed';
  const saved = signal.event === 'saved';
  const valued = signal.event === 'value' && signal.valueResponse === 'yes';

  if (existing) {
    const { error: updateErr } = await supabase.from('content_values').update({
      played: existing.played || played,
      played_pct: Math.max(existing.played_pct || 0, signal.progressPct || 0),
      engaged: existing.engaged || engaged,
      completed: existing.completed || completed,
      saved: existing.saved || saved,
      valued: existing.valued || valued,
      watch_duration_s: signal.watchTimeMs ? Math.round(signal.watchTimeMs / 1000) : undefined,
    }).eq('id', existing.id);
    if (updateErr && import.meta.env?.DEV) console.error('[Telemetry] Failed to update value record', updateErr);
  } else if (played || saved || valued) {
    const { error: insertErr } = await supabase.from('content_values').insert({
      content_id: signal.contentId,
      session_id: sessionId,
      query_normalized: signal.queryNormalized,
      watch_context: signal.watchContext || 'search',
      played,
      played_pct: signal.progressPct || 0,
      engaged,
      completed,
      saved,
      valued,
      watch_duration_s: signal.watchTimeMs ? Math.round(signal.watchTimeMs / 1000) : undefined,
    });
    if (insertErr && import.meta.env?.DEV) console.error('[Telemetry] Failed to insert value record', insertErr);
  }
}

/**
 * Marcar un contenido como "Valió tu tiempo".
 * Es la señal de mayor peso en Learn on Value.
 */
export async function markAsValued(
  contentId: string,
  context?: { sessionId?: string; queryNormalized?: string; attributionId?: string; response?: 'yes'|'no' }
): Promise<void> {
  await recordValueSignal({
    contentId,
    sessionId: context?.sessionId,
    queryNormalized: context?.queryNormalized,
    attributionId: context?.attributionId,
    event: 'value',
    valueResponse: context?.response || 'yes'
  });
}

/**
 * Hook React para señales de valor del player.
 * Se integra con el componente VideoPlayer.
 */
export function createValueTracker(
  contentId: string,
  totalDurationMs: number,
  context?: { queryNormalized?: string; watchContext?: ValueSignal['watchContext']; attributionId?: string }
) {
  let startTime = Date.now();
  let reportedEngaged = false;
  let reportedCompleted = false;

  const sessionId = localStorage.getItem('youapp_session_id') || 'anon';
  const base = { contentId, sessionId, ...context };

  return {
    onPlay: () => {
      startTime = Date.now();
      recordValueSignal({ ...base, event: 'watch_started', progressPct: 0 }).catch(() => {});
    },

    onProgress: (currentMs: number) => {
      if (!totalDurationMs) return;
      const pct = Math.round((currentMs / totalDurationMs) * 100);
      const watchTimeMs = Date.now() - startTime;

      // ENGAGED >= 30 seconds OR >= 10%
      const isEngaged = watchTimeMs >= 30000 || pct >= 10;
      if (isEngaged && !reportedEngaged) {
        reportedEngaged = true;
        recordValueSignal({ ...base, event: 'engaged', progressPct: pct, watchTimeMs }).catch(() => {});
      }

      // COMPLETED >= 90%
      if (pct >= 90 && !reportedCompleted) {
        reportedCompleted = true;
        recordValueSignal({ ...base, event: 'completed', progressPct: pct, watchTimeMs }).catch(() => {});
      }
    },

    onEnded: () => {
      const watchTimeMs = Date.now() - startTime;
      if (!reportedCompleted) {
        reportedCompleted = true;
        recordValueSignal({ ...base, event: 'completed', progressPct: 100, watchTimeMs }).catch(() => {});
      }
    },

    onSaved: () => {
      recordValueSignal({ ...base, event: 'saved' }).catch(() => {});
    },

    onValued: (response: 'yes' | 'no') => {
      markAsValued(contentId, { ...context, response }).catch(() => {});
    }
  };
}
