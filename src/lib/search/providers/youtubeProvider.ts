import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { supabase } from '../../supabase';

export class YouTubeProvider implements SearchProvider {
  name = 'youtube';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const { data, error } = await (supabase.functions as any).invoke('external-search', {
        body: { 
          provider: 'youtube', 
          query: query.rawQuery, 
          limit: options?.limit || 20 
        },
        signal: options?.signal
      });

      if (error) {
        throw new Error(`Edge Function error: ${error.message}`);
      }

      return data as ContentItem[];
    } catch (e: any) {
      if (e.name === 'AbortError') {
         console.warn("[YouTubeProvider] Request aborted by timeout.");
         throw e;
      }
      console.warn("[YouTubeProvider] Exception:", e);
      throw e;
    }
  }
}

export const youtubeProvider = new YouTubeProvider();
