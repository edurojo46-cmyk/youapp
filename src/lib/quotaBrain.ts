/**
 * quotaBrain.ts
 *
 * El único módulo autorizado a aprobar llamadas a search.list (YouTube Search API).
 *
 * REGLA FUNDAMENTAL:
 * Ningún componente de YouApp puede llamar search.list directamente.
 * Todo pasa por quotaBrain.requestSearch() — que registra, evalúa y decide.
 *
 * Fase 0: Solo logging + autorización basada en presupuesto simple.
 * Fase 4: Se agrega Opportunity Score completo.
 */

import { supabase } from './supabase';

// ── Configuración ──────────────────────────────────────────────────────────
const INTERNAL_BUDGET = 80;      // Presupuesto diario de YouApp (< 100 de Google)
const EMERGENCY_RESERVE = 20;    // Reserva nunca tocar (admin, bugs, concurrencia)
const EFFECTIVE_BUDGET = INTERNAL_BUDGET - EMERGENCY_RESERVE; // = 60 disponibles para uso normal

export type SearchCaller =
  | 'SeedManager'
  | 'SearchEngine'
  | 'RssWatcher'
  | 'AtlasEnricher'
  | 'Admin'
  | 'Unknown';

export type SearchReason =
  | 'user_search'
  | 'channel_resolve'
  | 'channel_name_resolve'
  | 'auto_discover'
  | 'admin_manual'
  | 'other';

export interface SearchRequest {
  query: string;
  caller: SearchCaller;
  reason: SearchReason;
  atlasCoverage?: number;    // 0-100: % de candidatos que ya vienen de Atlas
  freshnessNeed?: number;    // 0-100: 100 = breaking news, 0 = atemporal
  demand?: number;           // 0-100: popularidad de la query
  reuseProbability?: number; // 0-100: probabilidad de que este resultado sirva para queries futuras
  context?: string;          // info adicional para logs
}

export interface SearchPermission {
  authorized: boolean;
  requestId: string;
  reason?: string;          // si authorized=false: por qué fue rechazado
  budgetRemaining: number;
  opportunityScore?: number;
}

// ── Radar Recency Guard (Ahorro de Cuota / Cooldown Inteligente) ───────────
const RADAR_CACHE_KEY = 'youapp_radar_recent_searches';
const COOLDOWN_HOURS_GENERAL = 6;
const COOLDOWN_HOURS_FRESH = 1;

export function normalizeCanonicalKey(query: string): string {
  return query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ')   // remove symbols
    .replace(/\s+/g, ' ')
    .trim();
}

export function getRadarQueryCooldownInfo(query: string, freshnessNeed?: number, atlasCandidateCount?: number): { inCooldown: boolean; ageMinutes: number } {
  try {
    const raw = localStorage.getItem(RADAR_CACHE_KEY);
    if (!raw) return { inCooldown: false, ageMinutes: 0 };
    const history: Record<string, number> = JSON.parse(raw);
    const cKey = normalizeCanonicalKey(query);
    const lastTimestamp = history[cKey];
    if (!lastTimestamp) return { inCooldown: false, ageMinutes: 0 };

    const cooldownMs = (freshnessNeed && freshnessNeed > 70)
      ? COOLDOWN_HOURS_FRESH * 3600 * 1000
      : COOLDOWN_HOURS_GENERAL * 3600 * 1000;

    const elapsed = Date.now() - lastTimestamp;
    const ageMinutes = Math.round(elapsed / (60 * 1000));

    // Solo denegar si efectivamente tenemos conocimiento previo en Atlas o cobertura > 0
    const hasKnowledge = typeof atlasCandidateCount === 'number' ? atlasCandidateCount > 0 : true;

    return {
      inCooldown: elapsed < cooldownMs && hasKnowledge,
      ageMinutes
    };
  } catch {
    return { inCooldown: false, ageMinutes: 0 };
  }
}

export function recordRadarQueryExecution(query: string) {
  try {
    const cKey = normalizeCanonicalKey(query);
    const raw = localStorage.getItem(RADAR_CACHE_KEY);
    const history: Record<string, number> = raw ? JSON.parse(raw) : {};
    history[cKey] = Date.now();
    localStorage.setItem(RADAR_CACHE_KEY, JSON.stringify(history));
  } catch {}
}

