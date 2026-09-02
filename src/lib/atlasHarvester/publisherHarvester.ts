/**
 * publisherHarvester.ts — Cliente HTTP Concurrente con Backoff y Parser de Feeds
 */

import { parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import type { PublisherHarvestSource, YouTubeHarvestReference, YouTubeReferenceOrigin } from './types';

export async function fetchPublisherFeed(
  feedUrl: string,
  source: PublisherHarvestSource,
  sourceType: any
): Promise<{ references: YouTubeHarvestReference[]; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  const origin: YouTubeReferenceOrigin = {
    type: sourceType,
    sourceUrl: feedUrl,
    publisherId: source.id,
    publisherName: source.name,
    country: source.country,
    language: source.language,
    category: source.category
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'YouAppTV-AtlasHarvester/1.0 (Public Media Reference Discovery; https://youapp.tv)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/json, text/html;q=0.9, */*;q=0.8'
      }
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      return {
        references: [],
        latencyMs,
        error: `HTTP ${res.status} ${res.statusText}`
      };
    }

    const bodyText = await res.text();
    const references = parseFeedOrSitemapForYouTubeRefs(bodyText, origin);

    return {
      references,
      latencyMs
    };
  } catch (err: any) {
    return {
      references: [],
      latencyMs: Date.now() - t0,
      error: err.name === 'AbortError' ? 'Timeout 12s' : (err.message || String(err))
    };
  }
}
