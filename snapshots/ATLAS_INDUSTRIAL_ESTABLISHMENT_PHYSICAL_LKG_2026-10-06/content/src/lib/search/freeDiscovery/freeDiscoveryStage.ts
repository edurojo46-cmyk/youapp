import type { ContentItem, SearchQuery, QueryIntentData, SearchOptions } from '../types';
import type { FreeDiscoveryResult, FreeDiscoveryStats } from './freeDiscoveryTypes';
import { evaluateFreeDiscoveryCoverage } from './freeDiscoveryCoverage';
import { publisherVideoAdapter } from '../providers/adapters/publisherVideoAdapter';
import { normalizeItems } from '../normalizationEngine';
import { deduplicateItems } from '../deduplicationEngine';
import { calculateBaseRanking } from '../rankingEngine';
import { calculateQualityScore } from '../qualityEngine';

/**
 * freeDiscoveryStage.ts
 *
 * Etapa Pre-Router de Nivel 0 (Costo Cero / Fuentes Gratuitas).
 * Intenta resolver la búsqueda mediante medios periodísticos, feeds RSS,
 * video sitemaps y archivos institucionales antes de activar CapabilityRouter.
 */
export async function runFreeDiscoveryStage(
  query: SearchQuery,
  atlasCandidates: ContentItem[],
  intentData: QueryIntentData,
  options?: SearchOptions
): Promise<FreeDiscoveryResult> {
  const stats: FreeDiscoveryStats = {
    pagesFetched: 0,
    rawVideosFound: 0,
    uniqueVideos: 0,
    qualifiedVideos: 0,
    absorbedNew: 0,
    alreadyKnown: 0
  };

  try {
    // 1. Consultar Publisher Video Adapter
    const publisherCandidates = await publisherVideoAdapter.search(query, {
      signal: options?.signal,
      limit: options?.limit || 20
    });

    if (!publisherCandidates || publisherCandidates.length === 0) {
      return {
        passed: false,
        candidates: atlasCandidates,
        stats,
        radarAvoided: false
      };
    }

    stats.rawVideosFound = publisherCandidates.length;

    // 2. Normalizar
    const normalized = normalizeItems(publisherCandidates);

    // 3. Deduplicar combinando con Atlas existente
    const combined = deduplicateItems([...atlasCandidates, ...normalized]);
    stats.uniqueVideos = combined.length;

    // 4. Calcular Relevancia
    const withRelevance = calculateBaseRanking(combined, query, intentData);

    // 5. Calcular Calidad
    const withQuality = calculateQualityScore(withRelevance);

    // 6. Evaluar Cobertura (con invariante estricto Q >= 60, R >= 40)
    const evaluation = evaluateFreeDiscoveryCoverage(withQuality);
    stats.qualifiedVideos = evaluation.qualifiedCount;

    if (evaluation.passed && !options?.forceExternal) {
      if (import.meta.env?.DEV) {
        console.log(`📰 [Free Discovery Stage] Coverage Gate PASSED (${evaluation.qualifiedCount} qualified with Q>=60, R>=40). YouTube Radar avoided!`);
      }
      return {
        passed: true,
        candidates: withQuality,
        stats,
        radarAvoided: true
      };
    }

    if (import.meta.env?.DEV) {
      console.log(`📰 [Free Discovery Stage] Coverage Gate FAILED (${evaluation.reason}). Proceeding to CapabilityRouter.`);
    }

    return {
      passed: false,
      candidates: withQuality,
      stats,
      radarAvoided: false
    };

  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn('[FreeDiscoveryStage] Exception during free discovery:', err);
    }
    return {
      passed: false,
      candidates: atlasCandidates,
      stats,
      radarAvoided: false
    };
  }
}
