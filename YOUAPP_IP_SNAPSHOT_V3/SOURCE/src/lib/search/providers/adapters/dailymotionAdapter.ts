/**
 * dailymotionAdapter.ts — Fase 7: Dailymotion como proveedor de perfiles conocidos
 *
 * V1: Busca SOLO dentro de perfiles verificados en seed_sources (provider='dailymotion').
 * No usa búsqueda global (conservador hasta validar el endpoint legacy).
 *
 * - 0 YouTube Search Quota Cost
 * - Datos públicos de la API de Dailymotion
 * - Normaliza a NormalizedVideo antes del ranking
 */

import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';

export class DailymotionAdapter implements ExternalAdapter {
  id = 'dailymotion';
  costTier = 'free' as const;   // 0 YouTube quota — no pasa por QuotaBrain para Radar
  monetaryCost = 0;
  quotaCost = 0;
  priority = 7;                 // Entre Vimeo (5) y YouTube Radar (10)

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const { data, error } = await (supabase.functions as any).invoke('dailymotion-provider', {
        body: {
          action: 'search_profiles',
          query: query.rawQuery,
          limit: options?.limit || 20,
          ingest: true
        },
        signal: options?.signal
      });

      if (error) {
        if (import.meta.env.DEV) console.warn('[DailymotionAdapter] Edge function error:', error.message);
        return [];
      }

      // Si no hay perfiles conocidos → devuelve vacío silenciosamente
      if (!data?.items?.length) return [];

      // Convertir a ContentItem (compatible con el ranking actual)
      return data.items.map((item: any) => ({
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
        provider: 'dailymotion' as const,
        durationSeconds: item.durationSeconds,
        viewCount: item.viewCount || 0,
        publishedAt: item.publishedAt,
        contentState: item.contentState,
        embeddable: item.embeddable,
        language: item.language,
        metadataCompleteness: item.metadataCompleteness,
        metadataReadiness: item.metadataReadiness,
        source: {
          provider: 'dailymotion',
          discoveryMethod: 'dailymotion-profiles',
          discoveredAt: new Date().toISOString()
        },
        retrievalSource: 'dailymotion-api'
      }));

    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      if (import.meta.env.DEV) console.warn('[DailymotionAdapter] Exception:', e.message);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const dailymotionAdapter = new DailymotionAdapter();
