/**
 * ATLAS SOURCE GENOME V1
 * Module: AtlasSourcePerformance.ts
 * Path: src/lib/atlas/sources/AtlasSourcePerformance.ts
 * 
 * Tracks strictly observed operational metrics for Sources and Routes.
 * Invariant: Never invent metrics. Only record verified executions.
 * Unobserved metrics must be typed as UNKNOWN with attempts = 0.
 */

export type MetricNature = 'OBSERVED' | 'SEEDED' | 'DERIVED' | 'UNKNOWN';

export interface SourceExecutionObservation {
  source_id: string;
  route_id?: string;
  success: boolean;
  raw_rows: number;
  admitted_rows: number;
  certified_rows: number;
  latency_ms: number;
  error_class?: string | null;
  timestamp?: string;
}

export interface AtlasSourcePerformance {
  source_id: string;
  route_id?: string;
  attempts: number;
  success: number;
  raw_rows: number;
  admitted_rows: number;
  certified_rows: number;

  yield: number | null;
  yield_nature: MetricNature;

  quality: number;
  quality_nature: MetricNature;

  latency: number | null;
  latency_nature: MetricNature;

  success_rate: number | null;
  success_rate_nature: MetricNature;

  error_class: string | null;
  last_success: string | null;
  last_probe: string | null;
  yield_history: number[]; // Strictly observed past yields
}

export class AtlasSourcePerformanceTracker {
  /**
   * Initializes a pure zero-state performance record.
   * Invariant: attempts = 0, historical_yield = null (UNKNOWN), no synthetic 99% / 92%.
   */
  public static createInitial(source_id: string, route_id?: string, seededQuality: number = 0.5): AtlasSourcePerformance {
    return {
      source_id,
      route_id,
      attempts: 0,
      success: 0,
      raw_rows: 0,
      admitted_rows: 0,
      certified_rows: 0,
      yield: null,
      yield_nature: 'UNKNOWN',
      quality: seededQuality,
      quality_nature: 'SEEDED',
      latency: null,
      latency_nature: 'UNKNOWN',
      success_rate: null,
      success_rate_nature: 'UNKNOWN',
      error_class: null,
      last_success: null,
      last_probe: null,
      yield_history: []
    };
  }

  /**
   * Updates an existing performance record with a newly observed physical execution.
   * Transitions metric nature from UNKNOWN/SEEDED to OBSERVED.
   */
  public static applyObservation(
    prev: AtlasSourcePerformance,
    obs: SourceExecutionObservation
  ): AtlasSourcePerformance {
    const attempts = prev.attempts + 1;
    const success = prev.success + (obs.success ? 1 : 0);
    const raw_rows = prev.raw_rows + obs.raw_rows;
    const admitted_rows = prev.admitted_rows + obs.admitted_rows;
    const certified_rows = prev.certified_rows + obs.certified_rows;
    
    // Observed single-run yield
    const runYield = obs.raw_rows > 0 ? obs.certified_rows / obs.raw_rows : (obs.success && obs.certified_rows > 0 ? 1.0 : 0.0);
    const yieldHistory = [...(prev.yield_history || []), Math.round(runYield * 1000) / 1000].slice(-10);
    
    // Cumulative observed yield
    const overallYield = raw_rows > 0 ? certified_rows / raw_rows : (attempts > 0 ? certified_rows / attempts : 0);
    const successRate = attempts > 0 ? success / attempts : 0;
    
    // Exponential moving average for latency
    const prevLat = prev.latency ?? obs.latency_ms;
    const latency = prev.attempts === 0 
      ? obs.latency_ms 
      : Math.round(prevLat * 0.7 + obs.latency_ms * 0.3);

    const now = obs.timestamp || new Date().toISOString();

    // Derived quality: combination of observed yield and success rate
    const observedQuality = Math.min(1.0, Math.round(((overallYield * 0.6) + (successRate * 0.4)) * 100) / 100);

    return {
      source_id: prev.source_id,
      route_id: prev.route_id,
      attempts,
      success,
      raw_rows,
      admitted_rows,
      certified_rows,
      yield: Math.round(overallYield * 1000) / 1000,
      yield_nature: 'OBSERVED',
      quality: observedQuality,
      quality_nature: 'OBSERVED',
      latency,
      latency_nature: 'OBSERVED',
      success_rate: Math.round(successRate * 1000) / 1000,
      success_rate_nature: 'OBSERVED',
      error_class: obs.success ? null : (obs.error_class || 'UNKNOWN_ERROR'),
      last_success: obs.success ? now : prev.last_success,
      last_probe: now,
      yield_history: yieldHistory
    };
  }
}
