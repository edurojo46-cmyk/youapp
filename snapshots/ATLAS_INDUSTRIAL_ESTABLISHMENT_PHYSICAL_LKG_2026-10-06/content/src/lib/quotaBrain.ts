/**
 * quotaBrain.ts
 *
 * YOUAPP KNOWLEDGE ECONOMY & RADAR ADMISSION CONTROLLER (V2.0 - 10K SCALE READY)
 *
 * Arquitectura de Producción:
 * 1. SEMANTIC ACQUISITION CLUSTERING: Separa la Request Key (búsqueda exacta)
 *    del Acquisition Cluster (`entity:facet`, ej. `nikola_tesla:biography`).
 * 2. DISTRIBUTED SINGLE-FLIGHT: Atomic Leases en Postgres (`radar_acquisition_leases`)
 *    que evitan que múltiples instancias de Edge Functions colisionen.
 * 3. BUCKET SEMANTIC AUDIT: Clasificación rigurosa (sin falsos HIGH_DEMAND en queries frías).
 * 4. RESULT SUFFICIENCY GUARD: Si fuentes libres ya tienen 5-6 de calidad, Radar = 0.
 * 5. RADAR KNOWLEDGE ROI: Mide el rendimiento de conocimiento (`Knowledge Yield`)
 *    y búsquedas futuras evitadas (`Radar Calls Avoided`).
 */

import { supabase } from './supabase';
import type { QueryUnderstanding } from './search/intentDetector';

// ── Configuración de Capacidad y Presupuesto ────────────────────────────────
const INTERNAL_BUDGET = 80;      // Presupuesto diario operativo (< 100 de Google)
const EMERGENCY_RESERVE = 20;    // Reserva intocable de seguridad
const EFFECTIVE_BUDGET = INTERNAL_BUDGET - EMERGENCY_RESERVE; // = 60

export type RadarBucket =
  | 'FRESHNESS'          // Breaking news / live / actualidad inmediata (>=75 freshness)
  | 'HIGH_DEMAND_GAPS'   // Clusters de alto volumen con Atlas gap real (demand >= 60)
  | 'HIGH_REUSE'         // Contenido atemporal de alta reutilización (reuse >= 65)
  | 'RECOVERY'           // Recuperación de fallos severos de cobertura (deficit >= 90)
  | 'LOW_PRIORITY_GAP'   // Gaps con baja demanda/interés (audit: no queman cuota)
  | 'QA'                 // Pruebas y benchmarkings
  | 'RESERVE';           // Reserva de emergencia

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
  atlasCoverage?: number;       // 0-100: % de candidatos que ya vienen de Atlas
  freshnessNeed?: number;       // 0-100: 100 = breaking news, 0 = atemporal
  demand?: number;              // 0-100: popularidad / cluster demand
  reuseProbability?: number;    // 0-100: probabilidad de reutilización futura
  currentQualifiedCount?: number; // Cuántos candidatos calificados ya tenemos de fuentes libres
  avgQuality?: number;          // Calidad media de los candidatos libres
  avgRelevance?: number;        // Relevancia media de los candidatos libres
  intent?: QueryUnderstanding;  // Intención semántica detectada
  context?: string;             // Metadata adicional
}

export interface SearchPermission {
  authorized: boolean;
  requestId: string;
  clusterKey: string;
  reason?: string;             // Motivo de rechazo o aprobación
  budgetRemaining: number;
  opportunityScore?: number;
  bucketAllocated?: RadarBucket;
  coalesced?: boolean;
}

// ── In-Memory Fast Local Map (complementa el lock distribuido de Postgres) ───
const inFlightAcquisitions = new Map<string, Promise<any>>();

export function getInFlightAcquisition(clusterKey: string): Promise<any> | undefined {
  return inFlightAcquisitions.get(clusterKey);
}

export function registerInFlightAcquisition<T>(clusterKey: string, promise: Promise<T>): Promise<T> {
  inFlightAcquisitions.set(clusterKey, promise);
  promise.finally(() => {
    inFlightAcquisitions.delete(clusterKey);
  });
  return promise;
}

// ── 1. SEMANTIC ACQUISITION CLUSTERING ─────────────────────────────────────
const STOP_WORDS = /\b(de|la|el|los|las|un|una|unos|unas|para|en|con|sobre|que|quien|quienes|como|del|al|por|the|a|an|of|in|on|for|with|about|is|are|was|were|y|e|o|u|fue|era|es|son|ha|sido|funciona|hacer|ver|su|sus|mi|tu)\b/gi;

