/**
 * ATLAS — SITEMAP HARVESTER
 * Resolves XML sitemaps and sitemap indexes, ranking URLs semantically to seed ecosystem frontiers
 */

import fetch from 'node-fetch';
import { SemanticUrlScorer } from './SemanticUrlScorer.ts';
import type { EcosystemJob } from './types.ts';

export class SitemapHarvester {
  /**
   * Explores standard sitemap locations for an ecosystem domain
   */
  public static async discoverSitemaps(job: EcosystemJob): Promise<number> {
    const sitemapCandidates = [
      `https://${job.domain}/sitemap.xml`,
      `https://${job.domain}/sitemap_index.xml`,
      `https://${job.domain}/page-sitemap.xml`
    ];

    let totalEnqueued = 0;

    for (const sitemapUrl of sitemapCandidates) {
      if (job.visited.has(sitemapUrl)) continue;
      try {
        const res = await fetch(sitemapUrl, {
          headers: { 'User-Agent': 'AtlasRecursiveHarvester/2.0' },
          signal: AbortSignal.timeout(3000)
        });

        if (!res.ok) continue;
        const text = await res.text();
        job.visited.add(sitemapUrl);

        // Check if sitemap index
        if (text.includes('<sitemapindex') || text.includes('<sitemap>')) {
          const childSitemaps = [...text.matchAll(/<loc>(.*?)<\/loc>/gi)].map(m => m[1].trim());
          for (const childUrl of childSitemaps) {
            // Prioritize page-sitemap and misc sitemaps over blog post archives
            if (/page|static|institucional|misc/i.test(childUrl) || !/post-201|archive/i.test(childUrl)) {
              const enqueuedFromChild = await this.parseAndEnqueueSitemap(job, childUrl);
              totalEnqueued += enqueuedFromChild;
            }
          }
        } else if (text.includes('<urlset') || text.includes('<url>')) {
          const enqueued = this.extractAndEnqueueUrls(job, text, sitemapUrl);
          totalEnqueued += enqueued;
        }

        if (totalEnqueued > 0) break; // Successfully parsed primary sitemap
      } catch (e) {
        // Sitemap probe failure ignored
      }
    }

    job.frontier.sort((a, b) => b.priorityScore - a.priorityScore);
    job.reachableUrlsDiscovered = job.discoveredUrls.size;
    return totalEnqueued;
  }

  private static async parseAndEnqueueSitemap(job: EcosystemJob, childUrl: string): Promise<number> {
    if (job.visited.has(childUrl)) return 0;
    job.visited.add(childUrl);
    try {
      const res = await fetch(childUrl, {
        headers: { 'User-Agent': 'AtlasRecursiveHarvester/2.0' },
        timeout: 4000
      });
      if (!res.ok) return 0;
      const text = await res.text();
      return this.extractAndEnqueueUrls(job, text, childUrl);
    } catch {
      return 0;
    }
  }

  private static extractAndEnqueueUrls(job: EcosystemJob, xmlText: string, sourceUrl: string): number {
    const locMatches = [...xmlText.matchAll(/<loc>(.*?)<\/loc>/gi)].map(m => m[1].trim());
    let enqueued = 0;

    for (const rawUrl of locMatches) {
      try {
        const cleanUrl = rawUrl.split('#')[0].split('?utm_')[0];
        if (SemanticUrlScorer.isWithinEcosystemScope(cleanUrl, job.domain)) {
          if (!job.visited.has(cleanUrl) && !job.discoveredUrls.has(cleanUrl)) {
            const score = SemanticUrlScorer.scoreUrl(cleanUrl, 1);
            if (score > 15) { // Only enqueue promising or neutral pages from sitemap
              job.discoveredUrls.add(cleanUrl);
              job.frontier.push({
                url: cleanUrl,
                depth: 1,
                priorityScore: score,
                discoveredFrom: sourceUrl
              });
              enqueued++;
            }
          }
        }
      } catch {}
    }

    return enqueued;
  }
}
