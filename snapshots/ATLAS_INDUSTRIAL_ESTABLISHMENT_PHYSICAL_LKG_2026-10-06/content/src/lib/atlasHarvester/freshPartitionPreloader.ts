/**
 * freshPartitionPreloader.ts — Preloader de Particiones de Alta Novedad y Expansión de Vecindades
 */

import { generateAdjacentCohorts } from './neighborExpansion';
import { calculatePageYouTubeProbability, calculateDateFreshnessFactor } from './pageProbabilityScorer';
import { parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import type { PriorityHarvestFrontier } from './priorityHarvestFrontier';
import type { PartitionIntelligenceManager } from './partitionIntelligence';
import type { YouTubeHarvestReference } from './types';

export class FreshPartitionPreloader {
  private probedSitemaps: Set<string> = new Set();

  async sampleAndPromotePartition(
    sitemapUrl: string,
    publisher: { id: string; name: string; domain: string; country: string; language: string; category: string },
    priorityFrontier: PriorityHarvestFrontier,
    partitionManager: PartitionIntelligenceManager
  ): Promise<{ directRefs: YouTubeHarvestReference[]; promotedCount: number; isElite: boolean }> {
    const directRefs: YouTubeHarvestReference[] = [];
    let promotedCount = 0;
    let isElite = false;

    if (this.probedSitemaps.has(sitemapUrl)) return { directRefs, promotedCount, isElite };
    this.probedSitemaps.add(sitemapUrl);

    try {
      const res = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'YouAppTV-AtlasV4.1/1.0' }
      });

      if (!res.ok) return { directRefs, promotedCount, isElite };
      const xmlText = await res.text();

      // 1. Extraer referencias directas
      const extractedDirect = parseFeedOrSitemapForYouTubeRefs(xmlText, {
        type: 'video_sitemap',
        sourceUrl: sitemapUrl,
        publisherId: publisher.id,
        publisherName: publisher.name,
        country: publisher.country,
        language: publisher.language,
        category: publisher.category
      });

      for (const d of extractedDirect) {
        priorityFrontier.pushDirectReference(d);
        directRefs.push(d);
      }

      // 2. Extraer URLs y Child Sitemaps
      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match: RegExpExecArray | null;
      const urlsInSitemap: string[] = [];
      const childSitemaps: string[] = [];

      while ((match = locRegex.exec(xmlText)) !== null) {
        const locUrl = match[1].trim();
        if (locUrl.endsWith('.xml')) {
          childSitemaps.push(locUrl);
        } else {
          urlsInSitemap.push(locUrl);
        }
      }

      // Si es un Sitemap Index con child sitemaps, expandir hasta 12 particiones hijas
      for (const childUrl of childSitemaps.slice(0, 12)) {
        if (!this.probedSitemaps.has(childUrl)) {
          this.probedSitemaps.add(childUrl);
          try {
            const cRes = await fetch(childUrl, {
              signal: AbortSignal.timeout(6000),
              headers: { 'User-Agent': 'YouAppTV-AtlasV4.1/1.0' }
            });
            if (cRes.ok) {
              const cXml = await cRes.text();
              const cDirect = parseFeedOrSitemapForYouTubeRefs(cXml, {
                type: 'video_sitemap',
                sourceUrl: childUrl,
                publisherId: publisher.id,
                publisherName: publisher.name,
                country: publisher.country,
                language: publisher.language,
                category: publisher.category
              });

              for (const cd of cDirect) {
                priorityFrontier.pushDirectReference(cd);
                directRefs.push(cd);
              }

              const cLocRegex = /<loc>([^<]+)<\/loc>/gi;
              let cm: RegExpExecArray | null;
              while ((cm = cLocRegex.exec(cXml)) !== null) {
                const aUrl = cm[1].trim();
                if (!aUrl.endsWith('.xml')) {
                  urlsInSitemap.push(aUrl);
                }
              }
            }
          } catch {
            // Ignorar timeouts
          }
        }
      }

      // Evaluar densidad de la partición
      let totalScore = 0;
      for (const u of urlsInSitemap) {
        const pProb = calculatePageYouTubeProbability(u);
        const freshness = calculateDateFreshnessFactor(u);
        totalScore += (pProb * freshness);
      }

      const avgExpectedScore = urlsInSitemap.length > 0 ? (totalScore / urlsInSitemap.length) : 0;
      isElite = avgExpectedScore >= 0.30 || directRefs.length >= 2;

      // Promover a HighPriorityFrontier
      for (const u of urlsInSitemap) {
        const partitionKey = partitionManager.getPartitionKey(publisher.id, sitemapUrl, u);
        priorityFrontier.pushHtmlTarget(
          u,
          publisher.domain,
          publisher.id,
          publisher.name,
          sitemapUrl,
          partitionKey,
          publisher.country,
          publisher.language,
          publisher.category,
          0.80,
          0.85,
          false
        );
        promotedCount++;
      }

      // 3. Si la partición es Elite, expandir cohortes adyacentes (Neighbor Expansion)
      if (isElite) {
        const sisterSitemaps = generateAdjacentCohorts(sitemapUrl);
        for (const sister of sisterSitemaps.slice(0, 4)) {
          if (!this.probedSitemaps.has(sister)) {
            this.sampleAndPromotePartition(sister, publisher, priorityFrontier, partitionManager).catch(() => {});
          }
        }
      }
    } catch {
      // Ignorar timeouts en preloader
    }

    return { directRefs, promotedCount, isElite };
  }
}
