/**
 * ATLAS FIELD SCORE, TORQUE & QUEUE SLIP ENGINE V1
 * 
 * Implements:
 * - ATLAS_FIELD_SCORE (Multi-dimensional value scoring for task prioritization)
 * - ATLAS_TORQUE (Verified Knowledge Gain / Time)
 * - QUEUE_SLIP (Bottleneck detection across the 6 industrial queues)
 */

import type { IndustrialQueueName } from '../AtlasIndustrialQueueOrchestrator';

export interface FieldScoreInput {
  queue_name: IndustrialQueueName;
  source_id: string;
  net_new_verified_yield: number;
  identity_confidence: number;      // 0.0 - 1.0
  source_authority: number;         // 0.0 - 1.0
  freshness_score: number;          // 0.0 - 1.0
  queue_backlog: number;            // number of pending items
  source_value_score: number;       // base value 1-100
  search_p99_ms: number;            // search latency in ms
  db_latency_ms: number;            // database roundtrip ms
  error_rate: number;               // 0.0 - 1.0
  is_rate_limited: boolean;
  external_cost_usd: number;
  privacy_risk_factor: number;      // 0.0 (safe) - 1.0 (blocked)
}

export interface QueueSlipMetrics {
  DISCOVERY_SLIP: number;
  PREFLIGHT_SLIP: number;
  INGESTION_SLIP: number;
  IDENTITY_SLIP: number;
  INDEX_SLIP: number;
  AUDIT_SLIP: number;
  PRIMARY_BOTTLENECK: IndustrialQueueName | 'BALANCED';
  RECOMMENDED_PRIORITY_ADJUSTMENTS: Record<IndustrialQueueName, number>;
}

export interface AtlasTorqueMetrics {
  NET_NEW_VERIFIED_PERSONS_PER_MIN: number;
  NEW_VERIFIED_RELATIONS_PER_MIN: number;
  IDENTITY_RESOLUTIONS_PER_MIN: number;
  FRESHNESS_UPDATES_PER_MIN: number;
  WEIGHTED_KNOWLEDGE_GAIN_PER_MIN: number;
  TORQUE_EFFICIENCY_RATIO: number; // Knowledge gain / compute resource unit
}

export class AtlasFieldScore {
  /**
   * Calculates ATLAS_FIELD_SCORE for a potential job or queue.
   * Fail-closed: returns 0 if rate limited or high privacy risk.
   */
  public static calculateFieldScore(input: FieldScoreInput): { score: number; reason_codes: string[] } {
    const reasons: string[] = [];

    if (input.is_rate_limited) {
      return { score: 0, reason_codes: ['SOURCE_RATE_LIMITED_COOLDOWN'] };
    }
    if (input.privacy_risk_factor >= 0.8) {
      return { score: 0, reason_codes: ['HIGH_PRIVACY_RISK_BLOCKED'] };
    }

    // 1. Value Component
    const yieldFactor = Math.min(2.0, Math.log10(Math.max(1, input.net_new_verified_yield)) / 3.0); // scales yield
    const qualityFactor = input.identity_confidence * input.source_authority * (1.0 - input.privacy_risk_factor);
    const valueComponent = input.source_value_score * yieldFactor * qualityFactor;

    // 2. Health Penalties
    // 2. Health Penalties & Boosts
    let searchHealthFactor = 1.0;
    if (input.search_p99_ms > 800) {
      if (input.queue_name === 'INGESTION_QUEUE') {
        // If Search P99 > 800ms, penalize ingestion to protect query responsiveness
        searchHealthFactor = Math.max(0.1, 1.0 - ((input.search_p99_ms - 800) / 1000));
        reasons.push(`SEARCH_P99_ELEVATED (${input.search_p99_ms}ms) -> Ingestion penalized`);
      } else if (input.queue_name === 'INDEX_REFRESH_QUEUE') {
        // Boost index refresh when search P99 is elevated to resolve index slip
        searchHealthFactor = 1.0 + Math.min(2.0, (input.search_p99_ms - 800) / 500);
        reasons.push(`SEARCH_P99_ELEVATED (${input.search_p99_ms}ms) -> Index refresh boosted (+${searchHealthFactor.toFixed(1)}x)`);
      }
    }

    const dbHealthFactor = input.db_latency_ms < 100 ? 1.0 : Math.max(0.3, 1.0 - (input.db_latency_ms / 500));
    const errorPenalty = Math.max(0.1, 1.0 - (input.error_rate * 2.0));
    const costFactor = Math.max(0.5, 1.0 / (1.0 + input.external_cost_usd * 10));

    // 3. Backlog urgency boost
    const urgencyBoost = Math.min(1.5, 1.0 + (input.queue_backlog / 50000));

    // Final Field Score
    const finalScore = Math.max(0, Number((valueComponent * searchHealthFactor * dbHealthFactor * errorPenalty * costFactor * urgencyBoost).toFixed(2)));

    reasons.push(`YieldFactor: ${yieldFactor.toFixed(2)}, Quality: ${qualityFactor.toFixed(2)}, Urgency: ${urgencyBoost.toFixed(2)}`);
    return { score: finalScore, reason_codes: reasons };
  }

