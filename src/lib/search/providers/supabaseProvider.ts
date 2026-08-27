import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { supabase } from '../../supabase';

export class SupabaseProvider implements SearchProvider {
  name = 'supabase';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      // Búsqueda simple en el índice comunitario actual
      // Asume que la tabla es "youapp_index" (que existía en el código original)
      // Se podría cambiar a "catalog_items" o como se defina después.
      const { data, error } = await supabase
        .from('youapp_index')
        .select('*')
        .or(`title.ilike.%${query.normalizedQuery}%,description.ilike.%${query.normalizedQuery}%,tags.cs.{${query.normalizedQuery}}`)
        .limit(options?.limit || 50);

      if (error) {
        if (import.meta.env.DEV) console.error("SupabaseProvider error:", error);
        return [];
      }

      if (!data) return [];

      return data.map(v => ({
        id: `youapp_idx_${v.id}`,
        type: 'video' as const,
        title: v.title,
        description: v.description || 'Agregado por la comunidad YouApp',
        thumbnail: v.thumbnail || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800',
        videoUrl: v.url, // Necesitará pasar por normalizationEngine
        channelTitle: 'Comunidad YouApp',
        channelId: 'youapp-community',
        publishedText: 'Comunidad',
        durationText: v.duration_text || 'Video',
        isLive: false,
        isVerified: true,
        provider: (v.provider as any) || 'youtube',
        source: {
          provider: v.provider || 'unknown',
          discoveryMethod: 'user-submitted',
          discoveredAt: v.created_at || new Date().toISOString()
        }
      }));
    } catch (e) {
       return [];
    }
  }
}

export const supabaseProvider = new SupabaseProvider();
