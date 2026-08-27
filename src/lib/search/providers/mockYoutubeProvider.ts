import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';

export class MockYouTubeProvider implements SearchProvider {
  name = 'youtube-mock';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    return Array(5).fill(null).map((_, i) => ({
      id: `mock-yt-${Date.now()}-${i}`,
      type: 'video',
      title: `(Mock) Resultado de YouTube para ${query.normalizedQuery} #${i + 1}`,
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

export const mockYoutubeProvider = new MockYouTubeProvider();
