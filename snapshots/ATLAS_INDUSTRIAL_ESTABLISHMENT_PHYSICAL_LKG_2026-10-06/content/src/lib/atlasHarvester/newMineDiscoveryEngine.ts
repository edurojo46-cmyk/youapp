/**
 * newMineDiscoveryEngine.ts — Calificador de Minas Adaptativo 25➔100➔250 con Invariante Completo (V4)
 */

import { extractFromArticlePage } from './parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import type { HarvestDedupeIndex } from './harvestDedupeIndex';

export type MineTier = 'mega' | 'elite' | 'strong' | 'tactical' | 'small_clean' | 'saturated' | 'inconclusive';

export interface MineQualificationResult {
  domain: string;
  publisherId: string;
  publisherName: string;
  sitemapUrl: string;
  category: string;

  samplePagesCount: number;
  samplingStage: 'stage1_25' | 'stage2_100' | 'stage3_250';
  directRefsCount: number;
  htmlRefsCount: number;
  totalRefsFound: number;
  alreadyKnownInAtlas: number;
  netNewCount: number;

  videoHitRate: number;                // totalRefs / samplePages
  rawNoveltyRate: number;              // netNew / totalRefs
  observedNetNewPerPage: number;       // netNew / samplePages
  conservativeNetNewPerPage: number;   // Wilson Lower Bound (95% CI)
  confidenceScore: number;             // 0.0 - 1.0 based on sample size
  avgLatencyMs: number;

  totalUrlsInSitemap: number;
  remainingUrlsInSitemap: number;
  pointPotentialNetNew: number;        // remainingUrls * observedNetNewPerPage
  conservativePotentialNetNew: number; // remainingUrls * conservativeNetNewPerPage

  tier: MineTier;
  megaMineProbability: number;
  qualificationReason: string;
}

export interface MineDiscoverySummary {
  domainsExamined: number;
  sitemapsSampled: number;
  megaMinesFound: number;
  eliteMinesFound: number;
  strongMinesFound: number;
  tacticalMinesFound: number;
  smallCleanFound: number;
  saturatedMinesDiscarded: number;
  inconclusiveMinesCount: number;

  totalPagesSampled: number;
  totalPointPotentialNetNew: number;
  totalConservativePotentialNetNew: number;
  discoveryEfficiency: number; // totalConservativePotential / totalPagesSampled
  requiredTo100K: number;
  fuelCoverageRatio: number;   // totalConservativePotential / requiredTo100K
  qualifiedMines: MineQualificationResult[];
}

/**
 * Calcula el Límite Inferior Conservador de Wilson (95% confianza)
 */
export function calculateWilsonLowerBound(successes: number, totalTrials: number, z = 1.96): number {
  if (totalTrials === 0 || successes === 0) return 0;
  const rawRate = successes / totalTrials;
  const p = Math.min(1.0, rawRate);
  const denominator = 1 + (z * z) / totalTrials;
  const centerAdjusted = p + (z * z) / (2 * totalTrials);
  const variance = Math.max(0, (p * (1 - p)) / totalTrials + (z * z) / (4 * totalTrials * totalTrials));
  const spread = z * Math.sqrt(variance);
  const baseBound = Math.max(0, (centerAdjusted - spread) / denominator);
  const multiplier = rawRate > 1.0 ? rawRate : 1.0;
  return +(baseBound * multiplier).toFixed(3);
}

export class NewMineDiscoveryEngine {
  private probedSitemaps: Set<string> = new Set();

