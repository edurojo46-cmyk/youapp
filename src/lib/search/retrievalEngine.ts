import type { SearchQuery, ContentItem } from './types';
import { localProvider } from './providers/localProvider';
import { supabaseProvider } from './providers/supabaseProvider';
import { youtubeProvider } from './providers/youtubeProvider';
import { mockYoutubeProvider } from './providers/mockYoutubeProvider';
import { normalizeItems } from './normalizationEngine';
import { deduplicateItems } from './deduplicationEngine';
import { trackSearchEvent } from './telemetry';

const MIN_CANDIDATES = 40;
const EXTERNAL_TIMEOUT_MS = 3500;

export async function retrieveCandidates(query: SearchQuery): Promise<{ candidates: ContentItem[], externalUsed: boolean, externalLatency: number, error?: string }> {
  const startTime = Date.now();
  let rawCandidates: ContentItem[] = [];
  
  let externalUsed = false;
  let externalLatency = 0;
  let errorMsg: string | undefined = undefined;

  // 1. Local + Supabase (Quick fetch)
  const [localItems, supabaseItems] = await Promise.all([
    localProvider.search(query, { limit: 50 }),
    supabaseProvider.search(query, { limit: 50 })
  ]);
  
  rawCandidates = [...localItems, ...supabaseItems];

  // Quick Normalize & Deduplicate for Eligibility Check
  let eligibleCandidates = deduplicateItems(normalizeItems(rawCandidates));

  // 2. Eligibility Check
  if (eligibleCandidates.length >= MIN_CANDIDATES && !query.forceExternal) {
    return { candidates: eligibleCandidates, externalUsed, externalLatency };
  }

  // 3. Fallback: External Search
  externalUsed = true;
  const externalStartTime = Date.now();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_TIMEOUT_MS);

  try {
    let externalItems: ContentItem[] = [];
    
    if (import.meta.env.DEV && import.meta.env.VITE_USE_EXTERNAL_SEARCH === 'false') {
      externalItems = await mockYoutubeProvider.search(query);
    } else {
      externalItems = await youtubeProvider.search(query, { 
        limit: 50,
        signal: controller.signal
      });
    }
    
    rawCandidates = [...eligibleCandidates, ...externalItems];
    // Re-deduplicate just in case external brought something we already had
    eligibleCandidates = deduplicateItems(normalizeItems(rawCandidates));
  } catch (err: any) {
    if (err.name === 'AbortError') {
      errorMsg = 'timeout';
    } else if (err.message?.includes('429')) {
      errorMsg = 'rate_limit';
    } else {
      errorMsg = 'external_failed';
    }
    // We swallow the error and just return whatever we had from local/supabase
  } finally {
    clearTimeout(timeoutId);
    externalLatency = Date.now() - externalStartTime;
  }

  return { candidates: eligibleCandidates, externalUsed, externalLatency, error: errorMsg };
}
