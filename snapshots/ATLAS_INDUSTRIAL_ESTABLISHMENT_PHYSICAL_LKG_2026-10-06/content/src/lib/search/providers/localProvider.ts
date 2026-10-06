import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { getCandidatePool, getCatalogItems } from '../cache/indexedDb';

export class LocalProvider implements SearchProvider {
  name = 'local';

  async search(query: SearchQuery, _options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const qNorm = query.normalizedQuery.toLowerCase().trim();
      if (!qNorm) return [];

      const pool = await getCandidatePool(qNorm);
      if (pool && pool.candidates && pool.candidates.length > 0) {
        const ids = pool.candidates.map(c => c.contentId);
        const items = await getCatalogItems(ids);
        return items.map(v => ({
          ...v,
          retrievalSource: 'cache' as const
        }));
      }
    } catch {
      // Non-blocking
    }
    return [];
  }
}

export const localProvider = new LocalProvider();