  async qualifySitemapPartition(
    sitemapUrl: string,
    publisher: { id: string; name: string; domain: string; country: string; language: string; category: string },
    dedupeIndex: HarvestDedupeIndex
  ): Promise<MineQualificationResult | null> {
    if (this.probedSitemaps.has(sitemapUrl)) return null;
    this.probedSitemaps.add(sitemapUrl);

    const t0 = Date.now();
    try {
      const res = await fetch(sitemapUrl, {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!res.ok) return null;
      const xmlText = await res.text();

      // 1. Extraer referencias directas de YouTube en XML
      const directRefs = parseFeedOrSitemapForYouTubeRefs(xmlText, {
        type: 'video_sitemap',
        sourceUrl: sitemapUrl,
        publisherId: publisher.id,
        publisherName: publisher.name,
        country: publisher.country,
        language: publisher.language,
        category: publisher.category
      });

      let directNetNew = 0;
      for (const d of directRefs) {
        if (!dedupeIndex.isDuplicate(d.videoId)) {
          directNetNew++;
        }
      }

      // 2. Extraer URLs
      const candidateUrls: string[] = [];
      const childSitemaps: string[] = [];

      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match: RegExpExecArray | null;
      while ((match = locRegex.exec(xmlText)) !== null) {
        const url = match[1].trim();
        if (url.endsWith('.xml')) {
          childSitemaps.push(url);
        } else {
          candidateUrls.push(url);
        }
      }

      const linkRegex = /<link>(https?:\/\/[^<]+)<\/link>/gi;
      let linkMatch: RegExpExecArray | null;
      while ((linkMatch = linkRegex.exec(xmlText)) !== null) {
        const url = linkMatch[1].trim();
        if (!url.endsWith('.xml') && !url.includes('/feed') && !url.includes('/rss')) {
          candidateUrls.push(url);
        }
      }

      // Si es sitemap index con child sitemaps, expandir hasta 6 particiones
      if (candidateUrls.length === 0 && childSitemaps.length > 0) {
        for (const cUrl of childSitemaps.slice(0, 6)) {
          try {
            const cRes = await fetch(cUrl, {
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
            });
            if (cRes.ok) {
              const cXml = await cRes.text();
              const cLocRegex = /<loc>([^<]+)<\/loc>/gi;
              let cm: RegExpExecArray | null;
              while ((cm = cLocRegex.exec(cXml)) !== null) {
                const aUrl = cm[1].trim();
                if (!aUrl.endsWith('.xml')) {
                  candidateUrls.push(aUrl);
                }
              }
            }
          } catch {
            // Ignorar timeouts
          }
        }
      }

      const totalUrlsInSitemap = candidateUrls.length;
      if (totalUrlsInSitemap === 0 && directRefs.length === 0) return null;

      // ==========================================
      // ETAPA 1: MUESTREO INICIAL (25 PÁGINAS)
      // ==========================================
      let sampledUrls: string[] = [];
      let htmlRefsFound = 0;
      let htmlNetNew = 0;
      let totalLatency = 0;
      let stage: 'stage1_25' | 'stage2_100' | 'stage3_250' = 'stage1_25';

      const stage1Batch = candidateUrls.slice(0, 25);
      sampledUrls.push(...stage1Batch);

      const runBatch = async (batch: string[]) => {
        const promises = batch.map(async url => {
          const pageResult = await extractFromArticlePage({
            url,
            domain: publisher.domain,
            publisherId: publisher.id,
            publisherName: publisher.name,
            country: publisher.country,
            language: publisher.language,
            category: publisher.category,
            priority: 1
          });
          totalLatency += pageResult.latencyMs;
          for (const ref of pageResult.references) {
            htmlRefsFound++;
            if (!dedupeIndex.isDuplicate(ref.videoId)) {
              htmlNetNew++;
            }
          }
        });
        await Promise.all(promises);
      };

      if (stage1Batch.length > 0) {
        await runBatch(stage1Batch);
      }

      let currentSampleCount = Math.max(1, sampledUrls.length);
      let stage1NetNewRate = htmlNetNew / currentSampleCount;

      // ==========================================
      // ETAPA 2: PROFUNDIZACIÓN (100 PÁGINAS)
      // ==========================================
      if (stage1NetNewRate >= 0.15 && candidateUrls.length > 25) {
        stage = 'stage2_100';
        const stage2Batch = candidateUrls.slice(25, 100);
        sampledUrls.push(...stage2Batch);
        await runBatch(stage2Batch);

        currentSampleCount = Math.max(1, sampledUrls.length);
        const stage2NetNewRate = htmlNetNew / currentSampleCount;

        // ==========================================
        // ETAPA 3: CALIFICACIÓN MASIVA (250 PÁGINAS)
        // ==========================================
        if (stage2NetNewRate >= 0.15 && candidateUrls.length > 100) {
          stage = 'stage3_250';
          const stage3Batch = candidateUrls.slice(100, 250);
          sampledUrls.push(...stage3Batch);
          await runBatch(stage3Batch);
        }
      }

      const samplePagesCount = Math.max(1, sampledUrls.length);
      const totalRefsFound = directRefs.length + htmlRefsFound;
      const totalNetNew = directNetNew + htmlNetNew;
      const alreadyKnown = Math.max(0, totalRefsFound - totalNetNew);

      const videoHitRate = +(totalRefsFound / samplePagesCount).toFixed(3);
      const rawNoveltyRate = totalRefsFound > 0 ? +(totalNetNew / totalRefsFound).toFixed(3) : 0;
      const observedNetNewPerPage = +(totalNetNew / samplePagesCount).toFixed(3);
      const conservativeNetNewPerPage = calculateWilsonLowerBound(totalNetNew, samplePagesCount);
      const confidenceScore = +(Math.min(1.0, samplePagesCount / 200)).toFixed(2);
      const avgLatencyMs = Math.round(totalLatency / samplePagesCount) || (Date.now() - t0);

      const isRssFeed = sitemapUrl.includes('/rss') || sitemapUrl.includes('mrss') || sitemapUrl.includes('feed');
      const actualRemainingUrls = Math.max(0, totalUrlsInSitemap - samplePagesCount);
      const remainingUrls = isRssFeed ? 0 : actualRemainingUrls;
      const pointPotentialNetNew = Math.round(remainingUrls * observedNetNewPerPage) + directNetNew;
      const conservativePotentialNetNew = Math.round(remainingUrls * conservativeNetNewPerPage) + directNetNew;

      // Cálculo de MegaMineProbability
      let megaMineProbability = 0.05;
      if (totalUrlsInSitemap >= 5000) megaMineProbability += 0.35;
      if (directRefs.length >= 10) megaMineProbability += 0.25;
      if (rawNoveltyRate >= 0.60) megaMineProbability += 0.25;
      if (observedNetNewPerPage >= 0.30) megaMineProbability += 0.20;
      megaMineProbability = +Math.min(1.0, megaMineProbability).toFixed(2);

      // Clasificación Taxonómica Rigurosa (Sin Gaps de Invariante)
      let tier: MineTier = 'inconclusive';
      let qualificationReason = 'Mina evaluada';

      if (conservativePotentialNetNew >= 5000) {
        tier = 'mega';
        qualificationReason = `MEGA MINA: Potencial conservador >5.000 (${conservativePotentialNetNew.toLocaleString()} net-new) con novelty ${(rawNoveltyRate * 100).toFixed(0)}%`;
      } else if (conservativePotentialNetNew >= 2000) {
        tier = 'elite';
        qualificationReason = `MINA ELITE: Potencial conservador >2.000 (${conservativePotentialNetNew.toLocaleString()} net-new) con novelty ${(rawNoveltyRate * 100).toFixed(0)}%`;
      } else if (conservativePotentialNetNew >= 500) {
        tier = 'strong';
        qualificationReason = `MINA FUERTE: Potencial conservador >500 (${conservativePotentialNetNew.toLocaleString()} net-new)`;
      } else if (conservativePotentialNetNew >= 100) {
        tier = 'tactical';
        qualificationReason = `MINA TÁCTICA: Potencial 100-500 (${conservativePotentialNetNew} net-new)`;
      } else if (rawNoveltyRate >= 0.60 && (directNetNew > 0 || totalNetNew > 0)) {
        tier = 'small_clean';
        qualificationReason = `MINA PEQUEÑA LIMPIA: Alta pureza (${(rawNoveltyRate * 100).toFixed(0)}%) con volumen <100 (${conservativePotentialNetNew})`;
      } else if (rawNoveltyRate < 0.10 || (observedNetNewPerPage < 0.04 && directNetNew === 0)) {
        tier = 'saturated';
        qualificationReason = `MINA SATURADA / ESCASA: Novedad <10% o nulo retorno. Descartada.`;
      } else {
        tier = 'inconclusive';
        qualificationReason = `MUESTRA INCONCLUSA: Muestra no concluyente (${samplePagesCount}p).`;
      }

      return {
        domain: publisher.domain,
        publisherId: publisher.id,
        publisherName: publisher.name,
        sitemapUrl,
        category: publisher.category,
        samplePagesCount,
        samplingStage: stage,
        directRefsCount: directRefs.length,
        htmlRefsCount: htmlRefsFound,
        totalRefsFound,
        alreadyKnownInAtlas: alreadyKnown,
        netNewCount: totalNetNew,
        videoHitRate,
        rawNoveltyRate,
        observedNetNewPerPage,
        conservativeNetNewPerPage,
        confidenceScore,
        avgLatencyMs,
        totalUrlsInSitemap,
        remainingUrlsInSitemap: remainingUrls,
        pointPotentialNetNew,
        conservativePotentialNetNew,
        tier,
        megaMineProbability,
        qualificationReason
      };
    } catch {
      return null;
    }
  }
}
