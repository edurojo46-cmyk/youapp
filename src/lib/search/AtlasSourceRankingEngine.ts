import { SourceCapabilityRegistry, type RegisteredSource } from './SourceCapabilityRegistry';
import type { QueryIntent } from './UniversalQueryModel';

export interface SourceOutcomeSignal {
  source_id: string;
  query_intent: QueryIntent;
  outcome_type: 'USER_ACCEPTED_EVIDENCE' | 'USER_REJECTED_EVIDENCE' | 'CONTRADICTION_DISPROVED' | 'LATENCY_TIMEOUT' | 'SOURCE_FAILURE';
  latency_ms: number;
  recorded_at: string;
}

export interface SourceHistoricalStats {
  source_id: string;
  total_queries: number;
  success_count: number;
  failure_count: number;
  positive_outcomes: number;
  negative_outcomes: number;
  avg_latency_ms: number;
  factual_success_rate: number;
  last_updated_at: string;
}

export class AtlasSourceRankingEngine {
  private static stats: Map<string, SourceHistoricalStats> = new Map();

  public static recordOutcomeSignal(signal: SourceOutcomeSignal): SourceHistoricalStats {
    let current = this.stats.get(signal.source_id);
    if (!current) {
      current = {
        source_id: signal.source_id,
        total_queries: 0,
        success_count: 0,
        failure_count: 0,
        positive_outcomes: 0,
        negative_outcomes: 0,
        avg_latency_ms: signal.latency_ms,
        factual_success_rate: 1.0,
        last_updated_at: new Date().toISOString()
      };
      this.stats.set(signal.source_id, current);
    }

    current.total_queries++;
    if (signal.outcome_type === 'USER_ACCEPTED_EVIDENCE') {
      current.success_count++;
      current.positive_outcomes++;
    } else if (signal.outcome_type === 'USER_REJECTED_EVIDENCE' || signal.outcome_type === 'CONTRADICTION_DISPROVED') {
      current.failure_count++;
      current.negative_outcomes++;
    } else if (signal.outcome_type === 'SOURCE_FAILURE' || signal.outcome_type === 'LATENCY_TIMEOUT') {
      current.failure_count++;
    }

    // Controlled moving average for latency
    current.avg_latency_ms = Math.round((current.avg_latency_ms * 0.8) + (signal.latency_ms * 0.2));
    const totalOutcomes = current.positive_outcomes + current.negative_outcomes;
    current.factual_success_rate = totalOutcomes > 0 ? Number((current.positive_outcomes / totalOutcomes).toFixed(3)) : 1.0;
    current.last_updated_at = new Date().toISOString();

    return current;
  }

  public static getSourceStats(sourceId: string): SourceHistoricalStats | undefined {
    return this.stats.get(sourceId);
  }

  public static getAllStats(): Record<string, { successCount: number; failureCount: number; avgLatencyMs: number }> {
    const res: Record<string, { successCount: number; failureCount: number; avgLatencyMs: number }> = {};
    for (const [id, s] of this.stats.entries()) {
      res[id] = {
        successCount: s.success_count,
        failureCount: s.failure_count,
        avgLatencyMs: s.avg_latency_ms
      };
    }
    return res;
  }

  public static rankSourcesForIntent(
    sources: RegisteredSource[],
    intent: QueryIntent,
    freshnessRequired: boolean = false
  ): Array<{ source: RegisteredSource; score: number; reason_codes: any }> {
    const historyMap = this.getAllStats();

    const scored = sources.map(src => {
      const hist = historyMap[src.source_id];
      const result = SourceCapabilityRegistry.computeSourceScore(src, intent, {
        history: hist,
        freshnessRequired
      });
      return {
        source: src,
        score: result.score,
        reason_codes: result.reason_codes
      };
    });

    // Sort descending by score
    return scored.sort((a, b) => b.score - a.score);
  }

  public static clear(): void {
    this.stats.clear();
  }

  /**
   * Controlled 10H Outcome Integration (Condition 9)
   * Converts 10H Ledger / delivery / user interaction events into controlled, bounded signals.
   * Invariant: Outcomes adjust ranking in a bounded, auditable manner (never unrestrained).
   */
  public static process10hOutcomeSignal(event: {
    source_system: string;
    event_type: string;
    event_class?: string;
    latency_ms?: number;
    intent?: QueryIntent;
  }): SourceHistoricalStats | null {
    const sourceId = event.source_system;
    let outcomeType: SourceOutcomeSignal['outcome_type'] = 'USER_ACCEPTED_EVIDENCE';

    if (event.event_type.includes('BOUNCE') || event.event_type.includes('FAILURE') || event.event_type.includes('ERROR')) {
      outcomeType = 'SOURCE_FAILURE';
    } else if (event.event_type.includes('COMPLAINT') || event.event_type.includes('REJECT')) {
      outcomeType = 'USER_REJECTED_EVIDENCE';
    } else if (event.event_type.includes('TIMEOUT')) {
      outcomeType = 'LATENCY_TIMEOUT';
    } else {
      outcomeType = 'USER_ACCEPTED_EVIDENCE';
    }

    return this.recordOutcomeSignal({
      source_id: sourceId,
      query_intent: event.intent || { raw_query: `10h_event_${event.event_type}` },
      outcome_type: outcomeType,
      latency_ms: Math.min(Math.max(event.latency_ms || 150, 10), 10000), // Clamped latency
      recorded_at: new Date().toISOString()
    });
  }
}
