import type { SearchProvider, SearchOptions } from '../index';
import type { ContentItem, SearchQuery } from '../../types';
import { supabase } from '../../../supabase';
import { PUBLISHER_REGISTRY, identifyPublisherFromUrl, isAllowedPublisherUrl } from '../../publishers/publisherRegistry';
import { extractVideosFromHtmlPage, type ExtractedPublisherVideo } from '../../publishers/publisherVideoExtractor';

export interface PublisherDiscoveryStats {
  pagesFetched: number;
  extractedRaw: number;
  uniqueVideos: number;
  qualifiedVideos: number;
}

export class PublisherVideoAdapter implements SearchProvider {
  name = 'publisher_video';
  costClass = 'free' as const;

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    const q = query.normalizedQuery.trim().toLowerCase();
    if (!q || q.length < 3) return [];

    const stats: PublisherDiscoveryStats = {
      pagesFetched: 0,
      extractedRaw: 0,
      uniqueVideos: 0,
      qualifiedVideos: 0
    };

    try {
      // 1. Invocar Edge Function o búsqueda directa en fuentes de publishers
      let extractedVideos: ExtractedPublisherVideo[] = [];

      try {
        const { data, error } = await supabase.functions.invoke('publisher-video-discovery', {
          body: { query: q, limit: options?.limit || 20 }
        });

        if (!error && data?.videos && Array.isArray(data.videos)) {
          extractedVideos = data.videos;
          if (data.stats) Object.assign(stats, data.stats);
        }
      } catch (e) {
        // Fallback gracefully si la Edge Function no está disponible en local
      }

      if (extractedVideos.length === 0) {
        return [];
      }

      // 2. Mapear a ContentItem tipado
      const items: ContentItem[] = extractedVideos.map(v => {
        const isYt = v.provider === 'youtube';
        const isVimeo = v.provider === 'vimeo';
        const isDm = v.provider === 'dailymotion';

        return {
          id: `${v.provider}_${v.providerContentId}`,
          providerContentId: v.providerContentId,
          type: 'video' as const,
          title: v.title || `Video en ${v.publisherName}`,
          description: v.description || `Descubierto en ${v.publisherName}`,
          thumbnail: v.thumbnailUrl || 'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800',
          videoUrl: v.videoUrl,
          canonicalUrl: v.articleUrl,
          channelTitle: v.publisherName,
          channelId: `pub_${v.publisherCode}`,
          publishedText: v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : v.publisherName,
          durationSeconds: v.durationSeconds || 600,
          durationText: v.durationSeconds ? `${Math.floor(v.durationSeconds / 60)}m` : 'Video',
          isLive: false,
          isVerified: true,
          provider: (v.provider as any) || 'youtube',
          source: {
            provider: v.provider,
            discoveryMethod: v.discoveryMethod,
            discoveredAt: new Date().toISOString()
          },
          retrievalSource: 'publisher'
        };
      });

      // 3. Absorber en Atlas (youapp_index) y registrar procedencia
      if (items.length > 0) {
        Promise.resolve().then(async () => {
          try {
            // Guardar en youapp_index
            const toInsertIndex = items.map(item => ({
              provider: item.provider || 'youtube',
              provider_content_id: item.providerContentId,
              video_id: item.providerContentId,
              title: item.title,
              description: item.description,
              thumbnail: item.thumbnail,
              url: item.videoUrl,
              creator_id: item.channelId,
              creator_name: item.channelTitle,
              duration_seconds: item.durationSeconds,
              source: 'publisher',
              content_state: 'discovered'
            }));

            await supabase
              .from('youapp_index')
              .upsert(toInsertIndex, { onConflict: 'provider,provider_content_id', ignoreDuplicates: true });

            // Guardar procedencia en publisher_video_provenance
            const toInsertProvenance = extractedVideos.map(v => ({
              provider: v.provider,
              provider_content_id: v.providerContentId,
              publisher_code: v.publisherCode,
              publisher_name: v.publisherName,
              article_url: v.articleUrl,
              article_title: v.articleTitle || v.title,
              discovery_method: v.discoveryMethod,
              extraction_method: v.extractionMethod,
            }));

            await supabase
              .from('publisher_video_provenance')
              .upsert(toInsertProvenance, { onConflict: 'provider,provider_content_id,publisher_code,article_url', ignoreDuplicates: true });

            if (import.meta.env.DEV) {
              console.log(`📰 [PublisherVideoAdapter] Ingested ${items.length} publisher candidates into Atlas.`);
            }
          } catch (err) {
            // best-effort
          }
        });
      }

      return items;
    } catch (err) {
      return [];
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export const publisherVideoAdapter = new PublisherVideoAdapter();
