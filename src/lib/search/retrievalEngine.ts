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
  let errorMsg: string | undefined = undefined;

  try {
    const [localItems, supabaseItems] = await Promise.all([
      localProvider.search(query, { limit: 50, signal: options?.signal }),
      supabaseProvider.search(query, { limit: 100, signal: options?.signal })
    ]);
    
    const rawCandidates = [...localItems, ...supabaseItems];
    return { candidates: rawCandidates };
  } catch (err: any) {
    if (import.meta.env.DEV) {
      console.error("[RetrievalEngine] Internal retrieval failed:", err);
    }
    errorMsg = err.message;
    return { candidates: [], error: errorMsg };
  }
}