const FACET_TERMS = /\b(biografia|historia|vida|obra|origen|nacimiento|muerte|invento|inventos|motor|bobina|patente|tecnologia|funcionamiento|experimento|induccion|corriente|electrico|electrica|vs|contra|edison|guerra|rival|rivalidad|pelea|debate|discusion|conferencia|charla|mesa|redonda|panel|tutorial|paso|guia|aprender|curso|noticia|noticias|ultimas|breaking|urgente|cortometraje|short|film|corto|pelicula|movie|video|videos|clip|full|completo|hd|4k|oficial|official)\b/gi;

/**
 * Extrae el Acquisition Cluster semántico en formato `entity:facet`
 * Ejemplo:
 * - "historia de Nikola Tesla" -> "nikola_tesla:biography"
 * - "biografía de Nikola Tesla" -> "nikola_tesla:biography"
 * - "vida y obra de Nikola Tesla" -> "nikola_tesla:biography"
 * - "quién fue Nikola Tesla" -> "nikola_tesla:biography"
 * - "cómo funciona el motor de inducción de Tesla" -> "tesla:inventions"
 */
export function extractSemanticAcquisitionCluster(query: string, intent?: QueryUnderstanding): {
  clusterKey: string;
  entity: string;
  facet: string;
} {
  const norm = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 1. Detección de Faceta Semántica
  let facet = 'general';
  if (norm.match(/\b(biografia|historia|vida|obra|quien fue|quien era|origen|nacimiento|muerte)\b/)) {
    facet = 'biography';
  } else if (norm.match(/\b(invento|inventos|motor|bobina|patente|tecnologia|funcionamiento|como funciona|experimento|induccion|corriente|electrico|electrica)\b/)) {
    facet = 'inventions';
  } else if (norm.match(/\b(vs|contra|edison|guerra|rival|rivalidad|pelea)\b/)) {
    facet = 'rivalry';
  } else if (norm.match(/\b(debate|discusion|conferencia|charla|mesa redonda|panel)\b/)) {
    facet = 'debate';
  } else if (norm.match(/\b(tutorial|como hacer|paso a paso|guia|aprender|curso)\b/)) {
    facet = 'tutorial';
  } else if (norm.match(/\b(noticia|noticias|ultimas noticias|breaking|urgente|ahora)\b/)) {
    facet = 'news';
  } else if (norm.match(/\b(cortometraje|short film|corto|pelicula|movie|film)\b/)) {
    facet = 'film';
  }


  // 2. Detección de Entidad Principal
  let entity = '';
  if (intent?.entities && intent.entities.length > 0) {
    entity = (intent.entities[0].canonical || intent.entities[0].name || '').toLowerCase();
  }

  if (!entity || entity.length < 2) {
    // Extraer entidad eliminando conectores, stop words y palabras de faceta
    entity = norm
      .replace(STOP_WORDS, ' ')
      .replace(FACET_TERMS, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Limpiar y formatear entidad
  const cleanEntity = entity.replace(/\s+/g, '_') || 'topic';
  const clusterKey = `${cleanEntity}:${facet}`;

  return { clusterKey, entity: cleanEntity, facet };
}

/**
 * Backward-compatible helper export for getCanonicalClusterKey
 */
export function getCanonicalClusterKey(query: string, intent?: QueryUnderstanding): string {
  return extractSemanticAcquisitionCluster(query, intent).clusterKey;
}



// ── 2. DISTRIBUTED SINGLE-FLIGHT (Atomic Postgres Leases) ──────────────────
export async function acquireDistributedLease(
  clusterKey: string,
  requestId: string,
  ttlSeconds = 45
): Promise<{ acquired: boolean; coalesced: boolean; ownerRequestId?: string }> {
  // 1. Fast Local In-Memory Check (0ms latency si ya está en vuelo localmente)
  if (inFlightAcquisitions.has(clusterKey)) {
    return { acquired: false, coalesced: true };
  }

  // 2. Distributed Atomic Lock in Postgres (Coordina entre múltiples Edge Functions/Instancias)
  try {
    const { data, error } = await supabase.rpc('acquire_radar_lease', {
      p_cluster_key: clusterKey,
      p_request_id: requestId,
      p_ttl_seconds: ttlSeconds
    });

    if (error || !data) {
      return { acquired: true, coalesced: false };
    }

    return {
      acquired: data.acquired === true,
      coalesced: data.coalesced === true,
      ownerRequestId: data.owner_request_id
    };
  } catch {
    return { acquired: true, coalesced: false };
  }
}


export async function releaseDistributedLease(
  clusterKey: string,
  requestId: string,
  status: 'completed' | 'failed' = 'completed',
  resultsCount = 0
): Promise<void> {
  try {
    await supabase.rpc('release_radar_lease', {
      p_cluster_key: clusterKey,
      p_request_id: requestId,
      p_status: status,
      p_results_count: resultsCount
    });
  } catch {}
}

// ── 3. CLUSTER-BASED RECENCY COOLDOWN GUARD ────────────────────────────────
const RADAR_CACHE_KEY = 'youapp_radar_recent_clusters';
const COOLDOWN_HOURS_GENERAL = 6;
const COOLDOWN_HOURS_FRESH = 1;

export function getRadarClusterCooldownInfo(
  clusterKey: string,
  freshnessNeed?: number,
  atlasCandidateCount?: number
): { inCooldown: boolean; ageMinutes: number } {
  try {
    const raw = localStorage.getItem(RADAR_CACHE_KEY);
    if (!raw) return { inCooldown: false, ageMinutes: 0 };
    const history: Record<string, number> = JSON.parse(raw);
    const lastTimestamp = history[clusterKey];
    if (!lastTimestamp) return { inCooldown: false, ageMinutes: 0 };

    const cooldownMs = (freshnessNeed && freshnessNeed > 70)
      ? COOLDOWN_HOURS_FRESH * 3600 * 1000
      : COOLDOWN_HOURS_GENERAL * 3600 * 1000;

    const elapsed = Date.now() - lastTimestamp;
    const ageMinutes = Math.round(elapsed / (60 * 1000));
    const hasKnowledge = typeof atlasCandidateCount === 'number' ? atlasCandidateCount > 0 : true;

    return {
      inCooldown: elapsed < cooldownMs && hasKnowledge,
      ageMinutes
    };
  } catch {
    return { inCooldown: false, ageMinutes: 0 };
  }
}

export function recordRadarClusterExecution(clusterKey: string) {
  try {
    const raw = localStorage.getItem(RADAR_CACHE_KEY);
    const history: Record<string, number> = raw ? JSON.parse(raw) : {};
    history[clusterKey] = Date.now();
    localStorage.setItem(RADAR_CACHE_KEY, JSON.stringify(history));
  } catch {}
}

// ── 4. OPPORTUNITY SCORE & BUCKET SEMANTIC AUDIT ───────────────────────────
export function calculateOpportunityScore(params: {
  demand?: number;
  reuseProbability?: number;
  atlasCoverage?: number;
  freshnessNeed?: number;
  currentQualifiedCount?: number;
  avgQuality?: number;
  avgRelevance?: number;
}): { score: number; bucket: RadarBucket; resultDeficit: number; isAuditedLowDemand: boolean } {
  const demand = params.demand ?? 40;
  const reuseProbability = params.reuseProbability ?? 50;
  const knowledgeGap = 100 - (params.atlasCoverage ?? 0);
  const freshnessNeed = params.freshnessNeed ?? 20;

  // Evaluación de Suficiencia de Resultado Actual
  let resultDeficit = 100;
  const currentCount = params.currentQualifiedCount ?? 0;
  const avgQ = params.avgQuality ?? 0;
  const avgR = params.avgRelevance ?? 0;

  if (currentCount >= 8) {
    resultDeficit = 0; // Cobertura completa de fuentes gratuitas
  } else if (currentCount >= 5 && avgQ >= 65 && avgR >= 55) {
    resultDeficit = 15; // Resultado suficiente (6 excelentes > 20 de relleno)
  } else if (currentCount >= 3) {
    resultDeficit = 45;
  } else if (currentCount >= 1) {
    resultDeficit = 75;
  } else {
    resultDeficit = 100;
  }

  // Fórmula Oficial de Oportunidad de Adquisición
  const score = Math.round(
    (demand            * 0.25) +
    (reuseProbability  * 0.25) +
    (knowledgeGap      * 0.20) +
    (freshnessNeed     * 0.20) +
    (resultDeficit     * 0.10)
  );

  // Clasificación Semántica Rigurosa del Bucket
  const isAuditedLowDemand = demand < 35 && freshnessNeed < 50;
  let bucket: RadarBucket = 'HIGH_DEMAND_GAPS';

  if (isAuditedLowDemand && score < 40) {
    bucket = 'LOW_PRIORITY_GAP'; // Audit: no confundir con high-demand
  } else if (freshnessNeed >= 75) {
    bucket = 'FRESHNESS';
  } else if (reuseProbability >= 65 && freshnessNeed < 50) {
    bucket = 'HIGH_REUSE';
  } else if (demand >= 60 && knowledgeGap >= 50) {
    bucket = 'HIGH_DEMAND_GAPS';
  } else if (resultDeficit >= 90) {
    bucket = 'RECOVERY';
  } else {
    bucket = 'LOW_PRIORITY_GAP';
  }

  return { score, bucket, resultDeficit, isAuditedLowDemand };
}

// ── 5. ADMISSION CONTROLLER (requestSearch) ────────────────────────────────
export async function requestSearch(params: SearchRequest): Promise<SearchPermission> {
  const requestId = crypto.randomUUID();
  const { clusterKey } = extractSemanticAcquisitionCluster(params.query, params.intent);

  // 1. Distributed Single-Flight Lease Acquisition
  const lease = await acquireDistributedLease(clusterKey, requestId);
  if (lease.coalesced) {
    if (import.meta.env?.DEV) {
      console.log(`🔗 [QuotaBrain] Distributed Single-Flight: uniéndose a adquisición in-flight para cluster "${clusterKey}" (0 cuota nueva).`);
    }
    return {
      authorized: true,
      requestId,
      clusterKey,
      reason: 'coalesced_in_flight',
      budgetRemaining: await getBudgetRemaining(),
      coalesced: true
    };
  }

  // 2. Cooldown Guard por Cluster Semántico
  const cooldownInfo = getRadarClusterCooldownInfo(clusterKey, params.freshnessNeed, params.atlasCoverage);
  if (params.caller === 'SearchEngine' && cooldownInfo.inCooldown) {
    await releaseDistributedLease(clusterKey, requestId, 'completed', 0);
    if (import.meta.env?.DEV) {
      console.log(`🛡️ [QuotaBrain] Cluster Cooldown activo para "${clusterKey}" (${cooldownInfo.ageMinutes} min). Cuota evitada.`);
    }
    return {
      authorized: false,
      requestId,
      clusterKey,
      reason: `radar_cluster_cooldown (adquirido hace ${cooldownInfo.ageMinutes}m, cluster "${clusterKey}")`,
      budgetRemaining: await getBudgetRemaining()
    };
  }

  // 3. Evaluar Suficiencia de Resultados Existentes (6 excelentes > 20 de relleno)
  const currentCount = params.currentQualifiedCount ?? 0;
  const avgQ = params.avgQuality ?? 0;
  const avgR = params.avgRelevance ?? 0;
  if (currentCount >= 6 && avgQ >= 65 && avgR >= 55 && (params.freshnessNeed ?? 0) < 80) {
    await releaseDistributedLease(clusterKey, requestId, 'completed', currentCount);
    if (import.meta.env?.DEV) {
      console.log(`✨ [QuotaBrain] Resultado Actual Suficiente (${currentCount} videos libres, Q: ${avgQ.toFixed(0)}, R: ${avgR.toFixed(0)}). Radar evitado.`);
    }
    return {
      authorized: false,
      requestId,
      clusterKey,
      reason: `result_already_sufficient (${currentCount} qualified videos in cluster "${clusterKey}")`,
      budgetRemaining: await getBudgetRemaining()
    };
  }

  let budgetRemaining = EFFECTIVE_BUDGET;
  let authorized = false;
  let denialReason: string | undefined;
  let opportunityScore = 0;
  let bucketAllocated: RadarBucket = 'HIGH_DEMAND_GAPS';

  try {
    if (import.meta.env?.DEV && import.meta.env?.VITE_SMOKE_LIVE !== 'true') {
      budgetRemaining = 1000;
    } else {
      budgetRemaining = await getBudgetRemaining();
    }

    if (budgetRemaining <= 0) {
      authorized = false;
      denialReason = 'daily_budget_exhausted';
      await releaseDistributedLease(clusterKey, requestId, 'failed', 0);
    } else {
      const opp = calculateOpportunityScore({
        demand: params.demand,
        reuseProbability: params.reuseProbability,
        atlasCoverage: params.atlasCoverage,
        freshnessNeed: params.freshnessNeed,
        currentQualifiedCount: params.currentQualifiedCount,
        avgQuality: params.avgQuality,
        avgRelevance: params.avgRelevance
      });

      opportunityScore = opp.score;
      bucketAllocated = opp.bucket;

      // Umbral dinámico de admisión
      const threshold = budgetRemaining > 30 ? 30 : budgetRemaining > 10 ? 55 : 75;
      authorized = opportunityScore >= threshold && bucketAllocated !== 'LOW_PRIORITY_GAP';

      if (!authorized) {
        denialReason = bucketAllocated === 'LOW_PRIORITY_GAP'
          ? `low_priority_gap (demand: ${params.demand || 0}, score: ${opportunityScore})`
          : `opportunity_score_too_low (${opportunityScore} < ${threshold})`;
        await releaseDistributedLease(clusterKey, requestId, 'failed', 0);
      }
    }
  } catch (err) {
    console.error('[QuotaBrain] Error evaluating request:', err);
    authorized = false;
    denialReason = 'quota_brain_error';
    await releaseDistributedLease(clusterKey, requestId, 'failed', 0);
  }

  // Registrar intento en telemetría
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
    budgetRemaining
  });

  return {
    authorized,
    requestId,
    clusterKey,
    reason: denialReason,
    budgetRemaining: authorized ? budgetRemaining - 1 : budgetRemaining,
    opportunityScore,
    bucketAllocated
  };
}

