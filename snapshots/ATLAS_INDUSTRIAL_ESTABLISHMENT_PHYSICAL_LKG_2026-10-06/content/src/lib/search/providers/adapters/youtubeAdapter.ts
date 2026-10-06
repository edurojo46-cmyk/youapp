import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';
import {
  requestSearch,
  reportSearchResult,
  extractSemanticAcquisitionCluster,
  recordRadarKnowledgeROI,
  getInFlightAcquisition,
  registerInFlightAcquisition
} from '../../../quotaBrain';

export class YouTubeAdapter implements ExternalAdapter {
  id = 'youtube';
  costTier = 'low' as const;
  monetaryCost = 0;
  quotaCost = 100;
  priority = 10;

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const startTime = Date.now();
      const { clusterKey } = extractSemanticAcquisitionCluster(query.rawQuery || query.normalizedQuery);

      // Si ya hay una adquisición en vuelo para este cluster semántico, nos unimos a ella
      const existingInFlight = getInFlightAcquisition(clusterKey);
      if (existingInFlight) {
        if (import.meta.env?.DEV) {
          console.log(`🔗 [YouTubeAdapter] Local Coalescing: uniéndose a adquisición in-flight para cluster "${clusterKey}"`);
        }
        return await existingInFlight;
      }

      // 1. Pedir permiso a QuotaBrain con evaluación de oportunidad y lock distribuido
      const permission = await requestSearch({
        query: query.rawQuery || query.normalizedQuery,
        caller: 'SearchEngine',
        reason: 'user_search',
        freshnessNeed: query.freshness === 'news' ? 85 : query.freshness === 'live' ? 100 : 25,
        demand: 50,
        reuseProbability: 65,
        atlasCoverage: 0,
        currentQualifiedCount: options?.currentQualifiedCount,
        avgQuality: options?.avgQuality,
        avgRelevance: options?.avgRelevance
      });

      if (!permission.authorized) {
        console.warn(`[YouTubeAdapter] QuotaBrain denied search: ${permission.reason}`);
        // Devolvemos vacío. El buscador usará solo Atlas/Locales.
        return [];
      }

      if (permission.coalesced) {
        const inFlight = getInFlightAcquisition(clusterKey);
        if (inFlight) return await inFlight;
      }

      // 2. Ejecutar adquisición externa con registro single-flight
      const targetQuery = options?.intent?.subject && options.intent.subject.length >= 3
        ? options.intent.subject
        : (query.rawQuery || query.normalizedQuery || '');

      const acquisitionPromise = (async () => {
        const { data, error } = await (supabase.functions as any).invoke('external-search', {
          body: { 
            provider: 'youtube', 
            query: targetQuery, 
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

        let rawItems = (data.items || []) as any[];

        // Cheap Lexical Pre-Filter: si la búsqueda tiene conceptos requeridos, priorizar items que los contengan
        const reqConcepts = options?.intent?.requiredConcepts || [];
        if (reqConcepts.length >= 2) {
          const filtered = rawItems.filter((i: any) => {
            const t = (i.title || '').toLowerCase();
            const d = (i.description || '').toLowerCase();
            return reqConcepts.some(c => t.includes(c) || d.includes(c));
          });
          if (filtered.length > 0) {
            rawItems = filtered;
          }
        }
        
        // 3. Registrar los resultados devueltos (para telemetría y recency guard)
        const latencyMs = Date.now() - startTime;
        await reportSearchResult(permission.requestId, {
          resultsReceived: rawItems.length,
          latencyMs,
          query: query.rawQuery || query.normalizedQuery,
          clusterKey
        });


        // 4. Mapear y filtrar items válidos
        const validItems = rawItems.filter(item => {
          const id = item.providerContentId || item.id;
          return id && typeof id === 'string' && !id.includes('[object');
        });

        const mappedItems: ContentItem[] = validItems.map(item => ({
          id: item.id && typeof item.id === 'string' && !item.id.includes('[object') ? item.id : `yt_${item.providerContentId}`,
          provider: 'youtube',
          providerContentId: item.providerContentId,
          title: item.title,
          description: item.description,
          thumbnailUrl: item.thumbnailUrl,
          thumbnail: item.thumbnailUrl,
          durationSeconds: item.durationSeconds || 900,
          channelTitle: item.creatorName,
          channelId: item.creatorId,
          publishedAt: item.publishedAt,
          embedUrl: item.embedUrl,
          canonicalUrl: item.canonicalUrl || `https://www.youtube.com/watch?v=${item.providerContentId}`,
          embeddable: item.embeddable !== false,
          retrievalSource: 'radar',
          type: item.type || 'video',
          contentState: item.contentState || 'vod',
          language: item.language || 'es',
          metadataCompleteness: item.metadataCompleteness || 85,
          metadataReadiness: item.metadataReadiness || 80,
          metadataProvenance: 'official_api',
          sourceVerified: true
        } as ContentItem));

        // 5. Absorber candidatos en youapp_index (Knowledge Yield) y registrar ROI
        let newToAtlas = 0;
        if (mappedItems.length > 0) {
          try {
            const ids = mappedItems.map(i => i.providerContentId);
            const { data: existing } = await supabase
              .from('youapp_index')
              .select('provider_content_id')
              .eq('provider', 'youtube')
              .in('provider_content_id', ids);
              
            const existingIds = new Set((existing || []).map(e => e.provider_content_id));
            const toInsert = mappedItems.filter(i => !existingIds.has(i.providerContentId));
            newToAtlas = toInsert.length;
            
            if (toInsert.length > 0) {
              const { error } = await supabase.from('youapp_index').insert(
                toInsert.map(item => ({
                  provider: item.provider || 'youtube',
                  provider_content_id: item.providerContentId,
                  video_id: item.providerContentId,
                  title: item.title,
                  description: item.description,
                  thumbnail: item.thumbnail,
                  url: item.canonicalUrl,
                  creator_id: item.channelId,
                  creator_name: item.channelTitle,
                  duration_seconds: item.durationSeconds,
                  published_at: item.publishedAt,
                  language: item.language,
                  source: 'radar',
                  content_state: 'discovered'
                }))
              );
              if (!error && import.meta.env?.DEV) {
                console.log(`🏛️ [YouTubeAdapter] Knowledge Yield: Absorbed ${newToAtlas} new radar candidates into Atlas (youapp_index)`);
              }
            }

            // Registrar ROI de Conocimiento Adquirido
            await recordRadarKnowledgeROI({
              clusterKey,
              requestId: permission.requestId,
              rawReturned: rawItems.length,
              uniqueCount: mappedItems.length,
              qualifiedCount: mappedItems.length,
              newToAtlas
            });
          } catch (error) {
            if (import.meta.env?.DEV) {
              console.warn('[YouTubeAdapter] Note: Could not insert radar candidates into youapp_index:', error);
            }
          }
        }

        return mappedItems;
      })();


      registerInFlightAcquisition(clusterKey, acquisitionPromise);
      return await acquisitionPromise;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        console.warn("[YouTubeAdapter] Request aborted by timeout.");
        throw err;
      }
      if (import.meta.env?.DEV) console.error('[YouTubeAdapter] Search failed:', err);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {

    return true;
  }
}

export const youtubeAdapter = new YouTubeAdapter();
