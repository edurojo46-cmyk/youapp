import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { UNIVERSAL_CATALOG } from '../../universalChannels';
// Mover MEGA_CATALOG_ITEMS a un archivo separado, pero por ahora podemos importarlo o definirlo aquí.
import { getLevenshteinDistance } from '../queryEngine'; // Lo implementaremos pronto

// Copiamos o importamos MEGA_CATALOG_ITEMS (aquí lo abstraemos para simplificar, 
// idealmente debería moverse a un data/catalog.ts, pero lo pondremos directo para migración rápida)
import { MEGA_CATALOG_ITEMS } from '../../youtubeSearchEngine'; // Todavía no hemos borrado el archivo. Espera, mejor lo muevo.

export class LocalProvider implements SearchProvider {
  name = 'local';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    const qLower = query.normalizedQuery;
    
    let matchedMega = null;
    let bestMatchScore = Infinity;

    for (const item of MEGA_CATALOG_ITEMS) {
      for (const kw of item.keywords) {
        if (qLower.includes(kw) || kw.includes(qLower)) {
          matchedMega = item;
          bestMatchScore = 0;
          break;
        }
        if (Math.abs(qLower.length - kw.length) <= 3) {
          const distance = getLevenshteinDistance(qLower, kw);
          const maxErrors = kw.length > 8 ? 3 : 2;
          if (distance <= maxErrors && distance < bestMatchScore) {
            bestMatchScore = distance;
            matchedMega = item;
          }
        }
      }
      if (bestMatchScore === 0) break;
    }

    if (!matchedMega) return [];

    const directVideos = matchedMega.videos.map((v: any) => ({
      ...v,
      provider: v.provider || 'youtube',
      source: { provider: 'youtube', discoveryMethod: 'local-catalog', discoveredAt: new Date().toISOString() }
    }));
    
    return directVideos as ContentItem[];
  }
}

export const localProvider = new LocalProvider();
