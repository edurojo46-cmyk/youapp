/**
 * vimeoAdapter.ts — Fase 6: Vimeo como proveedor de primera clase
 *
 * - 0 YouTube Search Quota Cost
 * - API oficial de Vimeo con búsqueda de videos
 * - Normaliza a NormalizedVideo antes del ranking
 */

import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';
import { requestSearch } from '../../../quotaBrain';

export class VimeoAdapter implements ExternalAdapter {
  id = 'vimeo';
  costTier = 'low' as const;   // Vimeo has rate limits (e.g. 25 req/min on free tier)
  monetaryCost = 0;
  quotaCost = 0;
  priority = 5;                 // Mayor prioridad que YouTube (no gasta cuota)

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      // Vimeo no necesita pasar por QuotaBrain porque no gasta cuota de YouTube.
      // Pero registramos el intento para telemetría de Independence Rate.
      const logged = await requestSearch({
        query: query.rawQuery,
        caller: 'SearchEngine',
        reason: 'user_search',
        atlasCoverage: 50,    // estimado — Vimeo es un proveedor externo alternativo
        freshnessNeed: query.freshness === 'news' ? 70 : query.freshness === 'live' ? 100 : 30,
        demand: 50,
        reuseProbability: 60
      }).catch(() => ({ authorized: true, requestId: 'vimeo-no-log', budgetRemaining: 80 }));

      // Vimeo no pasa por QuotaBrain de YouTube — siempre procede
      // (el requestSearch de arriba es solo para telemetría de Atlas Coverage)

      const targetQuery = options?.intent?.subject && options.intent.subject.length >= 3
        ? options.intent.subject
        : (query.rawQuery || query.normalizedQuery || '');

      const { data, error } = await (supabase.functions as any).invoke('vimeo-provider', {
        body: {
          query: targetQuery,
          limit: options?.limit || 20,
          sort: query.freshness === 'news' ? 'latest' : 'relevant',
          ingest: true  // guardar en youapp_index para Atlas
        },

        signal: options?.signal
      });

      if (error) {
        if (import.meta.env?.DEV) console.warn('[VimeoAdapter] Edge function error:', error.message);
        if (options?.providerStatuses) {
          options.providerStatuses['vimeo'] = { status: 'provider_error', results: 0 };
        }
        return [];
      }
      
      if (data?.ok === false || data?.error) {
        let status = 'provider_error';
        const code = data?.code || '';
        const errStr = String(data?.error || code).toLowerCase();
        
        if (code === 'VIMEO_NOT_CONFIGURED' || errStr.includes('401') || errStr.includes('unauthorized') || errStr.includes('missing_credentials')) status = 'auth_error';
        else if (code === 'AUTH_FAILED' || errStr.includes('403') || errStr.includes('forbidden')) status = 'forbidden';
        else if (code === 'RATE_LIMITED' || errStr.includes('429') || errStr.includes('rate limit')) status = 'rate_limited';
        
        if (options?.providerStatuses) {
          options.providerStatuses['vimeo'] = { status, results: 0 };
        }
        if (import.meta.env?.DEV) console.warn(`[VimeoAdapter] API Error (${status}):`, data?.error || code);
        return [];
      }

      if (!data?.items?.length) {
        if (options?.providerStatuses) {
          options.providerStatuses['vimeo'] = { status: 'no_results', results: 0 };
        }
        return [];
      }
      
      // Cheap Lexical Pre-Filter: si la búsqueda tiene conceptos requeridos ("teología", "liberación"), priorizar items relevantes
      const reqConcepts = options?.intent?.requiredConcepts || [];
      let rawItems = data.items;
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
      
      if (options?.providerStatuses) {
        options.providerStatuses['vimeo'] = { status: 'success', results: rawItems.length };
      }

      // Convertir a ContentItem (compatible con el ranking actual)
      return rawItems.map((item: any) => ({
        id: item.id,
        type: 'video' as const,
        title: item.title,
        description: item.description,
        thumbnail: item.thumbnailUrl,
        videoUrl: item.embedUrl,
        channelTitle: item.creatorName,
        channelId: item.creatorId,
        publishedText: item.publishedAt,
        isLive: item.contentState === 'live',
        isVerified: false,
        provider: 'vimeo' as const,
        durationSeconds: item.durationSeconds,
        viewCount: item.viewCount || 0,
        publishedAt: item.publishedAt,
        contentState: item.contentState,
        embeddable: item.embeddable,
        language: item.language,
        metadataCompleteness: item.metadataCompleteness,
        metadataReadiness: item.metadataReadiness,
        source: {
          provider: 'vimeo',
          discoveryMethod: 'vimeo-api',
          discoveredAt: new Date().toISOString()
        },
        retrievalSource: 'vimeo-api',
        playbackPolicy: item.embeddable ? 'embed_allowed' : 'external_only'
      }));

    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      if (import.meta.env?.DEV) console.warn('[VimeoAdapter] Exception:', e.message);
      if (options?.providerStatuses && !options.providerStatuses['vimeo']) {
        options.providerStatuses['vimeo'] = { status: 'exception', results: 0 };
      }
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    // Vimeo está disponible si la Edge Function está desplegada
    // (la disponibilidad real se verifica en el primer request)
    return true;
  }
}

export const vimeoAdapter = new VimeoAdapter();
