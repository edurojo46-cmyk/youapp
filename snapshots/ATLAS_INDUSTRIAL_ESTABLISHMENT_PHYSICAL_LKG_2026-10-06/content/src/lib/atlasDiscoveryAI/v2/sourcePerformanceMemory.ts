/**
 * sourcePerformanceMemory.ts — Memoria de Rendimiento Histórico de Fuentes para Discovery AI V2
 */

import type { DiscoveryChannel } from '../types';
import type { SourcePerformanceRecord } from './typesV2';

class SourcePerformanceMemoryStore {
  private records: Map<string, SourcePerformanceRecord> = new Map();

  constructor() {
    this.seedInitialPerformance();
  }

  private seedInitialPerformance() {
    const initialSeed: Array<Partial<SourcePerformanceRecord> & { publisherId: string; channel: DiscoveryChannel }> = [
      {
        publisherId: 'discovery_ai_broadcaster_urbanaplay',
        publisherName: 'Urbana Play FM Archive',
        channel: 'broadcaster_archive',
        sampleSize: 42,
        totalScanned: 350,
        netNew: 325,
        historicalYieldRatio: 0.928,
        noveltyScore: 0.94,
        rolling7dYield: 0.935,
        rolling30dYield: 0.928,
        confidence: 0.96,
        freshnessWeight: 0.98,
        effectiveScore: 0.873,
        reliabilityScore: 0.95
      },
      {
        publisherId: 'discovery_ai_broadcaster_sbt',
        publisherName: 'SBT Brasil Archival Feed',
        channel: 'broadcaster_archive',
        sampleSize: 38,
        totalScanned: 280,
        netNew: 240,
        historicalYieldRatio: 0.859,
        noveltyScore: 0.88,
        rolling7dYield: 0.865,
        rolling30dYield: 0.859,
        confidence: 0.94,
        freshnessWeight: 0.95,
        effectiveScore: 0.767,
        reliabilityScore: 0.92
      },
      {
        publisherId: 'discovery_ai_bluesky_cultural',
        publisherName: 'Bluesky AT-Protocol Cultural Stream',
        channel: 'bluesky_backfill',
        sampleSize: 85,
        totalScanned: 620,
        netNew: 480,
        historicalYieldRatio: 0.774,
        noveltyScore: 0.82,
        rolling7dYield: 0.785,
        rolling30dYield: 0.774,
        confidence: 0.98,
        freshnessWeight: 0.96,
        effectiveScore: 0.728,
        reliabilityScore: 0.88
      },
      {
        publisherId: 'discovery_ai_sitemap_eldestape',
        publisherName: 'El Destape Audiovisual Archive',
        channel: 'publisher_sitemap',
        sampleSize: 20,
        totalScanned: 150,
        netNew: 110,
        historicalYieldRatio: 0.733,
        noveltyScore: 0.79,
        rolling7dYield: 0.740,
        rolling30dYield: 0.733,
        confidence: 0.85,
        freshnessWeight: 0.90,
        effectiveScore: 0.561,
        reliabilityScore: 0.82
      },
      {
        publisherId: 'discovery_ai_generic_unverified',
        publisherName: 'Generic Unverified RSS Feeds',
        channel: 'rss',
        sampleSize: 15,
        totalScanned: 100,
        netNew: 4,
        historicalYieldRatio: 0.040,
        noveltyScore: 0.10,
        rolling7dYield: 0.035,
        rolling30dYield: 0.040,
        confidence: 0.70,
        freshnessWeight: 0.80,
        effectiveScore: 0.022,
        reliabilityScore: 0.15
      }
    ];

    for (const item of initialSeed) {
      const yieldR = item.historicalYieldRatio || 0.5;
      const conf = item.confidence || 0.8;
      const fresh = item.freshnessWeight || 0.9;
      const eff = +(yieldR * conf * fresh).toFixed(3);

      this.records.set(item.publisherId, {
        channel: item.channel,
        publisherId: item.publisherId,
        publisherName: item.publisherName || item.publisherId,
        sampleSize: item.sampleSize || 1,
        totalScanned: item.totalScanned || 10,
        netNew: item.netNew || 5,
        historicalYieldRatio: yieldR,
        noveltyScore: item.noveltyScore || 0.7,
        rolling7dYield: item.rolling7dYield || yieldR,
        rolling30dYield: item.rolling30dYield || yieldR,
        confidence: conf,
        freshnessWeight: fresh,
        effectiveScore: eff,
        reliabilityScore: item.reliabilityScore || 0.7,
        lastHarvestedAt: new Date().toISOString()
      });
    }
  }

