/**
 * Atlas Demand Radar V1 — Normalization Engine
 * Source-Native Baseline Normalization, Relative Lift, Z-Score & Acceleration
 */

import type { SourcePlatform, MetricKind, NormalizedMetric, SourceRollingBaseline, RegionCode } from './types';

/**
 * Standard Normal CDF approximation (Abramowitz and Stegun)
 * Converts a Z-Score into an exact percentile (0..100)
 */
export function normalCdf(z: number): number {
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014337 * Math.exp(-0.5 * z * z);
  const prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? (1.0 - prob) * 100 : prob * 100;
}

/**
 * Normalizes a source-native metric value against its historical baseline.
 * Invariant: Never add raw volumes across different sources.
 */
export function normalizeSourceMetric(
  platform: SourcePlatform,
  metricKind: MetricKind,
  actualValue: number,
  baseline: SourceRollingBaseline,
  priorActualValue?: number
): NormalizedMetric {
  const safeMean = Math.max(baseline.mean, 0.001);
  const safeStdDev = Math.max(baseline.std_dev, 0.001);

  // 1. Relative Lift (e.g. 2.5x baseline)
  const relativeLift = +(actualValue / safeMean).toFixed(3);

  // 2. Statistical Z-Score
  const zScore = +((actualValue - safeMean) / safeStdDev).toFixed(3);

  // 3. Percentile (0..100)
  const percentile = +Math.min(100, Math.max(0, normalCdf(zScore))).toFixed(1);

  // 4. Normalized Velocity Score (0..100)
  // Combines relative lift and statistical percentile
  let velocityScore = 0;
  if (relativeLift <= 1.0) {
    velocityScore = Math.min(50, percentile * 0.5);
  } else {
    // Scaled above baseline: 2x lift gives ~75, 4x lift gives ~90, 8x lift gives ~98
    const liftBonus = Math.min(50, Math.log2(relativeLift) * 16.6);
    velocityScore = Math.min(100, Math.max(0, 50 + liftBonus));
  }
  velocityScore = +velocityScore.toFixed(1);

  // 5. Acceleration Score (-100..+100)
  let accelerationScore = 0;
  if (priorActualValue !== undefined) {
    const priorLift = priorActualValue / safeMean;
    const deltaLift = relativeLift - priorLift;
    // Map deltaLift to -100..+100 range
    accelerationScore = +Math.min(100, Math.max(-100, deltaLift * 25)).toFixed(1);
  } else {
    // If no prior, derive conservative acceleration from z-score
    accelerationScore = +Math.min(100, Math.max(-100, zScore * 15)).toFixed(1);
  }

  return {
    source_platform: platform,
    metric_kind: metricKind,
    actual_value: actualValue,
    baseline_mean: safeMean,
    relative_lift: relativeLift,
    z_score: zScore,
    percentile,
    velocity_score: velocityScore,
    acceleration_score: accelerationScore
  };
}

/**
 * In-memory baseline manager with time-of-day and regional awareness.
 */
export class BaselineRegistry {
  private baselines: Map<string, SourceRollingBaseline> = new Map();

  private makeKey(platform: SourcePlatform, topic: string, region: RegionCode, hourOfDay: number): string {
    return `${platform}:${topic.toLowerCase().trim()}:${region}:${hourOfDay}`;
  }

  setBaseline(baseline: SourceRollingBaseline): void {
    const key = this.makeKey(
      baseline.source_platform,
      baseline.cluster_id_or_topic,
      baseline.region_code,
      baseline.hour_of_day
    );
    this.baselines.set(key, baseline);
  }

  getBaseline(
    platform: SourcePlatform,
    topic: string,
    region: RegionCode,
    hourOfDay: number
  ): SourceRollingBaseline {
    const key = this.makeKey(platform, topic, region, hourOfDay);
    const existing = this.baselines.get(key);
    if (existing) return existing;

    // Default fallback baseline when no specific history exists
    return {
      source_platform: platform,
      cluster_id_or_topic: topic,
      region_code: region,
      hour_of_day: hourOfDay,
      mean: platform === 'GOOGLE_TRENDS_FAST' || platform === 'GOOGLE_TRENDS_SLOW' ? 35.0 : 100.0,
      std_dev: platform === 'GOOGLE_TRENDS_FAST' || platform === 'GOOGLE_TRENDS_SLOW' ? 12.0 : 30.0,
      p50: platform === 'GOOGLE_TRENDS_FAST' || platform === 'GOOGLE_TRENDS_SLOW' ? 35.0 : 100.0,
      p90: platform === 'GOOGLE_TRENDS_FAST' || platform === 'GOOGLE_TRENDS_SLOW' ? 55.0 : 150.0,
      sample_count: 30,
      updated_at: new Date().toISOString()
    };
  }
}
