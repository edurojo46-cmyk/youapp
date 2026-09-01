/**
 * capabilityRouter.ts — Fase 8: Capability Router
 *
 * Decide qué fuentes activar para cada query, basándose en sus capacidades.
 *
 * Ejemplos:
 *   "¿Qué pasa hoy con IA?" → freshness: 100, trends: 95, archive: 0
 *   → Publishers(95) + X(90) + Reddit(75) + Atlas(95)
 *
 *   "Documental sobre Perón de 1950" → archive: 100, freshness: 5
 *   → Archive(100) + Atlas(95) + Vimeo(80) + Publishers(65)
 *
 * Principio: Las fuentes de mayor prioridad se activan primero.
 * Si el free tier alcanza ≥40 candidatos, YouTube Radar NO se activa.
 */

import type { QueryUnderstanding } from './intentDetector';
import type { SearchQuery } from './types';
import type { ProviderUtilitySource, ProviderUtilityContext, ProviderUtilityRecord } from './types';

import { TelemetryUtilitySource } from './providers/telemetryUtilitySource';

// ── Caches de Inteligencia de Proveedores ────────────────────────────────────
let providerHealthCache: Record<string, any> = {};
let lastIntelligenceUpdate = 0;

export const defaultUtilitySource = new TelemetryUtilitySource();


export async function refreshProviderIntelligence() {
  try {
    if (Date.now() - lastIntelligenceUpdate < 60000) return; // 1 min cache
    
    // In a real env, fetch from `provider_health_current`
    const { data: health } = await supabase.from('provider_health_current').select('*').catch(() => ({ data: [] }));
    if (health) {
      providerHealthCache = health.reduce((acc: any, row: any) => ({...acc, [row.provider]: row}), {});
    }
    
    lastIntelligenceUpdate = Date.now();
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[CapabilityRouter] Failed to refresh intelligence', e);
  }
}

// ── Capacidades que puede necesitar una query ────────────────────────────────

export interface QueryCapabilities {
  needsVideo: number;        // 0-100
  needsFreshness: number;    // 0-100 (noticias, live)
  needsTrends: number;       // 0-100 (qué está pasando)
  needsArchive: number;      // 0-100 (contenido histórico)
  needsCommunity: number;    // 0-100 (debate, reseñas)
  needsLive: number;         // 0-100 (transmisiones en vivo)
  needsShortForm: number;    // 0-100 (clips, shorts)
  needsLongForm: number;     // 0-100 (documentales, tutoriales)
  needsEducational: number;  // 0-100 (universidades, cursos)
  
  // Specific capabilities
  needsDocumentary?: number;
  needsArtistic?: number;
  needsShortFilm?: number;
  needsAnimation?: number;
  needsPortfolio?: number;
  needsMusicVideo?: number;
}

// ── Scores de cada proveedor por capacidad ────────────────────────────────────
// Fuente: platform_integrations — si se cambia la tabla, actualizar aquí