  recordMissionHarvest(
    publisherId: string,
    channel: DiscoveryChannel,
    referencesScanned: number,
    netNewPersisted: number
  ) {
    const existing = this.records.get(publisherId);
    const now = Date.now();

    if (existing) {
      existing.sampleSize++;
      existing.totalScanned += referencesScanned;
      existing.netNew += netNewPersisted;
      existing.historicalYieldRatio = +(existing.netNew / Math.max(1, existing.totalScanned)).toFixed(3);
      existing.rolling7dYield = +( (existing.rolling7dYield * 0.8) + ((netNewPersisted / Math.max(1, referencesScanned)) * 0.2) ).toFixed(3);
      existing.rolling30dYield = +( (existing.rolling30dYield * 0.95) + ((netNewPersisted / Math.max(1, referencesScanned)) * 0.05) ).toFixed(3);
      
      // Confidence saturates toward 1.0 with sampleSize
      existing.confidence = Math.min(0.99, +(0.5 + (existing.sampleSize / 100) * 0.5).toFixed(2));
      
      // Freshness starts at 1.0 upon harvest
      existing.freshnessWeight = 1.0;
      
      // Effective Score = yield * confidence * freshnessWeight
      existing.effectiveScore = +(existing.historicalYieldRatio * existing.confidence * existing.freshnessWeight).toFixed(3);
      existing.reliabilityScore = Math.min(0.99, +(existing.effectiveScore * 0.9 + 0.1).toFixed(2));
      existing.lastHarvestedAt = new Date().toISOString();
    } else {
      const ratio = +(netNewPersisted / Math.max(1, referencesScanned)).toFixed(3);
      const conf = 0.60;
      const fresh = 1.00;
      const eff = +(ratio * conf * fresh).toFixed(3);

      this.records.set(publisherId, {
        channel,
        publisherId,
        publisherName: publisherId,
        sampleSize: 1,
        totalScanned: referencesScanned,
        netNew: netNewPersisted,
        historicalYieldRatio: ratio,
        noveltyScore: 0.80,
        rolling7dYield: ratio,
        rolling30dYield: ratio,
        confidence: conf,
        freshnessWeight: fresh,
        effectiveScore: eff,
        reliabilityScore: Math.min(0.99, +(eff * 0.9 + 0.1).toFixed(2)),
        lastHarvestedAt: new Date().toISOString()
      });
    }
  }

  getEmpiricalSourceWeights(): Record<DiscoveryChannel, number> {
    const channelScores: Record<string, { sum: number; count: number }> = {
      bluesky_backfill: { sum: 0.85, count: 1 },
      bluesky_live: { sum: 0.80, count: 1 },
      broadcaster_archive: { sum: 0.92, count: 1 },
      publisher_sitemap: { sum: 0.82, count: 1 },
      archive: { sum: 0.78, count: 1 },
      nostr: { sum: 0.65, count: 1 },
      rss: { sum: 0.30, count: 1 }
    };

    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;

    for (const rec of this.records.values()) {
      // Temporal Decay calculation: degrades 5% per 7 days of inactivity (min 0.4)
      const daysSinceHarvest = (now - new Date(rec.lastHarvestedAt).getTime()) / dayMs;
      rec.freshnessWeight = Math.max(0.40, +(1.0 - (daysSinceHarvest / 30) * 0.3).toFixed(2));
      rec.effectiveScore = +(rec.historicalYieldRatio * rec.confidence * rec.freshnessWeight).toFixed(3);

      if (!channelScores[rec.channel]) {
        channelScores[rec.channel] = { sum: 0, count: 0 };
      }
      channelScores[rec.channel].sum += rec.effectiveScore;
      channelScores[rec.channel].count++;
    }

    const result: Partial<Record<DiscoveryChannel, number>> = {};
    for (const [ch, data] of Object.entries(channelScores)) {
      result[ch as DiscoveryChannel] = +(data.sum / data.count).toFixed(2);
    }

    return result as Record<DiscoveryChannel, number>;
  }

  getTopYieldingPublishers(limit = 10): SourcePerformanceRecord[] {
    return Array.from(this.records.values())
      .sort((a, b) => b.effectiveScore - a.effectiveScore)
      .slice(0, limit);
  }
}

export const sourcePerformanceMemory = new SourcePerformanceMemoryStore();

