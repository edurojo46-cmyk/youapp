/**
 * mastodonSocialHarvester.ts — Harvester Federado Multi-Instancia de Mastodon
 */

import { extractYouTubeVideoIds } from '../youtubeReferenceExtractor';
import type { YouTubeHarvestReference } from '../types';

export const MASTODON_INSTANCES = [
  'https://mastodon.social',
  'https://mstdn.social',
  'https://mastodon.world',
  'https://mas.to',
  'https://mastodon.online',
  'https://fosstodon.org',
  'https://techhub.social',
  'https://infosec.exchange'
];

export class MastodonSocialHarvester {
  private isRunning = false;
  private abortController: AbortController | null = null;

  async startHarvest(onReferencesFound: (refs: YouTubeHarvestReference[]) => void): Promise<void> {
    this.isRunning = true;
    this.abortController = new AbortController();

    while (this.isRunning) {
      for (const instance of MASTODON_INSTANCES) {
        if (!this.isRunning) break;

        try {
          const url = `${instance}/api/v1/timelines/public?limit=40`;
          const res = await fetch(url, {
            signal: AbortSignal.timeout(4000),
            headers: {
              'User-Agent': 'YouAppTVAtlas/2.0 (Social-Discovery-Engine; contact: info@youapp.tv)',
              'Accept': 'application/json'
            }
          });

          if (res.ok) {
            const statuses = await res.json();
            if (Array.isArray(statuses)) {
              const allRefs: YouTubeHarvestReference[] = [];
              for (const status of statuses) {
                const textBlob = `${status.content || ''} ${status.card?.url || ''} ${status.card?.title || ''}`;
                const videoIds = extractYouTubeVideoIds(textBlob);

                for (const vid of videoIds) {
                  allRefs.push({
                    videoId: vid,
                    canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                    title: status.card?.title || `Mastodon Post [${vid}]`,
                    publisherId: 'mastodon_federated_discovery',
                    publisherName: `Mastodon (${new URL(instance).hostname})`,
                    articleUrl: status.url || `${instance}/@${status.account?.username}/${status.id}`,
                    country: 'GLOBAL',
                    language: status.language || 'multi',
                    category: 'Social / Mastodon Fediverse',
                    harvestTier: 'bronze',
                    discoveredAt: new Date().toISOString()
                  });
                }
              }

              if (allRefs.length > 0) {
                onReferencesFound(allRefs);
              }
            }
          }
        } catch {
          // Ignorar timeouts por instancia
        }
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  }

  stopHarvest(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
