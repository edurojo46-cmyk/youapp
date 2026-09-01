import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { supabase } from '../../supabase';

export class SupabaseProvider implements SearchProvider {
  name = 'supabase';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const q = query.normalizedQuery.trim();
      const { data, error } = await supabase
        .from('youapp_index')
        .select('*')
        .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
        .limit(options?.limit || 50);

      if (error) {
        if (import.meta.env.DEV) console.error("[SupabaseProvider] Query error:", error);
        return [];
      }

      if (!data || data.length === 0) return [];

      return data.map(v => ({
        id: v.provider_content_id ? `yt_${v.provider_content_id}` : `youapp_idx_${v.id}`,
        providerContentId: v.provider_content_id || v.video_id,
        type: 'video' as const,
        title: v.title,
        description: v.description || '',
        thumbnail: v.thumbnail || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800',
        videoUrl: v.url,
        canonicalUrl: v.url,
        channelTitle: v.creator_name || 'YouTube',
        channelId: v.creator_id || 'youapp-community',
        publishedText: v.published_at ? new Date(v.published_at).toLocaleDateString() : 'YouTube',
        durationSeconds: v.duration_seconds || 600,
        durationText: v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)}m` : 'Video',
        isLive: false,
        isVerified: true,
        provider: (v.provider as any) || 'youtube',
        source: {
          provider: v.provider || 'youtube',
          discoveryMethod: v.source || 'radar',
          discoveredAt: v.created_at || new Date().toISOString()
        },
        retrievalSource: 'atlas'
      }));
    } catch (e) {
      return [];
    }
  }
}

export const supabaseProvider = new SupabaseProvider();
