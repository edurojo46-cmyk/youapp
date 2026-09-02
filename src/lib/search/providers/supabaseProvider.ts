import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { supabase } from '../../supabase';
import { lookupCanonicalWork } from '../canonicalWorksCatalog';

export class SupabaseProvider implements SearchProvider {
  name = 'supabase';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const q = query.normalizedQuery.trim();
      if (!q) return [];

      const canonicalWork = lookupCanonicalWork(q);
      let queryPromise;

      if (canonicalWork && canonicalWork.canonicalSearchTerms.length > 0) {
        // Búsqueda orientada a términos canónicos exactos de la obra
        const termsFilter = canonicalWork.canonicalSearchTerms
          .map(term => `title.ilike.%${term}%`)
          .join(',');

        queryPromise = supabase
          .from('youapp_index')
          .select('*')
          .or(termsFilter)
          .limit(options?.limit || 50);
      } else {
        // Extraer tokens principales para búsqueda general
        const tokens = q.toLowerCase()
          .replace(/[,;:.()\-]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length >= 3 && !/^(the|los|las|del|con|para|por)$/i.test(t));

        const primaryFilter = tokens.length > 1
          ? tokens.map(t => `title.ilike.%${t}%`).join(',')
          : `title.ilike.%${q}%`;

        queryPromise = supabase
          .from('youapp_index')
          .select('*')
          .or(primaryFilter)
          .limit(options?.limit || 50);
      }

      // Timeout de seguridad de 7000ms para permitir escaneo completo en tablas grandes
      const timeoutPromise = new Promise<{ data: any[]; error: any }>((_, reject) =>
        setTimeout(() => reject(new Error('SupabaseProvider timeout')), 7000)
      );

      const result = await Promise.race([queryPromise, timeoutPromise]) as { data: any[]; error: any };
      const { data, error } = result || {};

      if (error || !data || data.length === 0) return [];

      return data.map(v => ({
        id: v.provider_content_id ? `${v.provider || 'yt'}_${v.provider_content_id}` : `youapp_idx_${v.id}`,
        contentId: v.provider_content_id ? `${v.provider || 'yt'}_${v.provider_content_id}` : `youapp_idx_${v.id}`,
        providerContentId: v.provider_content_id || v.video_id,
        type: 'video' as const,
        title: v.title,
        description: v.description || '',
        thumbnail: v.thumbnail || v.thumbnail_url || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800',
        videoUrl: v.url || v.canonical_url,
        sourceUrl: v.url || v.canonical_url,
        canonicalUrl: v.url || v.canonical_url,
        channelTitle: v.creator_name || 'Atlas Media',
        channelId: v.creator_id || 'atlas-channel',
        publishedText: v.published_at ? new Date(v.published_at).toLocaleDateString() : 'Atlas',
        durationSeconds: v.duration_seconds || 240,
        durationText: v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)}m` : 'Video',
        isLive: false,
        isVerified: true,
        provider: (v.provider as any) || 'youtube',
        atlasRowExists: true,
        discoveryOrigin: v.source || 'atlas_index',
        isFixture: false,
        isDemo: false,
        playability: 'verified_stream',
        source: {
          provider: v.provider || 'youtube',
          discoveryMethod: v.source || 'atlas_bootstrap',
          discoveredAt: v.created_at || new Date().toISOString()
        },
        retrievalSource: 'atlas'
      })) as ContentItem[];
    } catch {
      return [];
    }
  }
}

export const supabaseProvider = new SupabaseProvider();

