/**
 * harvestScheduler.ts — Scheduler Adaptativo con Priorización por NetNewVelocity y Yield Corregido
 */

import type { PublisherHarvestSource, SourceHarvestTelemetry } from './types';

export class HarvestScheduler {
  private sources: PublisherHarvestSource[] = [];
  private telemetry: Record<string, SourceHarvestTelemetry> = {};
  private sourceTimingMs: Record<string, number> = {};

  constructor(sources: PublisherHarvestSource[]) {
    this.sources = [...sources];
    for (const s of sources) {
      this.telemetry[s.id] = {
        sourceId: s.id,
        sourceName: s.name,
        rawReferencesScanned: 0,
        youtubeRefsFound: 0,
        alreadyInAtlas: 0,
        netNewYouTube: 0,
        errorsCount: 0,
        latencyMs: 0,
        yieldRate: 0,
        status: 'active'
      };
      this.sourceTimingMs[s.id] = 1;
    }
  }

  getActiveSources(): PublisherHarvestSource[] {
    return this.sources
      .filter(s => s.enabled && this.telemetry[s.id]?.status !== 'paused')
      .sort((a, b) => {
        const scoreA = this.calculatePriorityScore(a.id);
        const scoreB = this.calculatePriorityScore(b.id);
        return scoreB - scoreA;
      });
  }

  private calculatePriorityScore(sourceId: string): number {
    const t = this.telemetry[sourceId];
    if (!t) return 0;

    const seconds = Math.max(1, (this.sourceTimingMs[sourceId] || 1000) / 1000);
    const velocity = t.netNewYouTube / seconds;
    const yieldFactor = Math.max(0.05, t.yieldRate);

    return velocity * yieldFactor;
  }

  recordSourceResult(
    sourceId: string,
    rawScanned: number,
    youtubeFound: number,
    alreadyKnown: number,
    netNew: number,
    latencyMs: number,
    hasError: boolean
  ): void {
    const t = this.telemetry[sourceId];
    if (!t) return;

    t.rawReferencesScanned += rawScanned;
    t.youtubeRefsFound += youtubeFound;
    t.alreadyInAtlas += alreadyKnown;
    t.netNewYouTube += netNew;
    t.latencyMs = latencyMs;
    this.sourceTimingMs[sourceId] = (this.sourceTimingMs[sourceId] || 0) + latencyMs;
    if (hasError) t.errorsCount++;

    // Cálculo matemático exacto de Yield: netNew / youtubeRefsFound
    t.yieldRate = t.youtubeRefsFound > 0 ? +(t.netNewYouTube / t.youtubeRefsFound).toFixed(4) : 0;

    // Control de tasa adaptativo
    if (t.youtubeRefsFound >= 100) {
      if (t.yieldRate < 0.05) {
        t.status = 'paused';
      } else if (t.yieldRate < 0.15) {
        t.status = 'throttled';
      } else {
        t.status = 'active';
      }
    }
  }

  getTelemetryMap(): Record<string, SourceHarvestTelemetry> {
    return this.telemetry;
  }
}