// ── 6. RADAR KNOWLEDGE ROI TELEMETRY ───────────────────────────────────────
export async function recordRadarKnowledgeROI(params: {
  clusterKey: string;
  requestId: string;
  rawReturned: number;
  uniqueCount: number;
  qualifiedCount: number;
  newToAtlas: number;
}) {
  try {
    await supabase.rpc('record_radar_knowledge_acquisition', {
      p_cluster_key: params.clusterKey,
      p_request_id: params.requestId,
      p_raw_returned: params.rawReturned,
      p_unique_count: params.uniqueCount,
      p_qualified_count: params.qualifiedCount,
      p_new_to_atlas: params.newToAtlas
    });

    if (import.meta.env?.DEV) {
      console.log(`📊 [Knowledge ROI] Cluster: "${params.clusterKey}" | Raw: ${params.rawReturned} | Qualified: ${params.qualifiedCount} | New to Atlas: ${params.newToAtlas}`);
    }
  } catch {}
}

export async function reportSearchResult(requestId: string, params: {
  resultsReceived: number;
  latencyMs?: number;
  query?: string;
  clusterKey?: string;
}) {
  try {
    if (params.clusterKey) {
      recordRadarClusterExecution(params.clusterKey);
      await releaseDistributedLease(params.clusterKey, requestId, 'completed', params.resultsReceived);
    }
    await supabase
      .from('quota_events')
      .update({
        results_received: params.resultsReceived,
        latency_ms: params.latencyMs,
      })
      .eq('request_id', requestId);
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[QuotaBrain] Could not update search result:', err);
  }
}

