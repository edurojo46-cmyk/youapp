import type { SearchQuery, ContentItem } from '../types';
import type { ExternalAdapter, CostTier } from './index';
import { youtubeAdapter } from './adapters/youtubeAdapter';
import { vimeoAdapter } from './adapters/vimeoAdapter';
import { dailymotionAdapter } from './adapters/dailymotionAdapter';
import { publisherAdapter } from './adapters/publisherAdapter';
import { discoverAdapter } from './adapters/discoverAdapter';
import { videoMeshAdapter } from './adapters/videoMeshAdapter';
import { mockAdapter } from './adapters/mockAdapter';
import { normalizeItems } from '../normalizationEngine';
import { deduplicateItems } from '../deduplicationEngine';
import { calculateQualityScore } from '../qualityEngine';
import { calculateBaseRanking } from '../rankingEngine';
import { routeQuery, detectQueryCapabilities } from '../capabilityRouter';
import type { QueryUnderstanding } from '../intentDetector';


export const MIN_GOOD_CANDIDATES = 40;
export const TARGET_CANDIDATES = 50;

// ── Adapter id → CapabilityRouter provider name mapping ──────────────────────
// Los IDs de los adaptadores deben coincidir con las keys en PROVIDER_CAPABILITY_MATRIX
// 'video-mesh' usa el score de 'archive' como referencia primaria del Router.
// La decisión granular de activar peertube/twitch dentro del mesh se hace
// en el propio VideoMeshAdapter con quickSignals().
const ADAPTER_TO_ROUTER_ID: Record<string, string> = {
  'discover':     'discover',
  'publisher':    'publisher',
  'video-mesh':   'archive',      // mesh se activa cuando archive score ≥ threshold
  'vimeo':        'vimeo',
  'dailymotion':  'dailymotion',
  'youtube':      'youtube',
  'mock':         'atlas',
};

// ── Router threshold — adaptadores con score menor a esto se saltan ───────────
const ROUTER_THRESHOLD = 30;

// ── Todos los adaptadores registrados ────────────────────────────────────────
const registeredAdapters: ExternalAdapter[] = [
  discoverAdapter,       // 🌐 Discover — costTier: 'free', priority: 2
  publisherAdapter,      // 📰 Publishers — costTier: 'free', priority: 3
  videoMeshAdapter,      // 🏛 Archive+PeerTube+Twitch — costTier: 'free', priority: 4
  vimeoAdapter,          // 🎬 Vimeo — costTier: 'free', priority: 5
  dailymotionAdapter,    // 📺 Dailymotion — costTier: 'free', priority: 7
  youtubeAdapter,        // 🔭 Radar — costTier: 'low',  priority: 10
  mockAdapter
];

const tierOrder: Record<CostTier, number> = {
  free: 1,
  low: 2,
  medium: 3,
  high: 4
};

