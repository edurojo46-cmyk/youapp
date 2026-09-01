/**
 * discoverAdapter.ts — Fase 9: Web Discover como proveedor del Discovery Mesh
 *
 * Sirve videos indexados desde sitios académicos, culturales e institucionales.
 * Diferencia con publisherAdapter:
 *   - publisherAdapter: noticias/medios (fresher, alta densidad)
 *   - discoverAdapter: universidades/museos/conferencias (evergreen, altísima autoridad)
 *
 * Ambos leen de youapp_index. Publisher usa source='publisher', Discover usa source='discover'.
 *
 * - 0 YouTube Search Quota Cost
 * - context_authority muy alto (90-99)
 * - Contenido mayormente evergreen → excellent para QueriesMemory permanente
 */

import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';

export class DiscoverAdapter implements ExternalAdapter {
  id = 'discover';
  costTier = 'free' as const;
  monetaryCost = 0;
  quotaCost = 0;
  priority = 2;  // Máxima prioridad en free tier — altísima autoridad y 0 cuota

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const { data, error } = await supabase
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
        .eq('source', 'discover')
        .or(`title.ilike.%${query.normalizedQuery}%,description.ilike.%${query.normalizedQuery}%`)
        .order('metadata_completeness', { ascending: false })
        .limit(options?.limit || 15);

      if (error || !data?.length) return [];

      return data.map(v => ({
        id: `disc_${v.provider}_${v.provider_content_id}`,
        type: 'video' as const,
        title: v.title || '',
        description: v.description || '',
        thumbnail: v.thumbnail_url,
        videoUrl: v.embed_url || v.canonical_url,
        channelTitle: v.creator_name,
        channelId: v.creator_id,
        publishedText: v.published_at,
        isLive: false,  // Discover es mayormente evergreen
        isVerified: v.source_verified || false,
        provider: v.provider as any,
        durationSeconds: v.duration_seconds,
        viewCount: v.views || 0,
        publishedAt: v.published_at,
        contentState: 'vod' as const,
        embeddable: v.embeddable,
        language: v.language,
        metadataCompleteness: v.metadata_completeness,
        metadataReadiness: v.metadata_readiness,
        retrievalSource: 'web-discover' as const,
        source: {
          provider: v.provider,
          discoveryMethod: 'web-discover',
          discoveredAt: new Date().toISOString()
        }
      }));

    } catch (e: any) {
      if (e.name === 'AbortError') throw e;
      if (import.meta.env.DEV) console.warn('[DiscoverAdapter] Exception:', e.message);
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const discoverAdapter = new DiscoverAdapter();
