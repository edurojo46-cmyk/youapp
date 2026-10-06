/**
 * sourceIntelligence.ts — Inteligencia y Aprendizaje de Rendimiento de Fuentes (Harvester V3)
 */

export interface SourceIntelligenceData {
  sourceId: string;
  sourceName: string;
  pagesFetched: number;
  youtubeRefsFound: number;
  alreadyKnown: number;
  netNew: number;

  videoHitRate: number;        // youtubeRefsFound / pagesFetched
  noveltyRate: number;         // netNew / youtubeRefsFound
  netNewVelocity: number;      // netNew / seconds

  avgLatencyMs: number;
  errorRate: number;
  score: number;
  tier: 'elite' | 'strong' | 'usable' | 'low' | 'paused';
}

// Histórico precargado del Canary y Speedrun de 60m para arrancar con inteligencia previa
const PRELOADED_INTELLIGENCE: Record<string, Partial<SourceIntelligenceData>> = {
  jenesaispop_es: { pagesFetched: 5000, youtubeRefsFound: 4532, netNew: 3224, videoHitRate: 0.90, noveltyRate: 0.71, netNewVelocity: 8.4, score: 0.85, tier: 'elite' },
  billboard_news: { pagesFetched: 4000, youtubeRefsFound: 3121, netNew: 2047, videoHitRate: 0.78, noveltyRate: 0.65, netNewVelocity: 6.5, score: 0.80, tier: 'elite' },
  rolling_stone_global: { pagesFetched: 6000, youtubeRefsFound: 3959, netNew: 1514, videoHitRate: 0.65, noveltyRate: 0.38, netNewVelocity: 4.2, score: 0.65, tier: 'strong' },
  pitchfork_media: { pagesFetched: 3500, youtubeRefsFound: 2128, netNew: 813, videoHitRate: 0.60, noveltyRate: 0.38, netNewVelocity: 3.5, score: 0.62, tier: 'strong' },
  stereogum_site: { pagesFetched: 500, youtubeRefsFound: 450, netNew: 280, videoHitRate: 0.90, noveltyRate: 0.62, netNewVelocity: 4.0, score: 0.75, tier: 'strong' },
  genbeta_software: { pagesFetched: 400, youtubeRefsFound: 299, netNew: 291, videoHitRate: 0.74, noveltyRate: 0.97, netNewVelocity: 2.0, score: 0.70, tier: 'strong' },
  open_culture_music: { pagesFetched: 800, youtubeRefsFound: 650, netNew: 210, videoHitRate: 0.81, noveltyRate: 0.32, netNewVelocity: 2.5, score: 0.55, tier: 'usable' },
  hipertextual_cultura: { pagesFetched: 15000, youtubeRefsFound: 11561, netNew: 540, videoHitRate: 0.77, noveltyRate: 0.047, netNewVelocity: 0.3, score: 0.05, tier: 'paused' }
};

export class SourceIntelligenceManager {
  private registry: Record<string, SourceIntelligenceData> = {};
  private sourceTimingMs: Record<string, number> = {};

  constructor() {
    this.initializeFromMemory();
  }

  private initializeFromMemory(): void {
    for (const [id, pre] of Object.entries(PRELOADED_INTELLIGENCE)) {
      this.registry[id] = {
        sourceId: id,
        sourceName: id,
        pagesFetched: pre.pagesFetched || 0,
        youtubeRefsFound: pre.youtubeRefsFound || 0,
        alreadyKnown: (pre.youtubeRefsFound || 0) - (pre.netNew || 0),
        netNew: pre.netNew || 0,
        videoHitRate: pre.videoHitRate || 0.5,
        noveltyRate: pre.noveltyRate || 0.5,
        netNewVelocity: pre.netNewVelocity || 1.0,
        avgLatencyMs: 350,
        errorRate: 0.01,
        score: pre.score || 0.5,
        tier: pre.tier || 'usable'
      };
      this.sourceTimingMs[id] = 1000;
    }
  }

  getNoveltyRate(sourceId: string): number {
    return this.registry[sourceId]?.noveltyRate ?? 0.5;
  }

  getVideoHitRate(sourceId: string): number {
    return this.registry[sourceId]?.videoHitRate ?? 0.5;
  }

  getSourceScore(sourceId: string): number {
    return this.registry[sourceId]?.score ?? 0.5;
  }

  isSourcePaused(sourceId: string): boolean {
    return this.registry[sourceId]?.tier === 'paused';
  }

  recordObservation(
    sourceId: string,
    sourceName: string,
    pagesFetchedDelta: number,
    youtubeFoundDelta: number,
    netNewDelta: number,
    latencyMs: number,
    hasError: boolean
  ): void {
    if (!this.registry[sourceId]) {
      this.registry[sourceId] = {
        sourceId,
        sourceName,
        pagesFetched: 0,
        youtubeRefsFound: 0,
        alreadyKnown: 0,
        netNew: 0,
        videoHitRate: 0.5,
        noveltyRate: 0.5,
        netNewVelocity: 1.0,
        avgLatencyMs: 400,
        errorRate: 0,
        score: 0.5,
        tier: 'usable'
      };
      this.sourceTimingMs[sourceId] = 1000;
    }

    const s = this.registry[sourceId];
    s.sourceName = sourceName;
    s.pagesFetched += pagesFetchedDelta;
    s.youtubeRefsFound += youtubeFoundDelta;
    s.netNew += netNewDelta;
    s.alreadyKnown += Math.max(0, youtubeFoundDelta - netNewDelta);
    this.sourceTimingMs[sourceId] = (this.sourceTimingMs[sourceId] || 1000) + latencyMs;

    s.videoHitRate = s.pagesFetched > 0 ? +(s.youtubeRefsFound / s.pagesFetched).toFixed(3) : 0.5;
    s.noveltyRate = s.youtubeRefsFound > 0 ? +(s.netNew / s.youtubeRefsFound).toFixed(3) : 0.5;

    const seconds = Math.max(1, (this.sourceTimingMs[sourceId] || 1000) / 1000);
    s.netNewVelocity = +(s.netNew / seconds).toFixed(2);

    if (hasError) s.errorRate = +((s.errorRate * 0.9) + 0.1).toFixed(3);
    else s.errorRate = +(s.errorRate * 0.95).toFixed(3);

    // Cálculo del SourceScore compuesto
    const errorPenalty = Math.max(0.1, 1 - s.errorRate);
    s.score = +((s.videoHitRate * 0.35 + s.noveltyRate * 0.45 + Math.min(1, s.netNewVelocity / 10) * 0.20) * errorPenalty).toFixed(3);

    if (s.noveltyRate < 0.05 && s.youtubeRefsFound >= 200) s.tier = 'paused';
    else if (s.score >= 0.75) s.tier = 'elite';
    else if (s.score >= 0.55) s.tier = 'strong';
    else if (s.score >= 0.30) s.tier = 'usable';
    else s.tier = 'low';
  }

  getAllIntelligence(): Record<string, SourceIntelligenceData> {
    return this.registry;
  }
}
