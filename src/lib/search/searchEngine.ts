import type { SearchQuery, ContentItem, CandidatePool, CandidateRef } from './types';
import { parseQuery } from './queryEngine';
import { retrieveCandidates } from './retrievalEngine';
import { calculateQualityScore } from './qualityEngine';
import { calculateRelevanceAndYouScore } from './rankingEngine';
import { applyPersonalization } from './personalizationEngine';
import { getCandidatePool, saveCandidatePool, getCatalogItems, saveCatalogItems } from './cache/indexedDb';
import { trackSearchEvent } from './telemetry';

export async function executeSearch(rawQuery: string, forceExternal = false): Promise<{ all: ContentItem[], videos: ContentItem[], channels: ContentItem[] }> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID(); // Unique ID para la trazabilidad completa
  
  if (!rawQuery.trim()) return { all: [], videos: [], channels: [] };

  const query = parseQuery(rawQuery);
  query.forceExternal = forceExternal;
  
  trackSearchEvent('search_started', { request_id: requestId, query_normalized: query.normalizedQuery });

  let pool: CandidatePool | null = null;
  let candidates: ContentItem[] = [];
  
  let externalUsed = false;
  let externalLatency = 0;
  let errorCode: string | undefined = undefined;

  if (!forceExternal) {
    pool = await getCandidatePool(query.normalizedQuery);
    if (pool) {
      // Re-hydrate full items from catalog
      const cachedIds = pool.candidates.map(c => c.contentId);
      candidates = await getCatalogItems(cachedIds);
      
      // Merge scores from ref back to items (optional, but good for personalization)
      const scoreMap = new Map<string, CandidateRef>(pool.candidates.map(c => [c.contentId, c]));
      candidates = candidates.map(c => {
         const ref = scoreMap.get(c.id);
         return {
           ...c,
           qualityScore: ref?.qualityScore || c.qualityScore,
           relevanceScore: ref?.relevanceScore || c.relevanceScore,
           youScore: ref?.youScore || c.youScore
         };
      });

      trackSearchEvent('cache_hit', { request_id: requestId, cache_source: 'indexeddb', result_count: candidates.length });
    } else {
      trackSearchEvent('cache_miss', { request_id: requestId, query_normalized: query.normalizedQuery });
    }
  }

  if (!pool || candidates.length === 0) {
    // 1. Retrieval Engine (Incluye Normalize y Deduplicate)
    const retrieval = await retrieveCandidates(query);
    candidates = retrieval.candidates; // Ya vienen normalizados y deduplicados
    externalUsed = retrieval.externalUsed;
    externalLatency = retrieval.externalLatency;
    errorCode = retrieval.error;

    // 2. Quality Engine
    candidates = calculateQualityScore(candidates);

    // 3. Ranking Engine (Relevance & YouScore)
    candidates = calculateRelevanceAndYouScore(candidates, query);

    // Guardar en Catalog completo
    await saveCatalogItems(candidates);

    // Guardar referencias en Candidate Pool (TTL semántico)
    let ttlMs = 7200000;
    if (query.freshness === 'live' || query.freshness === 'news') ttlMs = 1800000;
    else if (query.freshness === 'evergreen') ttlMs = 86400000;

    const refs: CandidateRef[] = candidates.map(c => ({
      contentId: c.id,
      relevanceScore: c.relevanceScore,
      qualityScore: c.qualityScore,
      youScore: c.youScore
    }));

    pool = {
      normalizedQuery: query.normalizedQuery,
      candidates: refs,
      queryVersion: 1,
      qualityVersion: 1,
      rankingVersion: 1,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    };

    await saveCandidatePool(pool);
  }

  // 4. Personalization Engine (Mi Algoritmo)
  const personalizedTop20 = applyPersonalization([...candidates]).slice(0, 20);

  const videos = personalizedTop20.filter(c => c.type === 'video');
  const channels = personalizedTop20.filter(c => c.type === 'channel' || c.type === 'playlist');

  const totalLatency = Date.now() - startTime;

  trackSearchEvent('results_shown', { 
    request_id: requestId,
    result_count: personalizedTop20.length, 
    latency_ms: totalLatency
  });

  // Evento de Cierre (search_completed)
  trackSearchEvent('search_completed', {
    request_id: requestId,
    query_normalized: query.normalizedQuery,
    candidate_count: pool?.candidates.length || 0, // Total
    eligible_count: candidates.length, // Ya depurados
    result_count: personalizedTop20.length,
    external_used: externalUsed,
    external_latency_ms: externalLatency,
    latency_ms: totalLatency,
    success: errorCode === undefined,
    error_code: errorCode
  });

  return {
    all: personalizedTop20,
    videos,
    channels
  };
}