const PROVIDER_CAPABILITY_MATRIX: Record<string, QueryCapabilities> = {
  atlas: {
    needsVideo: 95, needsFreshness: 60, needsTrends: 30,
    needsArchive: 80, needsCommunity: 20, needsLive: 40,
    needsShortForm: 50, needsLongForm: 90, needsEducational: 85
  },
  discover: {  // universidades, museos, conferencias
    needsVideo: 70, needsFreshness: 20, needsTrends: 5,
    needsArchive: 75, needsCommunity: 10, needsLive: 0,
    needsShortForm: 10, needsLongForm: 95, needsEducational: 99
  },
  publisher: {  // noticias y medios
    needsVideo: 65, needsFreshness: 95, needsTrends: 80,
    needsArchive: 30, needsCommunity: 20, needsLive: 30,
    needsShortForm: 40, needsLongForm: 60, needsEducational: 40
  },
  archive: {  // Internet Archive
    needsVideo: 80, needsFreshness: 0, needsTrends: 0,
    needsArchive: 100, needsCommunity: 10, needsLive: 0,
    needsShortForm: 20, needsLongForm: 90, needsEducational: 85
  },
  vimeo: {
    needsVideo: 90, needsFreshness: 25, needsTrends: 20,
    needsArchive: 60, needsCommunity: 15, needsLive: 15,
    needsShortForm: 30, needsLongForm: 75, needsEducational: 70,
    needsDocumentary: 85, needsArtistic: 100, needsShortFilm: 100,
    needsAnimation: 90, needsPortfolio: 90, needsMusicVideo: 80
  },
  dailymotion: {
    needsVideo: 70, needsFreshness: 50, needsTrends: 35,
    needsArchive: 40, needsCommunity: 10, needsLive: 20,
    needsShortForm: 45, needsLongForm: 60, needsEducational: 40
  },
  twitch: {
    needsVideo: 75, needsFreshness: 80, needsTrends: 50,
    needsArchive: 20, needsCommunity: 30, needsLive: 100,
    needsShortForm: 20, needsLongForm: 40, needsEducational: 20
  },
  peertube: {
    needsVideo: 80, needsFreshness: 30, needsTrends: 15,
    needsArchive: 50, needsCommunity: 15, needsLive: 20,
    needsShortForm: 30, needsLongForm: 75, needsEducational: 60
  },
  youtube: {  // ← Radar: last resort
    needsVideo: 100, needsFreshness: 85, needsTrends: 70,
    needsArchive: 50, needsCommunity: 30, needsLive: 80,
    needsShortForm: 80, needsLongForm: 90, needsEducational: 75
  }
};

// ── Detectar capacidades necesarias a partir de la query ─────────────────────

export function detectQueryCapabilities(
  query: SearchQuery,
  intent?: QueryUnderstanding
): QueryCapabilities {
  const q = query.normalizedQuery;
  const primaryIntent = intent?.primaryIntent || 'general';

  // Base: video siempre es necesario
  let needsVideo = 80;
  let needsFreshness = 30;
  let needsTrends = 15;
  let needsArchive = 20;
  let needsCommunity = 10;
  let needsLive = 0;
  let needsShortForm = 20;
  let needsLongForm = 50;
  let needsEducational = 20;

  // TV Signal context hint
  if (query.context?.needsDocumentary) {
    needsLongForm = 95; needsArchive = 55; needsEducational = 50;
  }

  // Intent signals
  if (primaryIntent === 'NEWS') {
    needsFreshness = 95; needsTrends = 85; needsArchive = 5; needsLongForm = 30;
  }
  if (primaryIntent === 'LIVE') {
    needsLive = 100; needsFreshness = 100; needsTrends = 60; needsLongForm = 10;
  }
  if (primaryIntent === 'TUTORIAL') {
    needsEducational = 80; needsLongForm = 85; needsShortForm = 30; needsFreshness = 10;
  }
  if (primaryIntent === 'DOCUMENTARY') {
    needsLongForm = 95; needsArchive = 60; needsEducational = 50; needsFreshness = 5;
  }
  if (primaryIntent === 'HISTORY') {
    needsArchive = 80; needsLongForm = 85; needsEducational = 60; needsFreshness = 5;
  }

  // Freshness signals
  if (query.freshness === 'live') {
    needsLive = 100; needsFreshness = 100;
  }
  if (query.freshness === 'news') {
    needsFreshness = 90; needsTrends = 75;
  }
  if (query.freshness === 'evergreen') {
    needsArchive = Math.max(needsArchive, 40); needsFreshness = Math.min(needsFreshness, 20);
  }

  // Keyword signals
  if (/historia|1[89]\d{2}|archivo|clasico|antiguo/i.test(q)) {
    needsArchive = 90; needsFreshness = 5; needsTrends = 0;
  }
  if (/curso|clase|aprend|tutorial|universidad|profesor/i.test(q)) {
    needsEducational = 90; needsLongForm = 90; needsShortForm = 20;
  }
  if (/live|en vivo|stream|twitch/i.test(q)) {
    needsLive = 90; needsFreshness = 95;
  }
  if (/short|corto|clip|tiktok|reels?|shorts?/i.test(q)) {
    needsShortForm = 90; needsLongForm = 20;
  }
  if (/documental|documentary/i.test(q)) {
    needsLongForm = 95; needsArchive = 55;
  }
  if (/trending|tendencia|viral|ahora mismo/i.test(q)) {
    needsTrends = 90; needsFreshness = 85;
  }
  if (/debate|opinion|comentarios|review/i.test(q)) {
    needsCommunity = 60;
  }

  // Vimeo-specific keyword detection
  const needsArtistic = /arte|art|experimental|creativ|independiente|indie/i.test(q) ? 95 : 0;
  const needsShortFilm = /corto|cortometraje|short film/i.test(q) ? 100 : 0;
  const needsAnimation = /animaci[óo]n|animation|motion graphics/i.test(q) ? 95 : 0;
  const needsPortfolio = /portfolio|reel|showreel|director|cineasta/i.test(q) ? 90 : 0;
  const needsMusicVideo = /videoclip|music video|video musical/i.test(q) ? 85 : 0;
  const needsDocumentary = /documental|documentary/i.test(q) ? 95 : 0;

  return {
    needsVideo: Math.min(100, needsVideo),
    needsFreshness: Math.min(100, needsFreshness),
    needsTrends: Math.min(100, needsTrends),
    needsArchive: Math.min(100, needsArchive),
    needsCommunity: Math.min(100, needsCommunity),
    needsLive: Math.min(100, needsLive),
    needsShortForm: Math.min(100, needsShortForm),
    needsLongForm: Math.min(100, needsLongForm),
    needsEducational: Math.min(100, needsEducational),
    needsArtistic,
    needsShortFilm,
    needsAnimation,
    needsPortfolio,
    needsMusicVideo,
    needsDocumentary
  };
}