export class ExternalOrchestrator {
  async search(
    query: SearchQuery,
    existingCandidates: ContentItem[],
    options?: {
      signal?: AbortSignal,
      intent?: QueryUnderstanding,
      providerStatuses?: Record<string, { status: string; results: number }>,
      routerDecisionsOut?: { decisions: any[] },
      routingMode?: 'static' | 'shadow' | 'dynamic' | 'all',
      utilitySource?: any,
      fallbackOptions?: { isFallback?: boolean; activatedProviders?: string[]; requestId?: string; explicitNameRecovery?: boolean },
      excludeProviders?: string[],
      forceProviders?: string[]
    }
  ): Promise<ContentItem[]> {
    const signal = options?.signal;
    const intent = options?.intent;
    const providerStatuses = options?.providerStatuses;
    const routerDecisionsOut = options?.routerDecisionsOut;
    const routingMode = options?.routingMode || 'shadow';
    const utilitySource = options?.utilitySource;
    const fallbackOptions = options?.fallbackOptions;

    let candidates = [...existingCandidates];

    // 1. Decidir qué proveedores externos consultar usando el nuevo parámetro
    const routerDecisions = routeQuery(query, intent, ROUTER_THRESHOLD, routingMode, utilitySource, fallbackOptions);
    if (routerDecisionsOut) routerDecisionsOut.decisions = routerDecisions;
    const routerScoreMap = new Map(routerDecisions.map(d => [d.provider, d]));

    if (import.meta.env?.DEV) {
      console.group('[CapabilityRouter] Decisiones para:', query.rawQuery);
      routerDecisions.forEach(d => {
        const emoji = d.shouldActivate ? '✅' : '❌';
        console.log(`${emoji} ${d.provider.padEnd(15)} score=${d.score}  ${d.reason}`);
      });
      console.groupEnd();
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Obtener adaptadores disponibles
    const availableAdapters = (await Promise.all(
      registeredAdapters.map(async adapter => ({
        adapter,
        isAvailable: await adapter.isAvailable()
      }))
    ))
    .filter(a => a.isAvailable)
    .map(a => a.adapter);

    let adaptersToRun = availableAdapters;
    if (options?.forceProviders) {
      adaptersToRun = adaptersToRun.filter(a => options.forceProviders!.includes(a.id));
    }
    if (options?.excludeProviders) {
      adaptersToRun = adaptersToRun.filter(a => !options.excludeProviders!.includes(a.id));
    }

    // ── LEVEL 2: ALTERNATIVE PROVIDER PROBE (Zero YouTube Quota Cost) ───────
    // Los adaptadores de costo 'free' y 'low' (Vimeo, Dailymotion, Archive) se incluyen
    // en el probe progresivo para intentar resolver la consulta ANTES de quemar cuota de YouTube Radar.
    if (!options?.forceProviders && routingMode !== 'static') {
      adaptersToRun = adaptersToRun.filter(adapter => {
        const routerId = ADAPTER_TO_ROUTER_ID[adapter.id] ?? adapter.id;
        const decision = routerScoreMap.get(routerId);
        
        // Adaptadores de nivel 2 (Zero YouTube Search Cost): se prueban progresivamente si están disponibles
        if (adapter.costTier === 'free' || adapter.costTier === 'low') {
          // Si el router lo activó explícitamente O si no está en circuito abierto
          return decision?.reason !== 'Circuit Open';
        }
        
        if (!decision) return true;
        return decision.shouldActivate;
      });
    }


    // Agrupar por tier
    const adaptersByTier: Record<CostTier, ExternalAdapter[]> = {
      free: [],
      low: [],
      medium: [],
      high: []
    };

    for (const adapter of adaptersToRun) {
      adaptersByTier[adapter.costTier].push(adapter);
    }

    // Ordenar los tiers a iterar
    const sortedTiers = (Object.keys(adaptersByTier) as CostTier[]).sort((a, b) => tierOrder[a] - tierOrder[b]);

    // Progressive Fallback por Tier
    for (const tier of sortedTiers) {
      const tierAdapters = adaptersByTier[tier];
      if (tierAdapters.length === 0) continue;

      // Ordenar dentro del tier por score del Router (mayor score = mayor prioridad)
      tierAdapters.sort((a, b) => {
        const routerIdA = ADAPTER_TO_ROUTER_ID[a.id] ?? a.id;
        const routerIdB = ADAPTER_TO_ROUTER_ID[b.id] ?? b.id;
        const scoreA = routerScoreMap.get(routerIdA)?.score ?? a.priority;
        const scoreB = routerScoreMap.get(routerIdB)?.score ?? a.priority;
        return scoreB - scoreA; // Mayor score primero
      });

      // Calcular suficiencia actual acumulada
      const currentScored = calculateQualityScore(calculateBaseRanking(candidates, query, options?.intent));
      const currentQualified = currentScored.filter(c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40);
      const avgQuality = currentQualified.length > 0
        ? currentQualified.reduce((acc, c) => acc + (c.qualityScore || 0), 0) / currentQualified.length
        : 0;
      const avgRelevance = currentQualified.length > 0
        ? currentQualified.reduce((acc, c) => acc + (c.relevanceScore || 0), 0) / currentQualified.length
        : 0;

      // Ejecutar en paralelo dentro del mismo tier con Timeout individual (Provider Deadline: 1200ms)
      const promises = tierAdapters.map(adapter => {
        // Combinar señal global con timeout individual por proveedor
        const adapterTimeoutSignal = AbortSignal.timeout(1200);
        return adapter.search(query, {
          limit: TARGET_CANDIDATES,
          signal: signal || adapterTimeoutSignal,
          providerStatuses,
          currentQualifiedCount: currentQualified.length,
          avgQuality,
          avgRelevance,
          intent: options?.intent
        }).then(res => {
          if (providerStatuses && !providerStatuses[adapter.id]) {
            providerStatuses[adapter.id] = { status: res.length > 0 ? 'success' : 'no_results', results: res.length };
          }
          return res;
        }).catch(err => {
          if (import.meta.env?.DEV) console.error(`[ExternalSearch] Adapter ${adapter.id} failed/timed out:`, err?.message || err);
          if (providerStatuses && !providerStatuses[adapter.id]) {
             providerStatuses[adapter.id] = { status: err?.name === 'TimeoutError' ? 'timeout' : 'adapter_error', results: 0 };
          }
          return [] as ContentItem[];
        });
      });

      const settledResults = await Promise.allSettled(promises);
      const newResults = settledResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);

      // Merge y Deduplicación
      candidates = deduplicateItems(normalizeItems([...candidates, ...newResults]));

      // ── PROGRESSIVE PROBE QUALIFIED GATE (Invariant: Q>=60 && R>=40) ──────────
      // Early Sufficiency: Si tenemos >= 6 candidatos calificados de alta calidad,
      // la búsqueda se resuelve de inmediato sin esperar tiers posteriores.
      // Si estamos en explicitNameRecovery, buscamos mínimo 12 resultados calificados.
      const scoredSoFar = calculateQualityScore(calculateBaseRanking(candidates, query, options?.intent));
      const qualifiedSoFar = scoredSoFar.filter(c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40);

      const requiredEarlyStop = fallbackOptions?.explicitNameRecovery ? 12 : 6;

      if (qualifiedSoFar.length >= requiredEarlyStop) {
        if (import.meta.env?.DEV) {
          console.log(`[ExternalSearch] ✅ ${qualifiedSoFar.length} candidatos CUALIFICADOS (Q>=60, R>=40) en tier "${tier}". Siguientes tiers (incluido Radar) omitidos.`);
        }
        break;
      } else {
        if (import.meta.env?.DEV) {
          console.log(`[ExternalSearch] ⚠️ Tier "${tier}" entregó ${candidates.length} brutos pero solo ${qualifiedSoFar.length}/${requiredEarlyStop} cualificados. Continuando a siguiente tier...`);
        }
      }

    }

    return candidates;
  }
}


export const externalSearch = new ExternalOrchestrator();
