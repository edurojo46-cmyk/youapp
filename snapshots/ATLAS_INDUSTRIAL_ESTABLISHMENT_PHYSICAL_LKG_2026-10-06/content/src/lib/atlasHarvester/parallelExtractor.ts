/**
 * parallelExtractor.ts — Extractor Paralelo con Control de Concurrencia y Resiliencia
 */

import { extractYouTubeVideoIds } from './youtubeReferenceExtractor';
import type { FrontierTargetUrl } from './historicalFrontierBuilder';
import type { YouTubeHarvestReference, YouTubeReferenceOrigin } from './types';

export async function extractFromArticlePage(
  target: FrontierTargetUrl
): Promise<{ references: YouTubeHarvestReference[]; latencyMs: number; statusCode?: number; error?: string }> {
  const t0 = Date.now();
  const origin: YouTubeReferenceOrigin = {
    type: 'publisher_page',
    sourceUrl: target.url,
    publisherId: target.publisherId,
    publisherName: target.publisherName,
    country: target.country,
    language: target.language,
    category: target.category
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(target.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'YouAppTV-AtlasExtractor/1.0 (Public Media Reference Discovery; https://youapp.tv)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return { references: [], latencyMs, statusCode: res.status, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const videoIds = extractYouTubeVideoIds(html);
    const now = new Date().toISOString();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : undefined;

    const references: YouTubeHarvestReference[] = [...videoIds].map(vId => ({
      videoId: vId,
      canonicalUrl: `https://www.youtube.com/watch?v=${vId}`,
      title: pageTitle || `YouTube Reference [${vId}]`,
      thumbnailUrl: `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`,
      discoveredAt: now,
      origin,
      harvestTier: 'bronze'
    }));

    return { references, latencyMs, statusCode: 200 };
  } catch (err: any) {
    return {
      references: [],
      latencyMs: Date.now() - t0,
      error: err.name === 'AbortError' ? 'Timeout 6s' : (err.message || String(err))
    };
  }
}
