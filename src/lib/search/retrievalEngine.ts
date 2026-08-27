import type { SearchQuery, ContentItem } from './types';
import { localProvider } from './providers/localProvider';
import { supabaseProvider } from './providers/supabaseProvider';
import { youtubeProvider } from './providers/youtubeProvider';
import { trackSearchEvent } from './telemetry';

const MIN_CANDIDATES = 40;

export async function retrieveCandidates(query: SearchQuery): Promise<ContentItem[]> {
  const startTime = Date.now();
  let candidates: ContentItem[] = [];

  // 1. Local Provider (Catálogo Curado Duro)
  const localItems = await localProvider.search(query, { limit: 50 });
  candidates = [...localItems];

  if (candidates.length >= MIN_CANDIDATES && !query.forceExternal) {
    trackSearchEvent('cache_hit', { cache_source: 'local', result_count: candidates.length, latency_ms: Date.now() - startTime });
    return candidates;
  }

  // 2. Supabase Provider (Índice de YouApp)
  const supabaseItems = await supabaseProvider.search(query, { limit: 50 });
  candidates = [...candidates, ...supabaseItems];

  if (candidates.length >= MIN_CANDIDATES && !query.forceExternal) {
    trackSearchEvent('supabase_hit', { result_count: candidates.length, latency_ms: Date.now() - startTime });
    return candidates;
  }

  // 3. Fallback: External Provider (YouTube API)
  trackSearchEvent('external_search_started', { query_normalized: query.normalizedQuery });
  
  const externalItems = await youtubeProvider.search(query, { limit: 50 });
  candidates = [...candidates, ...externalItems];

  trackSearchEvent('external_search_completed', { result_count: externalItems.length, latency_ms: Date.now() - startTime });

  return candidates;
}