// ── Calcular score de routing para cada proveedor ────────────────────────────

export function routerScore(provider: string, capabilities: QueryCapabilities): number {
  const matrix = PROVIDER_CAPABILITY_MATRIX[provider];
  if (!matrix) return 0;

  // Dot product ponderado entre necesidades de la query y capacidades del proveedor
  const score =
    (capabilities.needsVideo       * matrix.needsVideo       * 0.15) +
    (capabilities.needsFreshness   * matrix.needsFreshness   * 0.20) +
    (capabilities.needsTrends      * matrix.needsTrends      * 0.15) +
    (capabilities.needsArchive     * matrix.needsArchive     * 0.15) +
    (capabilities.needsCommunity   * matrix.needsCommunity   * 0.05) +
    (capabilities.needsLive        * matrix.needsLive        * 0.10) +
    (capabilities.needsShortForm   * matrix.needsShortForm   * 0.05) +
    (capabilities.needsLongForm    * matrix.needsLongForm    * 0.10) +
    (capabilities.needsEducational * matrix.needsEducational * 0.05) +
    ((capabilities.needsDocumentary || 0) * (matrix.needsDocumentary || 0) * 0.15) +
    ((capabilities.needsArtistic || 0)    * (matrix.needsArtistic || 0)    * 0.20) +
    ((capabilities.needsShortFilm || 0)   * (matrix.needsShortFilm || 0)   * 0.20) +
    ((capabilities.needsAnimation || 0)   * (matrix.needsAnimation || 0)   * 0.15) +
    ((capabilities.needsPortfolio || 0)   * (matrix.needsPortfolio || 0)   * 0.15) +
    ((capabilities.needsMusicVideo || 0)  * (matrix.needsMusicVideo || 0)  * 0.10);

  let finalScore = Math.round(score / 100);  // normalizar a 0-100
  
  if (provider === 'youtube') {
    const isYoutubeOff = (typeof process !== 'undefined' && process.env?.YOUTUBE_OFF === 'true') ||
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_YOUTUBE_OFF === 'true');
    if (isYoutubeOff) {
      return 0;
    }
    return Math.max(50, 20 + finalScore); // Asegurar que YouTube siempre alcance el umbral (40)
  }
  
  return finalScore;
}

// ── API pública ─────────────────────────────────────────────────────────────

export interface RouterDecision {
  provider: string;
  score: number; // Dynamic Score (or Static if no data)
  staticFit: number;
  learnedUtility: number;
  healthScore: number;
  sampleSize: number;
  exploration: boolean;
  shouldActivate: boolean;
  reason: string;
  tier: 'primary' | 'secondary' | 'fallback' | 'radar' | 'skip';
  fallbackActivated?: boolean;  // true si se activó solo por GENERAL FALLBACK
  dynamicScore?: number; // Used for shadow mode comparison
  
