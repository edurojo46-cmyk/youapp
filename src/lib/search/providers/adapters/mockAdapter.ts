import type { ExternalAdapter, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';

export class MockAdapter implements ExternalAdapter {
  id = 'mock';
  costTier = 'free' as const;
  monetaryCost = 0;
  quotaCost = 0;
  priority = 1;

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    return Array(5).fill(null).map((_, i) => ({
      id: `mock-yt-${Date.now()}-${i}`,
      type: 'video',
      title: `(Mock) Resultado para ${query.normalizedQuery} #${i + 1}`,
      description: 'Esto es un mock para no gastar cuota de API en desarrollo.',
      thumbnail: `https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&sig=${i}`,
      videoUrl: `https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`,
      channelTitle: 'Mock Channel',
      channelId: 'mock-channel',
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      discoverySource: 'mock',
      source: {
        provider: 'mock',
        discoveryMethod: 'youtube-api',
        discoveredAt: new Date().toISOString()
      },
      retrievalSource: 'mock'
    }));
  }

  async isAvailable(): Promise<boolean> {
    // Solo disponible en desarrollo
    return import.meta.env.DEV && import.meta.env.VITE_USE_EXTERNAL_SEARCH === 'false';
  }
}

export const mockAdapter = new MockAdapter();
