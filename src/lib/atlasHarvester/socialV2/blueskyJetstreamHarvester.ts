/**
 * blueskyJetstreamHarvester.ts — Harvester de Bluesky / AT Protocol (Jetstream & Firehose Público)
 */

import { extractYouTubeVideoIds } from '../youtubeReferenceExtractor';
import type { YouTubeHarvestReference } from '../types';

export interface BlueskyPostRecord {
  uri: string;
  cid: string;
  authorDid?: string;
  text?: string;
  createdAt: string;
  embed?: {
    $type?: string;
    external?: {
      uri?: string;
      title?: string;
      description?: string;
    };
    record?: any;
    media?: any;
  };
  facets?: Array<{
    features?: Array<{
      $type?: string;
      uri?: string;
    }>;
  }>;
}

export class BlueskyJetstreamHarvester {
  private isRunning = false;
  private abortController: AbortController | null = null;

  async startStream(onReferencesFound: (refs: YouTubeHarvestReference[]) => void): Promise<void> {
    this.isRunning = true;
    this.abortController = new AbortController();

    // 1. WebSocket Jetstream / Firehose Público de Bluesky
    try {
      const wsUrl = 'wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post';
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        if (!this.isRunning) {
          ws.close();
          return;
        }

        try {
          const raw = typeof event.data === 'string' ? event.data : '';
          if (!raw) return;

          const data = JSON.parse(raw);
          if (data?.commit?.collection === 'app.bsky.feed.post' && data?.commit?.record) {
            const record: BlueskyPostRecord = data.commit.record;
            const refs = this.extractReferencesFromBlueskyRecord(record, data.commit.rkey || '');
            if (refs.length > 0) {
              onReferencesFound(refs);
            }
          }
        } catch {
          // Ignorar frames no conformes
        }
      };

      ws.onerror = () => {
        // En caso de cierre o error, el polling fallback asegura continuidad
      };
    } catch {
      // Fallback a HTTP Polling de búsqueda pública
    }

    // 2. Polling complementario sobre la API pública de búsqueda de Bluesky
    this.runHttpSearchPolling(onReferencesFound);
  }

  stopStream(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private async runHttpSearchPolling(onReferencesFound: (refs: YouTubeHarvestReference[]) => void) {
    const searchQueries = ['youtube.com', 'youtu.be', 'music', 'live', 'concierto', 'entrevista'];
    let qIdx = 0;

    while (this.isRunning) {
      try {
        const query = searchQueries[qIdx % searchQueries.length];
        qIdx++;

        const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=50`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'YouAppTVAtlas/2.0 (Social-Discovery-Engine; contact: info@youapp.tv)',
            'Accept': 'application/json'
          }
        });

        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json?.posts)) {
            const allRefs: YouTubeHarvestReference[] = [];
            for (const post of json.posts) {
              const refs = this.extractReferencesFromBlueskyRecord(post?.record || {}, post?.uri || '');
              allRefs.push(...refs);
            }
            if (allRefs.length > 0) {
              onReferencesFound(allRefs);
            }
          }
        }
      } catch {
        // Ignorar timeouts
      }

      await new Promise(r => setTimeout(r, 1500));
    }
  }

  private extractReferencesFromBlueskyRecord(record: BlueskyPostRecord, rkey: string): YouTubeHarvestReference[] {
    const refs: YouTubeHarvestReference[] = [];
    const textBlob = `${record.text || ''} ${record.embed?.external?.uri || ''} ${record.embed?.external?.title || ''}`;

    // Extraer desde facets
    if (Array.isArray(record.facets)) {
      for (const facet of record.facets) {
        if (Array.isArray(facet.features)) {
          for (const feat of facet.features) {
            if (feat.uri) {
              const videoIds = extractYouTubeVideoIds(feat.uri);
              for (const vid of videoIds) {
                refs.push({
                  videoId: vid,
                  canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                  title: record.embed?.external?.title || record.text?.slice(0, 80) || `Bluesky Post [${vid}]`,
                  publisherId: 'bluesky_social_discovery',
                  publisherName: 'Bluesky Social / AT Protocol',
                  articleUrl: record.uri || `https://bsky.app/profile/${record.authorDid || 'post'}/post/${rkey}`,
                  country: 'GLOBAL',
                  language: 'multi',
                  category: 'Social / Bluesky Firehose',
                  harvestTier: 'bronze',
                  discoveredAt: new Date().toISOString()
                });
              }
            }
          }
        }
      }
    }

    // Extraer desde external embed
    if (record.embed?.external?.uri) {
      const extIds = extractYouTubeVideoIds(record.embed.external.uri);
      for (const vid of extIds) {
        if (!refs.some(r => r.videoId === vid)) {
          refs.push({
            videoId: vid,
            canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
            title: record.embed.external.title || record.text?.slice(0, 80) || `Bluesky Post [${vid}]`,
            publisherId: 'bluesky_social_discovery',
            publisherName: 'Bluesky Social / AT Protocol',
            articleUrl: record.uri || `https://bsky.app/profile/${record.authorDid || 'post'}/post/${rkey}`,
            country: 'GLOBAL',
            language: 'multi',
            category: 'Social / Bluesky Firehose',
            harvestTier: 'bronze',
            discoveredAt: new Date().toISOString()
          });
        }
      }
    }

    // Extraer desde texto plano
    const textIds = extractYouTubeVideoIds(textBlob);
    for (const vid of textIds) {
      if (!refs.some(r => r.videoId === vid)) {
        refs.push({
          videoId: vid,
          canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
          title: record.text?.slice(0, 80) || `Bluesky Post [${vid}]`,
          publisherId: 'bluesky_social_discovery',
          publisherName: 'Bluesky Social / AT Protocol',
          articleUrl: record.uri || `https://bsky.app/profile/${record.authorDid || 'post'}/post/${rkey}`,
          country: 'GLOBAL',
          language: 'multi',
          category: 'Social / Bluesky Firehose',
          harvestTier: 'bronze',
          discoveredAt: new Date().toISOString()
        });
      }
    }

    return refs;
  }
}
