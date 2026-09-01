import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';
import { requestSearch, reportSearchResult } from '../../../quotaBrain';

export class YouTubeAdapter implements ExternalAdapter {
  id = 'youtube';
  costTier = 'low' as const;
  monetaryCost = 0;
  quotaCost = 100;
  priority = 10;

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const startTime = Date.now();

      // 1. Pedir permiso a QuotaBrain antes de cualquier búsqueda externa
      const permission = await requestSearch({
        query: query.rawQuery,
        caller: 'SearchEngine',
        reason: 'user_search'
      });

      if (!permission.authorized) {
        console.warn(`[YouTubeAdapter] QuotaBrain denied search: ${permission.reason}`);
        // Devolvemos vacío. El buscador usará solo Atlas/Locales.
        return [];
      }

      // 2. Ejecutar búsqueda externa autorizada (🔭 Radar)
      const { data, error } = await (supabase.functions as any).invoke('external-search', {
        body: { 
          provider: 'youtube', 
          query: query.rawQuery, 
          limit: options?.limit || 20 
        },
        signal: options?.signal
      });

      if (error) {
        console.error(`[YouTubeAdapter] Edge function invocation error:`, error);
        throw new Error(`Edge Function error: ${error.message}`);
      }
      
      if (data && data.error) {
        console.error(`[YouTubeAdapter] Edge function returned business error:`, data.error);
        throw new Error(`Edge Function returned error: ${data.error}`);
      }
      
      console.log(`[YouTubeAdapter DEBUG] Edge function returned data:`, JSON.stringify(data, null, 2));

      const items = (data.items || []) as ContentItem[];
      
      // 3. Registrar los resultados devueltos (para telemetría)
      const latencyMs = Date.now() - startTime;
      await reportSearchResult(permission.requestId, {
        resultsReceived: items.length,
        latencyMs
      });
      
      // Aseguramos que la fuente de descubrimiento sea la correcta
      const mappedItems = items.map(item => ({
        ...item,
        retrievalSource: 'radar',
        durationSeconds: item.durationSeconds || 900 // Default 15 min since search.list doesn't return duration
      }));

      // Absorb the Radar candidates into youapp_index as "discovered"
      if (mappedItems.length > 0) {
        await (async () => {
          try {
            const ids = mappedItems.map(i => i.providerContentId);
            const { data: existing } = await supabase
              .from('youapp_index')
              .select('provider_content_id')
              .eq('provider', 'youtube')
              .in('provider_content_id', ids);
              
            const existingIds = new Set((existing || []).map(e => e.provider_content_id));
            
            const toInsert = mappedItems.filter(i => !existingIds.has(i.providerContentId));
            
            if (toInsert.length > 0) {
              const { error } = await supabase.from('youapp_index').insert(
                toInsert.map(item => ({
                  provider: item.provider || 'youtube',
                  provider_content_id: item.providerContentId,
                  video_id: item.providerContentId, // satisfy legacy not-null constraint
                  title: item.title,
                  description: item.description,
                  thumbnail: item.thumbnail,
                  url: item.canonicalUrl, // Fix: use canonicalUrl instead of url
                  creator_id: item.channelId,
                  creator_name: item.channelTitle,
                  duration_seconds: item.durationSeconds,
                  published_at: item.publishedAt,
                  language: item.language,
                  source: 'radar',
                  content_state: 'discovered'
                }))
              );
              if (error) throw error;
              
              if (import.meta.env.DEV) {
                console.log(`[YouTubeAdapter] Absorbed ${toInsert.length} radar candidates into youapp_index`);
              }
            }
          } catch (error) {
             if (import.meta.env.DEV) {
                console.error('[YouTubeAdapter] Failed to absorb radar candidates into index:', error);
             }
          }
        })();
      }
      
      return mappedItems;
      
    } catch (e: any) {
      if (e.name === 'AbortError') {
         console.warn("[YouTubeAdapter] Request aborted by timeout.");
         throw e;
      }
      console.warn("[YouTubeAdapter] Exception:", e);
      throw e;
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const youtubeAdapter = new YouTubeAdapter();
