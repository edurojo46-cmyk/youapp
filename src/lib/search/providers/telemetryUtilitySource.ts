import { supabase } from '../../supabase';
import type { ProviderUtilitySource, ProviderUtilityContext, ProviderUtilityRecord } from '../types';
import fs from 'fs';
import path from 'path';

interface TelemetryRow {
  provider: string;
  context_level: string;
  intent: string | null;
  topic_cluster: string | null;
  language: string | null;
  freshness: string | null;
  content_format: string | null;
  
  sample_size: number;
  calls: number;
  successes: number;
  candidates: number;
  eligible_candidates: number;
  top20_entries: number;
  top5_entries: number;
  avg_latency_ms: number;
  
  top20_conversion: number | null;
  top5_conversion: number | null;
  
  updated_at: string;
}

export class TelemetryUtilitySource implements ProviderUtilitySource {
  private cache = new Map<string, TelemetryRow>();
  private lastRefresh = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private isRefreshing = false;

  constructor() {
    // Initial fetch
    this.refreshIfStale();
  }

  getUtility(provider: string, context: ProviderUtilityContext): ProviderUtilityRecord | null {
    this.refreshIfStale();
    return this.lookupCached(provider, context);
  }

  private async refreshIfStale() {
    if (this.isRefreshing) return;
    if (Date.now() - this.lastRefresh < this.CACHE_TTL_MS) return;

    this.isRefreshing = true;
    try {
      const { data, error } = await supabase
        .from('telemetry_provider_conversion')
        .select('*');

      if (error) {
        console.warn('[TelemetryUtilitySource] Failed to fetch telemetry:', error);
        return;
      }

      let telemetryData = data as TelemetryRow[];

      // Force fallback for benchmark/local
      try {
        const seedPath = path.join(process.cwd(), 'telemetry_seed.json');
        if (fs.existsSync(seedPath)) {
          telemetryData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
          console.log(`[TelemetryUtilitySource] Loaded ${telemetryData.length} records from seed`);
        }
      } catch (e) {
        // ignore
      }

      if (!telemetryData) {
        telemetryData = [];
      }

      const newCache = new Map<string, TelemetryRow>();
      for (const row of telemetryData) {
        const key = this.buildKey(
          row.provider, 
          row.intent, 
          row.topic_cluster, 
          row.language, 
          row.freshness, 
          row.content_format
        );
        newCache.set(key, row);
      }
      
      this.cache = newCache;
      this.lastRefresh = Date.now();
    } catch (e) {
      console.warn('[TelemetryUtilitySource] Exception during refresh:', e);
    } finally {
      this.isRefreshing = false;
    }
  }

  private buildKey(
    provider: string, 
    intent?: string | null, 
    topic?: string | null, 
    lang?: string | null, 
    freshness?: string | null, 
    format?: string | null
  ): string {
    return [
      provider.toLowerCase(),
      (intent || '*').toLowerCase(),
      (topic || '*').toLowerCase(),
      (lang || '*').toLowerCase(),
      (freshness || '*').toLowerCase(),
      (format || '*').toLowerCase()
    ].join('|');
  }

  private lookupCached(provider: string, context: ProviderUtilityContext): ProviderUtilityRecord | null {
    // Context fallback sequence:
    // 1. provider+intent+topic+format+lang+freshness (Full match)
    // 2. provider+intent+topic+format+lang
    // 3. provider+intent+topic+format
    // 4. provider+intent+topic
    // 5. provider+intent
    // 6. provider global

    const fallbacks = [
      this.buildKey(provider, context.intent, context.topicCluster, context.language, context.freshness, context.contentFormat),
      this.buildKey(provider, context.intent, context.topicCluster, context.language, null, context.contentFormat),
      this.buildKey(provider, context.intent, context.topicCluster, null, null, context.contentFormat),
      this.buildKey(provider, context.intent, context.topicCluster, null, null, null),
      this.buildKey(provider, context.intent, null, null, null, null),
      this.buildKey(provider, null, null, null, null, null), // Global
    ];

    let row: TelemetryRow | undefined;
    for (const key of fallbacks) {
      row = this.cache.get(key);
      if (row && row.sample_size > 0) {
        break; // Found a valid aggregate
      }
    }

    if (!row) return null;

    return this.calculateUtility(row);
  }

  private calculateUtility(row: TelemetryRow): ProviderUtilityRecord {
    // V1 Empirical Provider Performance Formula
    // Weights
    const W_TOP20 = 0.30;
    const W_TOP5 = 0.20;
    const W_SUCCESS = 0.15;
    const W_YIELD = 0.10;
    const W_LATENCY = 0.10;
    const W_RADAR = 0.10;
    const W_RELIABILITY = 0.05;

    let totalWeight = 0;
    let score = 0;

    // 1. Top20 Conversion
    if (row.top20_conversion !== null && row.eligible_candidates > 0) {
      score += (row.top20_conversion * 100) * W_TOP20;
      totalWeight += W_TOP20;
    }

    // 2. Top5 Conversion
    if (row.top5_conversion !== null && row.eligible_candidates > 0) {
      score += (row.top5_conversion * 100) * W_TOP5;
      totalWeight += W_TOP5;
    }

    // 3. Search Success
    if (row.calls > 0) {
      const successRate = row.successes / row.calls;
      score += (successRate * 100) * W_SUCCESS;
      totalWeight += W_SUCCESS;
    }

    // 4. Eligible Yield
    if (row.candidates > 0) {
      const yieldRate = row.eligible_candidates / row.candidates;
      score += (yieldRate * 100) * W_YIELD;
      totalWeight += W_YIELD;
    }

    // 5. Latency Efficiency
    if (row.avg_latency_ms !== null) {
      // 0ms = 100%, >=2000ms = 0%
      let eff = Math.max(0, 2000 - row.avg_latency_ms) / 2000;
      score += (eff * 100) * W_LATENCY;
      totalWeight += W_LATENCY;
    }

    // 6. Radar Avoidance (Not yet in aggregation, absent)
    // 7. Reliability (Not yet in aggregation, absent)

    let finalUtility = 0;
    if (totalWeight > 0) {
      // Renormalize weights (absent != 0)
      finalUtility = score / totalWeight;
    }

    return {
      learned_utility: Math.round(finalUtility),
      sample_size: row.sample_size,
      updated_at: row.updated_at,
      
      top20Conversion: row.top20_conversion || undefined,
      top5Conversion: row.top5_conversion || undefined,
      searchSuccess: row.calls > 0 ? (row.successes / row.calls) : undefined,
      eligibleYield: row.candidates > 0 ? (row.eligible_candidates / row.candidates) : undefined,
      latencyEfficiency: row.avg_latency_ms,
      
      top20SampleSize: row.eligible_candidates,
      top5SampleSize: row.eligible_candidates,
      searchSuccessSampleSize: row.calls,
      eligibleYieldSampleSize: row.candidates,
      latencySampleSize: row.calls
    };
  }
}
