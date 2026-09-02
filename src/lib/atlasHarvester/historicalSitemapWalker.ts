/**
 * historicalSitemapWalker.ts — Rastreador y Particionador de Sitemaps Históricos
 *
 * Prioridades de Partición:
 *  - P1: Video Sitemaps (video-sitemap*.xml) ➔ Embeds directos en XML (máxima velocidad sin descargar HTML).
 *  - P2: Media Sitemaps (media-sitemap*.xml, mrss).
 *  - P3: News & Current Sitemaps (news-sitemap*.xml).
 *  - P4: Post & Historical Partitions (post-sitemap-001.xml, sitemap-2024.xml, sitemap-2023.xml, etc.).
 */

import { extractYouTubeVideoIds, parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import type { YouTubeHarvestReference, YouTubeReferenceOrigin } from './types';

export interface SitemapPartition {
  url: string;
  domain: string;
  publisherId: string;
  publisherName: string;
  country: string;
  language: string;
  category: string;
  priority: number;             // 1 a 4
  partitionType: 'video' | 'media' | 'news' | 'post' | 'general';
}

export class HistoricalSitemapWalker {
  private sitemapFrontier: SitemapPartition[] = [];
  private seenSitemapUrls: Set<string> = new Set();

  addRootSitemap(
    rootUrl: string,
    publisher: { id: string; name: string; domain: string; country: string; language: string; category: string }
  ): void {
    if (this.seenSitemapUrls.has(rootUrl)) return;
    this.seenSitemapUrls.add(rootUrl);

    this.sitemapFrontier.push({
      url: rootUrl,
      domain: publisher.domain,
      publisherId: publisher.id,
      publisherName: publisher.name,
      country: publisher.country,
      language: publisher.language,
      category: publisher.category,
      priority: 1,
      partitionType: 'general'
    });
  }

  async expandIndex(partition: SitemapPartition): Promise<SitemapPartition[]> {
    const discoveredSubPartitions: SitemapPartition[] = [];

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(partition.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'YouAppTV-AtlasHistoricalWalker/1.0 (Media Sitemaps; https://youapp.tv)'
        }
      });
      clearTimeout(timeout);

      if (!res.ok) return discoveredSubPartitions;

      const xmlText = await res.text();
      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match: RegExpExecArray | null;

      while ((match = locRegex.exec(xmlText)) !== null) {
        const subUrl = match[1].trim();
        if (this.seenSitemapUrls.has(subUrl)) continue;
        this.seenSitemapUrls.add(subUrl);

        let priority = 4;
        let pType: SitemapPartition['partitionType'] = 'general';

        if (/video/i.test(subUrl)) {
          priority = 1;
          pType = 'video';
        } else if (/media|audio/i.test(subUrl)) {
          priority = 2;
          pType = 'media';
        } else if (/news/i.test(subUrl)) {
          priority = 3;
          pType = 'news';
        } else if (/post|article|202\d|201\d/i.test(subUrl)) {
          priority = 4;
          pType = 'post';
        }

        discoveredSubPartitions.push({
          url: subUrl,
          domain: partition.domain,
          publisherId: partition.publisherId,
          publisherName: partition.publisherName,
          country: partition.country,
          language: partition.language,
          category: partition.category,
          priority,
          partitionType: pType
        });
      }
    } catch {
      // Ignorar timeouts
    }

    return discoveredSubPartitions;
  }

  getPendingPartitions(count = 20): SitemapPartition[] {
    // Ordenar por prioridad (P1 Video primero)
    this.sitemapFrontier.sort((a, b) => a.priority - b.priority);
    return this.sitemapFrontier.splice(0, count);
  }

  getFrontierSize(): number {
    return this.sitemapFrontier.length;
  }

  addPartitions(partitions: SitemapPartition[]): void {
    for (const p of partitions) {
      if (!this.seenSitemapUrls.has(p.url)) {
        this.seenSitemapUrls.add(p.url);
        this.sitemapFrontier.push(p);
      }
    }
  }
}