// ── Telemetría y Logging ───────────────────────────────────────────────────
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

    if (import.meta.env?.DEV) {
      const emoji = params.authorized ? '🔭 [RADAR ADMISIÓN]' : '🛡️ [RADAR DENEGADO]';
      console.log(`[QuotaBrain] ${emoji} "${params.query}" | oppScore: ${params.opportunityScore} | auth: ${params.authorized} | motivo: ${params.denialReason || 'authorized'}`);
    }
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[QuotaBrain] Could not log event:', err);
  }
}

export async function getBudgetRemaining(): Promise<number> {
  if (import.meta.env?.DEV && import.meta.env?.VITE_SMOKE_LIVE !== 'true') return 1000;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('youtube_quota_daily')
      .select('used, daily_limit')
      .eq('date', today)
      .eq('bucket', 'organic')
      .maybeSingle();

    if (!data) return EFFECTIVE_BUDGET;
    return Math.max(0, (data.daily_limit || INTERNAL_BUDGET) - (data.used || 0));
  } catch {
    return EFFECTIVE_BUDGET;
  }
}

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

  const totalUsed = data.reduce((acc, row) => acc + (row.used || 0), 0);
  const totalLimit = data.reduce((acc, row) => acc + (row.daily_limit || 0), 0);

  return {
    date: today,
    searches_used: totalUsed,
    searches_denied: 0,
    searches_avoided: 0,
    internal_budget: totalLimit,
    google_limit: 100,
  };
}

export async function getRecentEvents(limit = 50) {
  const { data } = await supabase
    .from('quota_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}