  // Tracing context
  utilitySource?: string;
  learningConfidence?: string;
  learnedWeight?: number;
  utilityUpdatedAt?: string;
}

// Providers que se activan en GENERAL FALLBACK (sin YouTube Radar)
// const GENERAL_FALLBACK_PROVIDERS = ['atlas'];

export type RoutingMode = 'static' | 'shadow' | 'dynamic' | 'all';

export function routeQuery(
  query: SearchQuery,
  intent?: QueryUnderstanding,
  threshold = 30,
  routingMode: RoutingMode = 'shadow',
  utilitySource: ProviderUtilitySource = defaultUtilitySource,
  options?: { isFallback?: boolean, activatedProviders?: string[], requestId?: string, isShadowInner?: boolean, disableExploration?: boolean }
): RouterDecision[] {
  const capabilities = detectQueryCapabilities(query, intent);
  const primaryIntent = intent?.primaryIntent || 'UNKNOWN';
  const confidence = intent?.confidence ?? 100;

  const providers = Object.keys(PROVIDER_CAPABILITY_MATRIX);
  
  if (routingMode === 'shadow' && !options?.isShadowInner) {
    const dynamicDecisions = routeQuery(query, intent, threshold, 'dynamic', utilitySource, { ...options, isShadowInner: true, disableExploration: true });
    const staticDecisions = routeQuery(query, intent, threshold, 'static', utilitySource, { ...options, isShadowInner: true });
    
    // Asynchronously log the dual decision comparison if it's the primary routing run (not a fallback block)
    if (!options?.isFallback && options?.requestId) {
      logShadowDecision(options.requestId, query, intent, staticDecisions, dynamicDecisions);
    }
    
    return staticDecisions;
  }
  
  // Calculate decisions for the current mode
  let decisions: RouterDecision[] = providers
    .map(provider => {
      // 1. Static Fit
      const staticScore = routerScore(provider, capabilities);
      
      // 2. Health Gate
      const healthData = providerHealthCache[provider] || { health_score: 100, status: 'healthy', circuit_open: false };
      if (healthData.circuit_open) {
        return {
          provider, score: 0, staticFit: staticScore, learnedUtility: 0, healthScore: 0, sampleSize: 0, exploration: false,
          shouldActivate: false, reason: 'Circuit Open', tier: 'skip'
        } as RouterDecision;
      }
      
      const healthScore = healthData.health_score ?? 100;

      // 3. Learned Utility
      const utilityContext: ProviderUtilityContext = {
        intent: intent?.primaryIntent?.toLowerCase(),
        topicCluster: intent?.topics?.[0]?.toLowerCase()?.split('/')[0]?.trim(),
        freshness: query.freshness
      };
      
      const utilityData = utilitySource.getUtility(provider, utilityContext);
      const sampleSize = utilityData?.sample_size || 0;
      const learnedUtility = utilityData?.learned_utility ?? staticScore;

      // 4. Dynamic Weighting (Cold Start Protection)
      let learnedWeight = 0;
      if (sampleSize >= 500) learnedWeight = 0.30;
      else if (sampleSize >= 100) learnedWeight = 0.15;
      else if (sampleSize >= 20) learnedWeight = 0.05;
      
      const staticWeight = 1.0 - learnedWeight;

      // 5. Compute base score using learned vs static, then multiply by health
      const baseScore = (staticScore * staticWeight) + (learnedUtility * learnedWeight);
      const dynamicScore = Math.round(baseScore * (healthScore / 100));
      
      const scoreToUse = routingMode === 'dynamic' ? dynamicScore : staticScore;
      const activated = routingMode === 'all' ? true : scoreToUse >= threshold;
      
      const tier: RouterDecision['tier'] = provider === 'youtube' ? 'radar'
        : scoreToUse >= 70 ? 'primary'
        : scoreToUse >= 40 ? 'secondary'
        : activated ? 'fallback'
        : 'skip';
        
      let confidenceStr = 'NONE';
      if (sampleSize >= 500) confidenceStr = 'HIGH';
      else if (sampleSize >= 100) confidenceStr = 'MEDIUM';
      else if (sampleSize >= 20) confidenceStr = 'LOW';
      
      return {
        provider,
        score: scoreToUse, // Actual score driving the decision
        staticFit: staticScore,
        learnedUtility,
        healthScore,
        sampleSize,
        exploration: false,
        shouldActivate: activated,
        reason: buildReason(provider, scoreToUse, capabilities),
        tier,
        fallbackActivated: false,
        dynamicScore, // Store the hypothetical dynamic score for shadow logging
        
        utilitySource: sampleSize > 0 ? 'TELEMETRY' : 'STATIC',
        learningConfidence: confidenceStr,
        learnedWeight: Math.round(learnedWeight * 100),
        utilityUpdatedAt: utilityData?.updated_at
      } as RouterDecision;
    })
    .sort((a, b) => b.score - a.score);

  // 6. Exploration Slot (5%) - Only active if not explicitly disabled and not in fallback
  if (routingMode !== 'shadow' && !options?.disableExploration && !options?.isFallback) {
    const EXPLORATION_RATE = 0.05;
    if (Math.random() < EXPLORATION_RATE) {
      const explorables = decisions.filter(d => !d.shouldActivate && d.provider !== 'youtube' && d.reason !== 'Circuit Open');
      if (explorables.length > 0) {
        const exploreTarget = explorables[0];
        exploreTarget.shouldActivate = true;
        exploreTarget.exploration = true;
        exploreTarget.reason = 'Exploration Slot';
        exploreTarget.tier = 'fallback';
      }
    }
  }

  // ── BUDGET ENFORCEMENT & FALLBACK ──────────────────────────────────────────
  const PRIMARY_BUDGET = 2;
  const FALLBACK_BUDGET = 1;
  const isFallback = options?.isFallback || false;
  const activatedProviders = options?.activatedProviders || [];

  if (!isFallback) {
    // Primary phase: allow up to PRIMARY_BUDGET providers that meet threshold
    let primaryCount = 0;
    // We sort decisions by scoreToUse for external providers (excluding youtube)
    const externalDecisions = decisions.filter(d => d.provider !== 'youtube');
    externalDecisions.sort((a, b) => (b.dynamicScore || b.score) - (a.dynamicScore || a.score));

    // Desactivar todos los externos primero
    externalDecisions.forEach(d => { d.shouldActivate = false; d.tier = 'skip'; });

    externalDecisions.forEach(d => {
      const scoreToUse = routingMode === 'dynamic' ? (d.dynamicScore || d.score) : d.staticFit;
      if (scoreToUse >= threshold && primaryCount < PRIMARY_BUDGET) {
        d.shouldActivate = true;
        d.tier = scoreToUse >= 70 ? 'primary' : 'secondary';
        d.reason = buildReason(d.provider, scoreToUse, capabilities);
        primaryCount++;
      }
    });

  } else {
    // Fallback phase: allow up to FALLBACK_BUDGET providers that were NOT activated in primary
    let fallbackCount = 0;
    const externalDecisions = decisions.filter(d => d.provider !== 'youtube' && !activatedProviders.includes(d.provider));
    externalDecisions.sort((a, b) => {
      const scoreA = routingMode === 'dynamic' ? (a.dynamicScore || a.score) : a.staticFit;
      const scoreB = routingMode === 'dynamic' ? (b.dynamicScore || b.score) : b.staticFit;
      return scoreB - scoreA;
    });

    // Desactivar todos
    decisions.forEach(d => { d.shouldActivate = false; d.tier = 'skip'; });

    externalDecisions.forEach(d => {
      if (fallbackCount < FALLBACK_BUDGET) {
        d.shouldActivate = true;
        d.tier = 'fallback';
        d.reason = 'General fallback — post-routing';
        d.fallbackActivated = true;
        fallbackCount++;
      }
    });
  }

  if (import.meta.env.DEV) {
      const tag = isFallback ? '[GENERAL FALLBACK]' : '[Normal]';
      console.group(`[CapabilityRouter] ${tag} "${query.rawQuery}" intent=${primaryIntent} conf=${confidence} mode=${routingMode}`);
      
      decisions.forEach(d => {
        const mark = d.shouldActivate ? '✅' : '❌';
        console.log(`\n${mark} ${d.provider.toUpperCase()}`);
        console.log(`  Static Fit            ${d.staticFit}`);
        
        if (d.utilitySource === 'TELEMETRY') {
          console.log(`  Learned Utility       ${d.learnedUtility}`);
          console.log(`  Utility Source        ${d.utilitySource}`);
          console.log(`  Sample Size           ${d.sampleSize}`);
          console.log(`  Learning Confidence   ${d.learningConfidence}`);
          console.log(`  Learned Weight        ${d.learnedWeight}%`);
        } else {
          console.log(`  Learned Utility       (No data)`);
        }
        
        console.log(`  Health                ${d.healthScore}`);
        console.log(`  Health Multiplier     ${(d.healthScore/100).toFixed(2)}`);
        console.log(`  Dynamic Score         ${d.dynamicScore || d.score}`);
        console.log(`  Tier                  ${d.tier}`);
      });
      console.groupEnd();
    }

  return decisions;
}

