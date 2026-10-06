/**
 * xSocialHarvester.ts — Harvester de X / Twitter Social Discovery (Authorized API & Stream)
 */

import { extractYouTubeVideoIds } from '../youtubeReferenceExtractor';
import type { YouTubeHarvestReference } from '../types';

export class XSocialHarvester {
  private bearerToken: string | null = null;
  private isRunning = false;

  constructor() {
    this.bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || null;
  }

  async startHarvest(onReferencesFound: (refs: YouTubeHarvestReference[]) => void): Promise<void> {
    this.isRunning = true;

    if (!this.bearerToken) {
      console.log('  ℹ️ [X Harvester] Sin X_BEARER_TOKEN configurado. Modo pasivo/standby.');
      return;
    }

    const query = '(youtube.com OR youtu.be) (musica OR live OR entrevista OR concierto) -is:retweet';

    while (this.isRunning) {
      try {
        const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=50&tweet.fields=created_at,entities`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5000),
          headers: {
            'Authorization': `Bearer ${this.bearerToken}`,
            'User-Agent': 'YouAppTVAtlas/2.0'
          }
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.data)) {
            const allRefs: YouTubeHarvestReference[] = [];
            for (const tweet of data.data) {
              const text = tweet.text || '';
              const urls = tweet.entities?.urls?.map((u: any) => u.expanded_url || u.url).join(' ') || '';
              const videoIds = extractYouTubeVideoIds(`${text} ${urls}`);

              for (const vid of videoIds) {
                allRefs.push({
                  videoId: vid,
                  canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                  title: text.slice(0, 80) || `X Post [${vid}]`,
                  publisherId: 'x_social_discovery',
                  publisherName: 'X / Twitter Social',
                  articleUrl: `https://x.com/i/web/status/${tweet.id}`,
                  country: 'GLOBAL',
                  language: 'multi',
                  category: 'Social / X Search',
                  harvestTier: 'bronze',
                  discoveredAt: tweet.created_at || new Date().toISOString()
                });
              }
            }

            if (allRefs.length > 0) {
              onReferencesFound(allRefs);
            }
          }
        }
      } catch {
        // Ignorar
      }

      await new Promise(r => setTimeout(r, 10000));
    }
  }

  stopHarvest(): void {
    this.isRunning = false;
  }
}
