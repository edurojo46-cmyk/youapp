import type { SearchQuery, ContentItem } from './types';
import { localProvider } from './providers/localProvider';
import { supabaseProvider } from './providers/supabaseProvider';

export interface RetrievalOptions {
  signal?: AbortSignal;
}

export async function retrieveInternalCandidates(
  query: SearchQuery, 
  options?: RetrievalOptions
): Promise<{ candidates: ContentItem[], error?: string }> {
  try {
    const [localItems, supabaseItems] = await Promise.all([
      localProvider.search(query, { limit: 50, signal: options?.signal }),
      supabaseProvider.search(query, { limit: 100, signal: options?.signal })
    ]);
    return { candidates: [...localItems, ...supabaseItems] };
  } catch (err: any) {
    return { candidates: [], error: err.message };
  }
}