// ── Función principal: pedir permiso para buscar ───────────────────────────
export async function requestSearch(params: SearchRequest): Promise<SearchPermission> {
  const requestId = crypto.randomUUID();

  let budgetRemaining = EFFECTIVE_BUDGET;
  let authorized = false;
  let denialReason: string | undefined;
  let opportunityScore: number | undefined;

  try {
    // 0. RADAR RECENCY GUARD: Evitar quemar cuota en queries ya consultadas recientemente SI Atlas tiene cobertura
    const cooldownInfo = getRadarQueryCooldownInfo(params.query, params.freshnessNeed, params.atlasCoverage);
    if (params.caller === 'SearchEngine' && cooldownInfo.inCooldown) {
      if (import.meta.env.DEV) {
        console.log(`🛡️ [QuotaBrain] Radar Recency Guard activo para "${params.query}" (ejecutado hace ${cooldownInfo.ageMinutes} min). Cuota evitada (servir desde Atlas).`);
      }
      authorized = false;
      denialReason = `radar_recency_cooldown (consultado hace ${cooldownInfo.ageMinutes}m, servir desde Atlas)`;
      return {
        authorized: false,
        requestId,
        reason: denialReason,
        budgetRemaining: await getBudgetRemaining()
      };
    }

    // En desarrollo siempre damos presupuesto para no bloquear pruebas E2E, EXCEPTO en SMOKE_LIVE
    if (import.meta.env.DEV && import.meta.env.VITE_SMOKE_LIVE !== 'true') {
      budgetRemaining = 1000;
    } else {
      budgetRemaining = await getBudgetRemaining();
    }

    // 2. Verificar si hay presupuesto disponible
    if (budgetRemaining <= 0) {
      authorized = false;
      denialReason = 'daily_budget_exhausted';
    } else {
      // Fase 0: autorización simple basada en presupuesto
      // Fase 4 ampliará esto con Opportunity Score completo
      opportunityScore = calculateSimpleOpportunity({
        atlasCoverage: params.atlasCoverage,
        freshnessNeed: params.freshnessNeed,
        budgetRemaining,
      });

      // Umbral dinámico: más estricto cuando queda poco presupuesto
      const threshold = budgetRemaining > 30 ? 20 : budgetRemaining > 10 ? 50 : 80;
      authorized = opportunityScore >= threshold;

      if (!authorized) {
        denialReason = `opportunity_score_too_low (${opportunityScore} < ${threshold})`;
      }
    }
  } catch (err) {
    // Si QuotaBrain falla, denegamos por seguridad (fail-safe)
    console.error('[QuotaBrain] Error evaluating request:', err);
    authorized = false;
    denialReason = 'quota_brain_error';
  }

  // 3. Registrar el evento (siempre, autorizado o no)
  await logSearchAttempt({
    requestId,
    query: params.query,
    caller: params.caller,
    reason: params.reason,
    authorized,
    authorizedBy: authorized ? 'quota_brain' : undefined,
    denialReason,
    atlasCoverage: params.atlasCoverage,
    opportunityScore,
    budgetRemaining,
  });

  // 4. Decrementar presupuesto si fue autorizado
  if (authorized) {
    await decrementBudget();
  }

  return {
    authorized,
    requestId,
    reason: denialReason,
    budgetRemaining: authorized ? budgetRemaining - 1 : budgetRemaining,
    opportunityScore,
  };
}

// ── Registrar búsqueda evitada (Atlas resolvió sin Radar) ─────────────────
export async function logSearchAvoided(params: {
  query: string;
  caller: SearchCaller;
  candidateCount: number;
}) {
  try {
    // Incrementar contador de búsquedas evitadas
    await supabase.rpc('quota_increment', { p_column: 'searches_avoided' });

    if (import.meta.env.DEV) {
      console.log(`[QuotaBrain] ✅ Search avoided for "${params.query}" — Atlas had ${params.candidateCount} candidates`);
    }
  } catch (err) {
    // No-op: el logging de evitadas es best-effort
    if (import.meta.env.DEV) console.warn('[QuotaBrain] Could not log avoided search:', err);
  }
}

// ── Registrar resultado de búsqueda (después de ejecutar) ─────────────────
export async function reportSearchResult(requestId: string, params: {
  resultsReceived: number;
  latencyMs?: number;
  query?: string;
}) {
  try {
    if (params.query) {
      recordRadarQueryExecution(params.query);
    }
    await supabase
      .from('quota_events')
      .update({
        results_received: params.resultsReceived,
        latency_ms: params.latencyMs,
      })
      .eq('request_id', requestId);
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[QuotaBrain] Could not update search result:', err);
  }
}

