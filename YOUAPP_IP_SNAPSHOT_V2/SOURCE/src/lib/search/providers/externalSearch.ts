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
      fallbackOptions?: { isFallback?: boolean; activatedProviders?: string[]; requestId?: string },
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

    if (import.meta.env.DEV) {
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

    // Identificar cuáles correr en base a routerDecisions (excepto si están forced)
    if (!options?.forceProviders && routingMode !== 'static') {
      adaptersToRun = adaptersToRun.filter(adapter => {
        const routerId = ADAPTER_TO_ROUTER_ID[adapter.id] ?? adapter.id;
        const decision = routerScoreMap.get(routerId);
        if (!decision) return true; // Si no está en la matrix, lo dejamos pasar
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

      // Ejecutar en paralelo dentro del mismo tier
      const promises = tierAdapters.map(adapter =>
        adapter.search(query, { limit: TARGET_CANDIDATES, signal, providerStatuses }).then(res => {
          if (providerStatuses && !providerStatuses[adapter.id]) {
            providerStatuses[adapter.id] = { status: res.length > 0 ? 'success' : 'no_results', results: res.length };
          }
          return res;
        }).catch(err => {
          if (import.meta.env.DEV) console.error(`[ExternalSearch] Adapter ${adapter.id} failed:`, err);
          if (providerStatuses && !providerStatuses[adapter.id]) {
             providerStatuses[adapter.id] = { status: 'adapter_error', results: 0 };
          }
          return [] as ContentItem[];
        })
      );

      const resultsArray = await Promise.all(promises);
      const newResults = resultsArray.flat();

      // Merge y Deduplicación
      candidates = deduplicateItems(normalizeItems([...candidates, ...newResults]));

      // Comprobar si alcanzamos el mínimo de calidad
      if (candidates.length >= MIN_GOOD_CANDIDATES) {
        if (import.meta.env.DEV) {
          console.log(`[ExternalSearch] ✅ ${candidates.length} candidatos en tier "${tier}". YouTube Radar omitido.`);
        }
        break; // Stop progressive fallback — YouTube Radar no necesario
      }
    }

    return candidates;
  }
}

export const externalSearch = new ExternalOrchestrator();
