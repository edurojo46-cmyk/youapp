/**
 * dailymotionAdapter.ts — Multi-Provider Gold V2: Dailymotion Direct Adapter
 *
 * - 0 YouTube Search Quota Cost
 * - Datos públicos de la API de Dailymotion (con fallback directo resiliente)
 * - Normaliza a ContentItem con embedUrl oficial y retrievalSource='dailymotion-api'
 */

import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';

const DM_FIELDS = [
  'id', 'title', 'description', 'duration', 'created_time',
  'thumbnail_480_url', 'thumbnail_360_url', 'thumbnail_url',
  'owner', 'channel', 'language', 'allow_embed', 'onair',
  'views_total', 'likes_total'
].join(',');

export class DailymotionAdapter implements ExternalAdapter {
  id = 'dailymotion';
  costTier = 'free' as const;   // 0 YouTube quota — no pasa por QuotaBrain para Radar
  monetaryCost = 0;
  quotaCost = 0;
  priority = 7;                 // Nivel 2: Proveedor alternativo

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const targetQuery = options?.intent?.subject && options.intent.subject.length >= 3
        ? options.intent.subject
        : (query.rawQuery || query.normalizedQuery || '');

      let rawItems: any[] = [];

      // 1. Intentar via Edge Function `dailymotion-provider`
      try {
        const { data, error } = await (supabase.functions as any).invoke('dailymotion-provider', {
          body: {
            action: 'search',
            query: targetQuery,
            limit: options?.limit || 20,
            ingest: true
          },
          signal: options?.signal
        });

        if (!error && data?.items?.length) {
          rawItems = data.items;
        }
      } catch (err) {
        if (import.meta.env?.DEV) console.warn('[DailymotionAdapter] Edge Function failed, trying direct public API:', err);
      }

      // 2. Fallback Directo a la API pública de Dailymotion (si Edge Function falló o retornó vacío)
      if (rawItems.length === 0) {
        try {
          const params = new URLSearchParams({
            search: targetQuery,
            fields: DM_FIELDS,
            limit: String(Math.min(options?.limit || 20, 50)),
            sort: 'relevance'
          });

          const res = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`, {
            signal: options?.signal || AbortSignal.timeout(6000)
          });

          if (res.ok) {
            const data = await res.json();
            rawItems = (data.list || []).map((item: any) => {
              const videoId = item.id || '';
              const embedUrl = `https://www.dailymotion.com/embed/video/${videoId}`;
              const publishedAt = item.created_time
                ? new Date(item.created_time * 1000).toISOString()
                : null;

              return {
                id: `dm_${videoId}`,
                providerContentId: videoId,
                title: item.title || 'Sin título',
                description: item.description || '',
                creatorName: item.owner?.screenname || item.channel || 'Dailymotion Creator',
                creatorId: item.owner?.id,
                canonicalUrl: `https://www.dailymotion.com/video/${videoId}`,
                embedUrl,
                thumbnailUrl: item.thumbnail_480_url || item.thumbnail_360_url || item.thumbnail_url,
                publishedAt,
                durationSeconds: item.duration || 0,
                language: item.language || 'es',
                contentState: item.onair ? 'live' : 'vod',
                embeddable: item.allow_embed !== false,
                metadataCompleteness: item.description ? 75 : 55,
                metadataReadiness: publishedAt ? 70 : 50,
                viewCount: item.views_total || 0
              };
            });
          }
        } catch (directErr: any) {
          if (directErr.name === 'AbortError') throw directErr;
          if (import.meta.env?.DEV) console.warn('[DailymotionAdapter] Direct fetch failed:', directErr.message);
        }
      }

      if (rawItems.length === 0) {
        if (options?.providerStatuses) {
          options.providerStatuses['dailymotion'] = { status: 'no_results', results: 0 };
        }
        return [];
      }

      // Cheap Lexical Pre-Filter si hay conceptos requeridos
      const reqConcepts = options?.intent?.requiredConcepts || [];
      let filteredItems = rawItems;
      if (reqConcepts.length >= 2) {
        const matches = rawItems.filter((i: any) => {
          const t = (i.title || '').toLowerCase();
          const d = (i.description || '').toLowerCase();
          return reqConcepts.some(c => t.includes(c) || d.includes(c));
        });
        if (matches.length > 0) {
          filteredItems = matches;
        }
      }

      if (options?.providerStatuses) {
        options.providerStatuses['dailymotion'] = { status: 'success', results: filteredItems.length };
      }

      // Convertir a ContentItem
      return filteredItems.map((item: any) => ({
        id: item.id || `dm_${item.providerContentId}`,
        type: 'video' as const,
        title: item.title,
        description: item.description,
        thumbnail: item.thumbnailUrl || item.thumbnail,
        videoUrl: item.embedUrl || item.videoUrl,
        channelTitle: item.creatorName || item.channelTitle,
        channelId: item.creatorId || item.channelId,
        publishedText: item.publishedAt || item.publishedText,
        isLive: item.contentState === 'live' || item.isLive,
        isVerified: false,
        provider: 'dailymotion' as const,
        providerContentId: item.providerContentId,
        durationSeconds: item.durationSeconds,
        viewCount: item.viewCount || 0,
        publishedAt: item.publishedAt,
        contentState: item.contentState || 'vod',
        embeddable: item.embeddable !== false,
        language: item.language || 'es',
        metadataCompleteness: item.metadataCompleteness || 75,
        metadataReadiness: item.metadataReadiness || 70,
        metadataProvenance: 'official_api',
        canonicalUrl: item.canonicalUrl || `https://www.dailymotion.com/video/${item.providerContentId}`,
        embedUrl: item.embedUrl,
        source: {
          provider: 'dailymotion',
          discoveryMethod: 'dailymotion-api',
          discoveredAt: new Date().toISOString()
        },
        retrievalSource: 'dailymotion-api'
      } as ContentItem));

    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      if (import.meta.env?.DEV) console.warn('[DailymotionAdapter] Exception:', e.message);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const dailymotionAdapter = new DailymotionAdapter();