  /**
   * Calculates QUEUE_SLIP and identifies bottlenecks.
   * If Ingestion is moving fast while Search P99 worsens, INDEX_SLIP rises and demands index priority.
   */
  public static calculateQueueSlip(
    queueDepths: Record<IndustrialQueueName, number>,
    searchP99Ms: number,
    unresolvedCount: number,
    ingestionVelocityPerMin: number
  ): QueueSlipMetrics {
    const adjustments: Record<IndustrialQueueName, number> = {
      DISCOVERY_QUEUE: 0,
      PREFLIGHT_QUEUE: 0,
      INGESTION_QUEUE: 0,
      IDENTITY_RESOLUTION_QUEUE: 0,
      INDEX_REFRESH_QUEUE: 0,
      AUDIT_QUEUE: 0
    };

    // Index slip rises sharply when Search P99 > 800ms and ingestion is active
    let indexSlip = 0;
    if (searchP99Ms > 800) {
      indexSlip = Number((((searchP99Ms - 800) / 800) * 100).toFixed(1));
      adjustments.INDEX_REFRESH_QUEUE = +25;
      adjustments.INGESTION_QUEUE = -20;
    }

    // Identity slip rises when unresolved author holdout accumulates
    const identitySlip = Number((Math.min(100, unresolvedCount / 1000)).toFixed(1));
    if (identitySlip > 60) {
      adjustments.IDENTITY_RESOLUTION_QUEUE = +15;
    }

    // Ingestion slip rises when BIEP backlog is huge but ingestion is idle
    const ingestionSlip = ingestionVelocityPerMin > 0 ? 10 : 75;

    // Discovery & Preflight slips
    const discoverySlip = queueDepths.DISCOVERY_QUEUE > 200 ? 50 : 15;
    const preflightSlip = queueDepths.PREFLIGHT_QUEUE > 100 ? 60 : 10;
    const auditSlip = 5;

    let primaryBottleneck: IndustrialQueueName | 'BALANCED' = 'BALANCED';
    const slips = [
      { q: 'INDEX_REFRESH_QUEUE' as IndustrialQueueName, slip: indexSlip },
      { q: 'IDENTITY_RESOLUTION_QUEUE' as IndustrialQueueName, slip: identitySlip },
      { q: 'INGESTION_QUEUE' as IndustrialQueueName, slip: ingestionSlip },
      { q: 'PREFLIGHT_QUEUE' as IndustrialQueueName, slip: preflightSlip },
      { q: 'DISCOVERY_QUEUE' as IndustrialQueueName, slip: discoverySlip }
    ].sort((a, b) => b.slip - a.slip);

    if (slips[0].slip > 40) {
      primaryBottleneck = slips[0].q;
    }

    return {
      DISCOVERY_SLIP: discoverySlip,
      PREFLIGHT_SLIP: preflightSlip,
      INGESTION_SLIP: ingestionSlip,
      IDENTITY_SLIP: identitySlip,
      INDEX_SLIP: indexSlip,
      AUDIT_SLIP: auditSlip,
      PRIMARY_BOTTLENECK: primaryBottleneck,
      RECOMMENDED_PRIORITY_ADJUSTMENTS: adjustments
    };
  }

  /**
   * Calculates ATLAS_TORQUE: Verified Knowledge Gain / Time.
   */
  public static calculateTorque(
    netNewPersonsPerMin: number,
    relationsPerMin: number,
    identityResolutionsPerMin: number,
    freshnessUpdatesPerMin: number,
    authorityWeight = 0.95,
    confidenceWeight = 1.0
  ): AtlasTorqueMetrics {
    const weightedPersons = netNewPersonsPerMin * 1.0 * authorityWeight * confidenceWeight;
    const weightedRelations = relationsPerMin * 0.3 * authorityWeight;
    const weightedResolutions = identityResolutionsPerMin * 0.5 * authorityWeight;
    const weightedFreshness = freshnessUpdatesPerMin * 0.2;

    const totalKnowledgeGain = Number((weightedPersons + weightedRelations + weightedResolutions + weightedFreshness).toFixed(1));
    const efficiencyRatio = Number((totalKnowledgeGain / 2.0).toFixed(1)); // per 2 concurrent workers

    return {
      NET_NEW_VERIFIED_PERSONS_PER_MIN: netNewPersonsPerMin,
      NEW_VERIFIED_RELATIONS_PER_MIN: relationsPerMin,
      IDENTITY_RESOLUTIONS_PER_MIN: identityResolutionsPerMin,
      FRESHNESS_UPDATES_PER_MIN: freshnessUpdatesPerMin,
      WEIGHTED_KNOWLEDGE_GAIN_PER_MIN: totalKnowledgeGain,
      TORQUE_EFFICIENCY_RATIO: efficiencyRatio
    };
  }
}
