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
        throw new Error(`Edge Function error: ${error.message}`);
      }

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
        retrievalSource: 'radar'
      }));

      // Fire and forget: Absorb the 50 Radar candidates into youapp_index as "discovered"
      if (mappedItems.length > 0) {
        // Ejecutamos upsert automático como parte de RadarPlanner
        supabase.from('youapp_index').upsert(
          mappedItems.map(item => ({
            provider: item.provider || 'youtube',
            provider_content_id: item.providerContentId,
            title: item.title,
            description: item.description,
            thumbnail: item.thumbnail,
            url: item.url,
            creator_id: item.channelId,
            creator_name: item.channelTitle,
            duration_seconds: item.durationSeconds,
            published_at: item.publishedAt,
            language: item.language,
            source: 'radar',
            // Default fields that align with Atlas V1 schema
            content_state: 'discovered',
            intent_fit: null,
            content_format: 'unknown'
          })),
          { onConflict: 'provider,provider_content_id', ignoreDuplicates: true } // ignoreDuplicates para no pisar campos enriquecidos si ya existían
        ).then(({ error }) => {
          if (error && import.meta.env.DEV) {
            console.error('[YouTubeAdapter] Failed to absorb radar candidates into index:', error);
          } else if (import.meta.env.DEV) {
            console.log(`[YouTubeAdapter] Absorbed ${mappedItems.length} radar candidates into youapp_index`);
          }
        });
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
