/**
 * historicalFrontierBuilder.ts — Constructor y Gestor de la Frontera Masiva de URLs (HarvestFrontier)
 */

import { extractYouTubeVideoIds, parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import type { YouTubeHarvestReference, YouTubeReferenceOrigin } from './types';

export interface FrontierTargetUrl {
  url: string;
  domain: string;
  publisherId: string;
  publisherName: string;
  country: string;
  language: string;
  category: string;
  priority: number;
}

export interface FrontierBuilderStats {
  sitemapIndexesDiscovered: number;
  childSitemapsDiscovered: number;
  frontierUrlsQueued: number;
  directVideoRefsDiscovered: number;
}

export class HistoricalFrontierBuilder {
  private urlQueue: FrontierTargetUrl[] = [];
  private seenUrls: Set<string> = new Set();
  private domainErrorCounts: Record<string, number> = {};
  private disabledDomains: Set<string> = new Set();

  stats: FrontierBuilderStats = {
    sitemapIndexesDiscovered: 0,
    childSitemapsDiscovered: 0,
    frontierUrlsQueued: 0,
    directVideoRefsDiscovered: 0
  };

  isDomainDisabled(domain: string): boolean {
    return this.disabledDomains.has(domain);
  }

  recordDomainError(domain: string, statusCode: number): void {
    if (statusCode === 403) {
      this.disabledDomains.add(domain);
      console.log(`🚫 [Domain Safety] Dominio ${domain} devolvió 403. Dominio pausado.`);
      return;
    }

    this.domainErrorCounts[domain] = (this.domainErrorCounts[domain] || 0) + 1;
    if (this.domainErrorCounts[domain] >= 15) {
      this.disabledDomains.add(domain);
      console.log(`⚠️ [Domain Safety] Dominio ${domain} acumuló 15 errores consecutivos. Dominio pausado.`);
    }
  }

  queueUrl(target: FrontierTargetUrl): boolean {
    if (this.seenUrls.has(target.url) || this.disabledDomains.has(target.domain)) return false;
    this.seenUrls.add(target.url);
    this.urlQueue.push(target);
    this.stats.frontierUrlsQueued++;
    return true;
  }

  async processSitemapXml(
    sitemapUrl: string,
    publisher: { id: string; name: string; domain: string; country: string; language: string; category: string }
  ): Promise<{ childSitemaps: string[]; directRefs: YouTubeHarvestReference[] }> {
    const childSitemaps: string[] = [];
    const directRefs: YouTubeHarvestReference[] = [];

    if (this.disabledDomains.has(publisher.domain)) return { childSitemaps, directRefs };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'YouAppTV-AtlasFrontierBuilder/1.0 (Public Media Reference Discovery; https://youapp.tv)'
        }
      });
      clearTimeout(timeout);

      if (!res.ok) {
        this.recordDomainError(publisher.domain, res.status);
        return { childSitemaps, directRefs };
      }

      const text = await res.text();

      // 1. Extraer referencias directas de YouTube en el XML (ej. video-sitemaps o feeds mRSS)
      const origin: YouTubeReferenceOrigin = {
        type: 'video_sitemap',
        sourceUrl: sitemapUrl,
        publisherId: publisher.id,
        publisherName: publisher.name,
        country: publisher.country,
        language: publisher.language,
        category: publisher.category
      };

      const extracted = parseFeedOrSitemapForYouTubeRefs(text, origin);
      if (extracted.length > 0) {
        directRefs.push(...extracted);
        this.stats.directVideoRefsDiscovered += extracted.length;
      }

      // 2. Si contiene sitemap indexes (<sitemap><loc>...), extraer child sitemaps
      const sitemapTagRegex = /<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi;
      let sitemapMatch: RegExpExecArray | null;
      let hasSitemapIndex = false;

      while ((sitemapMatch = sitemapTagRegex.exec(text)) !== null) {
        hasSitemapIndex = true;
        const childUrl = sitemapMatch[1].trim();
        childSitemaps.push(childUrl);
        this.stats.childSitemapsDiscovered++;
      }

      if (hasSitemapIndex) {
        this.stats.sitemapIndexesDiscovered++;
      } else {
        // 3. Si es un urlset (<url><loc>...), extraer URLs de artículos
        const urlLocRegex = /<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi;
        let urlMatch: RegExpExecArray | null;

        while ((urlMatch = urlLocRegex.exec(text)) !== null) {
          const pageUrl = urlMatch[1].trim();
          this.queueUrl({
            url: pageUrl,
            domain: publisher.domain,
            publisherId: publisher.id,
            publisherName: publisher.name,
            country: publisher.country,
            language: publisher.language,
            category: publisher.category,
            priority: /video|media|musica|cultura|concierto/i.test(pageUrl) ? 1 : 3
          });
        }
      }
    } catch (err: any) {
      this.recordDomainError(publisher.domain, 500);
    }

    return { childSitemaps, directRefs };
  }

  getPendingUrls(count = 50): FrontierTargetUrl[] {
    return this.urlQueue.splice(0, count);
  }

  getQueueSize(): number {
    return this.urlQueue.length;
  }
}