function logShadowDecision(
  requestId: string,
  query: SearchQuery,
  intent: QueryUnderstanding | undefined,
  staticDecisions: RouterDecision[],
  dynamicDecisions: RouterDecision[]
) {
  const staticProviders = staticDecisions.filter(d => d.shouldActivate).map(d => d.provider);
  const dynamicProviders = dynamicDecisions.filter(d => d.shouldActivate).map(d => d.provider);
  
  // They disagreed if the sorted provider lists are different
  const disagreed = staticProviders.slice().sort().join(',') !== dynamicProviders.slice().sort().join(',');
  
  const staticScoreSum = staticDecisions.filter(d => d.shouldActivate).reduce((sum, d) => sum + d.score, 0);
  const dynamicScoreSum = dynamicDecisions.filter(d => d.shouldActivate).reduce((sum, d) => sum + d.score, 0);
  const predictedUtilityLift = Math.round((dynamicScoreSum - staticScoreSum) * 10) / 10;
  
  const queryContext = {
    intent: intent?.primaryIntent || 'UNKNOWN',
    topic: intent?.topics?.[0] || '',
    format: 'video', // default for now
    freshness: query.freshness || 'any',
    language: 'es' // default for now
  };
  
  Promise.resolve().then(async () => {
    try {
      const { supabase } = await import('../supabase');
      await supabase.from('shadow_routing_logs').insert({
        request_id: requestId,
        query_context: queryContext,
        static_providers: staticProviders,
        dynamic_providers: dynamicProviders,
        static_decision: staticDecisions.filter(d => d.shouldActivate).map(d => ({
          provider: d.provider,
          staticFit: d.staticFit,
          learnedUtility: d.learnedUtility,
          learnedWeight: d.learnedWeight,
          sampleSize: d.sampleSize,
          confidence: d.learningConfidence,
          health: d.healthScore,
          finalScore: d.score,
          exploration: d.exploration
        })),
        dynamic_decision: dynamicDecisions.filter(d => d.shouldActivate).map(d => ({
          provider: d.provider,
          staticFit: d.staticFit,
          learnedUtility: d.learnedUtility,
          learnedWeight: d.learnedWeight,
          sampleSize: d.sampleSize,
          confidence: d.learningConfidence,
          health: d.healthScore,
          finalScore: d.score,
          exploration: d.exploration
        })),
        disagreed,
        predicted_utility_lift: predictedUtilityLift,
        router_version: 'v1',
        ranking_version: 'v1',
        exploration_triggered: staticDecisions.some(d => d.exploration),
        fallback_triggered: staticDecisions.some(d => d.fallbackActivated)
      });
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[CapabilityRouter] Failed to log shadow decision:', e);
    }
  });
}

function buildReason(provider: string, score: number, caps: QueryCapabilities): string {
  if (score >= 80) return 'Excellent match';
  if (score >= 60) return 'Good match';
  if (score >= 40) return 'Moderate match';
  if (score >= 20) return 'Low match';
  return 'Not recommended';
}

export { detectQueryCapabilities as getQueryCapabilities };