// ── Consultar presupuesto restante ────────────────────────────────────────
export async function getBudgetRemaining(): Promise<number> {
  if (import.meta.env.DEV && import.meta.env.VITE_SMOKE_LIVE !== 'true') return 1000;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('youtube_quota_daily')
      .select('used, daily_limit')
      .eq('date', today)
      .eq('bucket', 'organic') // Asumimos organic por defecto para client-side
      .maybeSingle();

    if (!data) return EFFECTIVE_BUDGET;
    return Math.max(0, (data.daily_limit || INTERNAL_BUDGET) - (data.used || 0));
  } catch {
    return EFFECTIVE_BUDGET; // optimista si no podemos consultar
  }
}

// ── Obtener resumen del día ───────────────────────────────────────────────
export async function getDailySummary() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('youtube_quota_daily')
    .select('*')
    .eq('date', today);

  if (!data || data.length === 0) {
    return {
      date: today,
      searches_used: 0,
      searches_denied: 0,
      searches_avoided: 0,
      internal_budget: INTERNAL_BUDGET,
      google_limit: 100,
    };
  }

  // Sum all buckets for a total picture
  const totalUsed = data.reduce((acc, row) => acc + (row.used || 0), 0);
  const totalLimit = data.reduce((acc, row) => acc + (row.daily_limit || 0), 0);

  return {
    date: today,
    searches_used: totalUsed,
    searches_denied: 0, // deprecado client-side, ver quota_events
    searches_avoided: 0, // deprecado client-side
    internal_budget: totalLimit,
    google_limit: 100,
  };
}

// ── Obtener eventos recientes ─────────────────────────────────────────────
export async function getRecentEvents(limit = 50) {
  const { data } = await supabase
    .from('quota_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ── Internals ─────────────────────────────────────────────────────────────

async function logSearchAttempt(params: {
  requestId: string;
  query: string;
  caller: string;
  reason: string;
  authorized: boolean;
  authorizedBy?: string;
  denialReason?: string;
  atlasCoverage?: number;
  opportunityScore?: number;
  budgetRemaining: number;
}) {
  try {
    await supabase.from('quota_events').insert({
      request_id: params.requestId,
      query: params.query,
      caller: params.caller,
      reason: params.reason,
      authorized: params.authorized,
      authorized_by: params.authorizedBy,
      denial_reason: params.denialReason,
      atlas_coverage: params.atlasCoverage,
      opportunity_score: params.opportunityScore,
      budget_remaining: params.budgetRemaining,
    });

    // El resumen diario ya no se incrementa acá manualmente para 'searches_used'
    // porque la Edge Function lo hace atómicamente en youtube_quota_daily mediante reserve_youtube_search.
    // Solo registramos el intento en quota_events.

    if (import.meta.env.DEV) {
      const emoji = params.authorized ? '🔭' : '🚫';
      console.log(`[QuotaBrain] ${emoji} "${params.query}" | caller: ${params.caller} | authorized: ${params.authorized} | budget left: ${params.budgetRemaining}`);
    }
  } catch (err) {
    // Logging es best-effort: nunca bloquear la experiencia del usuario
    if (import.meta.env.DEV) console.warn('[QuotaBrain] Could not log event:', err);
  }
}

async function decrementBudget() {
  // El decremento real se hace via quota_increment('searches_used') en logSearchAttempt
  // Esta función existe para futura lógica de rate-limiting en tiempo real
}

// Fórmula definitiva v3.0 — idéntica a la del server (external-search)
function calculateSimpleOpportunity(params: {
  atlasCoverage?: number;
  freshnessNeed?: number;
  demand?: number;
  reuseProbability?: number;
  budgetRemaining: number;
}): number {
  const atlasCoverage    = params.atlasCoverage    ?? 100;
  const freshnessNeed    = params.freshnessNeed    ?? 30;
  const demand           = params.demand           ?? 50;
  const reuseProbability = params.reuseProbability ?? 50;

  return Math.round(
    (freshnessNeed          * 0.30) +
    (demand                 * 0.25) +
    ((100 - atlasCoverage)  * 0.25) +
    (reuseProbability       * 0.20)
  );
}
