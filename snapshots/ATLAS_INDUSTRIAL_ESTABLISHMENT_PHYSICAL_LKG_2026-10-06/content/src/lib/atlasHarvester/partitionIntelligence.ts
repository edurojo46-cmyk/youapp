/**
 * partitionIntelligence.ts — Inteligencia y Aprendizaje Granular por Partición Histórica (Harvester V4)
 *
 * Unidad de Aprendizaje:
 *  publisherId + sitemapName + pathPrefix + dateCohort
 *
 * Decadencia Temporal:
 *  weightedNovelty = (recent30s * 0.50) + (runNovelty * 0.30) + (lifetime * 0.20)
 */

export interface PartitionStats {
  partitionKey: string;
  publisherId: string;
  sitemapName: string;
  dateCohort: string;
  pathPrefix: string;

  pagesFetched: number;
  directRefsFound: number;
  htmlRefsFound: number;
  totalRefsFound: number;
  alreadyKnown: number;
  netNew: number;

  recent30sFound: number;
  recent30sNetNew: number;
  recent30sWindowTimestamp: number;

  videoHitRate: number;
  runNoveltyRate: number;
  recentNoveltyRate: number;
  weightedNoveltyRate: number;

  status: 'active' | 'throttled' | 'paused';
}

export function extractDateCohortAndPrefix(url: string): { dateCohort: string; pathPrefix: string } {
  const lower = url.toLowerCase();

  // Detección de Año/Cohorte (ej. /2026/, /2025/, /2024/, /2020/)
  const yearMatch = lower.match(/\b(201\d|202\d)\b/);
  const dateCohort = yearMatch ? yearMatch[1] : 'current';

  // Detección de Prefijo de Contenido
  let pathPrefix = 'general';
  if (/\/(?:videos?|clip|watch)\//i.test(lower)) pathPrefix = 'video';
  else if (/\/(?:music|musica|canciones)\//i.test(lower)) pathPrefix = 'music';
  else if (/\/(?:cultura|espectaculos|shows)\//i.test(lower)) pathPrefix = 'culture';
  else if (/\/(?:news|noticias|actualidad)\//i.test(lower)) pathPrefix = 'news';
  else if (/\/(?:apps?|software|gadgets?)\//i.test(lower)) pathPrefix = 'tech';

  return { dateCohort, pathPrefix };
}

export class PartitionIntelligenceManager {
  private partitions: Record<string, PartitionStats> = {};
  private globalStartTimestamp = Date.now();

  getPartitionKey(publisherId: string, sitemapName: string, url: string): string {
    const { dateCohort, pathPrefix } = extractDateCohortAndPrefix(url);
    const cleanSitemap = sitemapName.replace(/\.xml$/i, '').replace(/https?:\/\/[^/]+\//i, '');
    return `${publisherId}:${cleanSitemap}:${dateCohort}:${pathPrefix}`;
  }

  getWeightedNoveltyRate(partitionKey: string): number {
    const p = this.partitions[partitionKey];
    if (!p) return 0.50; // Prioridad neutra inicial
    return p.weightedNoveltyRate;
  }

  isPartitionPaused(partitionKey: string): boolean {
    return this.partitions[partitionKey]?.status === 'paused';
  }

  recordObservation(
    partitionKey: string,
    publisherId: string,
    sitemapName: string,
    url: string,
    isDirectRef: boolean,
    youtubeFoundCount: number,
    netNewCount: number,
    pagesCount: number
  ): void {
    const now = Date.now();
    const { dateCohort, pathPrefix } = extractDateCohortAndPrefix(url);

    if (!this.partitions[partitionKey]) {
      this.partitions[partitionKey] = {
        partitionKey,
        publisherId,
        sitemapName,
        dateCohort,
        pathPrefix,
        pagesFetched: 0,
        directRefsFound: 0,
        htmlRefsFound: 0,
        totalRefsFound: 0,
        alreadyKnown: 0,
        netNew: 0,
        recent30sFound: 0,
        recent30sNetNew: 0,
        recent30sWindowTimestamp: now,
        videoHitRate: 0.5,
        runNoveltyRate: 0.5,
        recentNoveltyRate: 0.5,
        weightedNoveltyRate: 0.5,
        status: 'active'
      };
    }

    const p = this.partitions[partitionKey];
    p.pagesFetched += pagesCount;
    if (isDirectRef) p.directRefsFound += youtubeFoundCount;
    else p.htmlRefsFound += youtubeFoundCount;
    p.totalRefsFound += youtubeFoundCount;
    p.netNew += netNewCount;
    p.alreadyKnown += Math.max(0, youtubeFoundCount - netNewCount);

    // Ventana Móvil de 30 segundos
    if (now - p.recent30sWindowTimestamp > 30000) {
      p.recent30sFound = youtubeFoundCount;
      p.recent30sNetNew = netNewCount;
      p.recent30sWindowTimestamp = now;
    } else {
      p.recent30sFound += youtubeFoundCount;
      p.recent30sNetNew += netNewCount;
    }

    // Cálculos de Novedad con Decadencia Temporal
    p.videoHitRate = p.pagesFetched > 0 ? +(p.totalRefsFound / p.pagesFetched).toFixed(3) : 1.0;
    p.runNoveltyRate = p.totalRefsFound > 0 ? +(p.netNew / p.totalRefsFound).toFixed(3) : 0.5;
    p.recentNoveltyRate = p.recent30sFound > 0 ? +(p.recent30sNetNew / p.recent30sFound).toFixed(3) : p.runNoveltyRate;

    // Fórmula V4: 50% reciente (30s) + 30% corrida actual + 20% histórico
    p.weightedNoveltyRate = +(
      p.recentNoveltyRate * 0.50 +
      p.runNoveltyRate * 0.30 +
      0.50 * 0.20
    ).toFixed(3);

    // Regla de Desactivación de Partición Saturada (Saturated Partition Cutoff)
    if (p.totalRefsFound >= 30 && p.weightedNoveltyRate < 0.05) {
      p.status = 'paused';
    } else if (p.weightedNoveltyRate < 0.15) {
      p.status = 'throttled';
    } else {
      p.status = 'active';
    }
  }

  getAllPartitions(): Record<string, PartitionStats> {
    return this.partitions;
  }
}
