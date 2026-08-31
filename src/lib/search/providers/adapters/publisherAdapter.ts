/**
 * publisherAdapter.ts — Fase 8: Publishers como proveedor de contenido
 *
 * Busca videos en youapp_index que fueron descubiertos via publisher-watcher.
 * Estos videos tienen source='publisher' y ya están en nuestro índice.
 *
 * - 0 YouTube Search Quota Cost
 * - Alta context_authority (heredada del publisher)
 * - Prioridad 3: entre Supabase/Atlas (1) y Vimeo (5)
 */

import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';

export class PublisherAdapter implements ExternalAdapter {
  id = 'publisher';
  costTier = 'free' as const;
  monetaryCost = 0;
  quotaCost = 0;
  priority = 3;  // Alta prioridad: contenido verificado de fuentes editoriales

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      // 1. Fetch live news from the web-publisher edge function
      const edgeFunctionPromise = supabase.functions.invoke('web-publisher', {
        body: { query: query.normalizedQuery, limit: options?.limit || 15 }
      }).then(res => {
        if (res.error) throw res.error;
        return (res.data?.items || []) as ContentItem[];
      }).catch(err => {
        if (import.meta.env.DEV) console.warn('[PublisherAdapter] Edge Function Error:', err);
        return [];
      });

      // 2. Fetch from youapp_index
      const dbPromise = supabase
        .from('youapp_index')
        .select(`
          id, provider, provider_content_id, title, description,
          thumbnail_url, embed_url, canonical_url,
          creator_name, creator_id,
          published_at, duration_seconds,
          language, content_state, embeddable,
          views, likes,
          metadata_completeness, metadata_readiness,
          source, source_verified
        `)
        .eq('source', 'publisher')
        .or(`title.ilike.%${query.normalizedQuery}%,description.ilike.%${query.normalizedQuery}%`)
        .order('metadata_completeness', { ascending: false })
        .limit(options?.limit || 20)
        .then(res => {
          if (res.error || !res.data) return [];
          return res.data.map(v => ({
            id: `pub_${v.provider}_${v.provider_content_id}`,
            type: 'video' as const,
            title: v.title || '',
            description: v.description || '',
            thumbnail: v.thumbnail_url,
            videoUrl: v.embed_url || v.canonical_url,
            channelTitle: v.creator_name,
            channelId: v.creator_id,
            publishedText: v.published_at,
            isLive: v.content_state === 'live',
            isVerified: v.source_verified || false,
            provider: v.provider as any,
            durationSeconds: v.duration_seconds,
            viewCount: v.views || 0,
            publishedAt: v.published_at,
            contentState: v.content_state as any,
            embeddable: v.embeddable,
            language: v.language,
            metadataCompleteness: v.metadata_completeness,
            metadataReadiness: v.metadata_readiness,
            retrievalSource: 'publisher' as const,
            source: {
              provider: v.provider,
              discoveryMethod: 'publisher',
              discoveredAt: new Date().toISOString()
            }
          })) as ContentItem[];
        }).catch(err => {
          if (import.meta.env.DEV) console.warn('[PublisherAdapter] DB Error:', err);
          return [];
        });

      // Ejecutar ambos en paralelo
      const [liveNews, dbNews] = await Promise.all([edgeFunctionPromise, dbPromise]);
      
      // Combinar priorizando las noticias en vivo
      return [...liveNews, ...dbNews];

    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      if (import.meta.env.DEV) console.warn('[PublisherAdapter] Exception:', e.message);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const publisherAdapter = new PublisherAdapter();
