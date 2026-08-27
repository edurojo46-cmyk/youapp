import type { SearchQuery, ContentItem, CandidatePool } from './types';
import { parseQuery } from './queryEngine';
import { retrieveCandidates } from './retrievalEngine';
import { normalizeItems } from './normalizationEngine';
import { deduplicateItems } from './deduplicationEngine';
import { calculateQualityScore } from './qualityEngine';
import { calculateRelevanceAndYouScore } from './rankingEngine';
import { applyPersonalization } from './personalizationEngine';
import { getCandidatePool, saveCandidatePool } from './cache/indexedDb';
import { trackSearchEvent } from './telemetry';

export async function executeSearch(rawQuery: string, forceExternal = false): Promise<{ all: ContentItem[], videos: ContentItem[], channels: ContentItem[] }> {
  const startTime = Date.now();
  
  if (!rawQuery.trim()) return { all: [], videos: [], channels: [] };

  const query = parseQuery(rawQuery);
  query.forceExternal = forceExternal;
  
  trackSearchEvent('search_started', { query_normalized: query.normalizedQuery });

  let pool: CandidatePool | null = null;
  
  if (!forceExternal) {
    pool = await getCandidatePool(query.normalizedQuery);
    if (pool) {
      trackSearchEvent('cache_hit', { cache_source: 'indexeddb', result_count: pool.candidates.length });
    } else {
      trackSearchEvent('cache_miss', { query_normalized: query.normalizedQuery });
    }
  }

  if (!pool) {
    // 1. Retrieval Engine
    let candidates = await retrieveCandidates(query);

    // 2. Normalization Engine
    candidates = normalizeItems(candidates);

    // 3. Deduplication Engine
    candidates = deduplicateItems(candidates);

    // 4. Quality Engine
    candidates = calculateQualityScore(candidates);

    // 5. Ranking Engine (Relevance & YouScore)
    candidates = calculateRelevanceAndYouScore(candidates, query);

    // Guardar en Candidate Pool (TTL semántico)
    // Para simplificar, asumimos un TTL básico aquí. Se podría extender según query.freshness.
    let ttlMs = 7200000; // 2 horas por defecto
    if (query.freshness === 'live' || query.freshness === 'news') ttlMs = 1800000; // 30 min
    else if (query.freshness === 'evergreen') ttlMs = 86400000; // 24 horas

    pool = {
      normalizedQuery: query.normalizedQuery,
      candidates,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      sourceVersion: 2
    };

    await saveCandidatePool(pool);
  }

  // 6. Personalization Engine (Mi Algoritmo)
  const personalizedTop20 = applyPersonalization([...pool.candidates]).slice(0, 20);

  const videos = personalizedTop20.filter(c => c.type === 'video');
  const channels = personalizedTop20.filter(c => c.type === 'channel' || c.type === 'playlist');

  trackSearchEvent('results_shown', { 
    result_count: personalizedTop20.length, 
    latency_ms: Date.now() - startTime 
  });

  return {
    all: personalizedTop20,
    videos,
    channels
  };
}
