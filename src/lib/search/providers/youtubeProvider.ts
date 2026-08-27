import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { supabase } from '../../supabase';

export class YouTubeProvider implements SearchProvider {
  name = 'youtube';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    
    // Si estamos en DEV, podríamos querer no gastar cuota (según indicación del usuario)
    // El usuario sugirió USE_EXTERNAL_SEARCH=false. En Vite se usaría import.meta.env.VITE_USE_EXTERNAL_SEARCH
    // Por simplicidad, asumiremos un mock rápido en DEV si no se fuerza la búsqueda.
    if (import.meta.env.DEV && import.meta.env.VITE_USE_EXTERNAL_SEARCH === 'false') {
      return this.getMockResults(query.normalizedQuery);
    }

    try {
      const { data, error } = await supabase.functions.invoke('external-search', {
        body: { 
          provider: 'youtube', 
          query: query.rawQuery, 
          limit: options?.limit || 20 
        }
      });

      if (error) {
        console.error("YouTubeProvider Edge Function error:", error);
        return [];
      }

      // Los resultados ya vienen adaptados como ContentItem desde la Edge Function
      return data as ContentItem[];
    } catch (e) {
      console.error("YouTubeProvider exception:", e);
      return [];
    }
  }

  private getMockResults(q: string): ContentItem[] {
    return Array(5).fill(null).map((_, i) => ({
      id: `mock-yt-${Date.now()}-${i}`,
      type: 'video',
      title: `(Mock) Resultado de YouTube para ${q} #${i + 1}`,
      description: 'Esto es un mock para no gastar cuota de API en desarrollo.',
      thumbnail: `https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&sig=${i}`,
      videoUrl: `https://www.youtube.com/embed/jfKfPfyJRdk`,
      channelTitle: 'Mock Channel',
      channelId: 'mock-channel',
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      source: {
        provider: 'youtube',
        discoveryMethod: 'youtube-api',
        discoveredAt: new Date().toISOString()
      }
    }));
  }
}

export const youtubeProvider = new YouTubeProvider();
