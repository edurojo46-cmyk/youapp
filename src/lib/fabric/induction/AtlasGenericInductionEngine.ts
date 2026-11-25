/**
 * ATLAS GENERIC INDUCTION ENGINE V1
 * 
 * Generalizes the Atlas Induction Engine across multiple domains.
 * Implements DOMAIN_FIELD_SCORE to prioritize work among domains
 * without creating parallel induction pipelines.
 * 
 * Invariants:
 * - Strictly 2 concurrent workers (MAX_CONCURRENT_WORKERS = 2)
 * - Domain Fairness & Priority Balancing
 * - Dynamic queue decision: DISCOVERY, INGESTION, ENRICHMENT, REFRESH, SATURATED
 */

import type { IndustrialQueueName } from '../../orchestrator/AtlasIndustrialQueueOrchestrator';

export interface DomainTelemetryInput {
  domain_id: string;
  backlog: number;
  fuel_available: number;
  scale_yield: number; // 0.0 - 1.0
  depth_yield: number; // 0.0 - 1.0
  freshness_score: number; // 0.0 - 1.0 (1.0 = highly fresh)
  domain_priority: number; // 1-100
  resource_pressure: number; // 0.0 - 1.0
  rate_limit_pressure: number; // 0.0 - 1.0 (1.0 = fully rate limited)
  last_indexed_entity_count: number;
}

export type DomainInductionAction = 
  | 'DISCOVERY'
  | 'INGESTION'
  | 'ATTRIBUTE_ENRICHMENT'
  | 'INDEX_REFRESH'
  | 'SATURATED_COOLDOWN';

export interface DomainFieldScoreResult {
  domain_id: string;
  domain_field_score: number;
  recommended_action: DomainInductionAction;
  target_queue: IndustrialQueueName;
  priority_weight: number;
  reason: string;
  is_saturated: boolean;
}

export class AtlasGenericInductionEngine {
  public static readonly MAX_CONCURRENT_WORKERS = 2;

  /**
   * Calculates DOMAIN_FIELD_SCORE for a domain.
   * Higher score = higher priority for worker allocation.
   */
  public static calculateDomainFieldScore(input: DomainTelemetryInput): DomainFieldScoreResult {
    // 1. Check Rate Limit Pressure (Fail-closed)
    if (input.rate_limit_pressure >= 0.9) {
      return {
        domain_id: input.domain_id,
        domain_field_score: 0,
        recommended_action: 'SATURATED_COOLDOWN',
        target_queue: 'AUDIT_QUEUE',
        priority_weight: 0,
        reason: 'Rate limit pressure critical (>=90%), backoff active',
        is_saturated: true
      };
    }

    // 2. Saturation Check: Low fuel and low yields
    if (input.fuel_available < 100 && input.scale_yield < 0.05 && input.depth_yield < 0.05) {
      return {
        domain_id: input.domain_id,
        domain_field_score: 15,
        recommended_action: 'DISCOVERY',
        target_queue: 'DISCOVERY_QUEUE',
        priority_weight: 30,
        reason: 'Domain fuel exhausted and yield depleted; triggering fresh discovery',
        is_saturated: true
      };
    }

    // 3. Score calculation
    // Yield component combines scale (40%) and depth (60%)
    const blendedYield = (input.scale_yield * 0.40) + (input.depth_yield * 0.60);
    const fuelBonus = Math.min(25, Math.log10(Math.max(10, input.fuel_available)) * 5);
    const backlogPenalty = Math.min(20, input.backlog / 500);
    const stalenessPenalty = (1.0 - input.freshness_score) * 20;

    let score = (input.domain_priority * 0.35) 
              + (blendedYield * 40) 
              + fuelBonus 
              + stalenessPenalty 
              - backlogPenalty;

    score = Math.max(5, Math.min(100, Math.round(score)));

    // 4. Action Decision Logic
    let action: DomainInductionAction;
    let targetQueue: IndustrialQueueName;
    let reason: string;

    if (input.freshness_score < 0.4) {
      action = 'INDEX_REFRESH';
      targetQueue = 'INDEX_REFRESH_QUEUE';
      reason = 'Data freshness below 40%; index refresh scheduled';
    } else if (input.fuel_available > 5000 && input.scale_yield >= 0.30) {
      action = 'INGESTION';
      targetQueue = 'INGESTION_QUEUE';
      reason = 'Abundant fuel (>5,000) and strong scale yield (>=30%); continuous ingestion prioritized';
    } else if (input.depth_yield >= 0.50) {
      action = 'ATTRIBUTE_ENRICHMENT';
      targetQueue = 'ATTRIBUTE_ENRICHMENT_QUEUE';
      reason = 'High depth enrichment yield (>=50%); enriching existing profiles';
    } else if (input.fuel_available < 1000) {
      action = 'DISCOVERY';
      targetQueue = 'DISCOVERY_QUEUE';
      reason = 'Fuel below 1,000 threshold; Penta-Radar discovery sweep active';
    } else {
      action = 'INGESTION';
      targetQueue = 'INGESTION_QUEUE';
      reason = 'Standard balanced ingestion';
    }

    return {
      domain_id: input.domain_id,
      domain_field_score: score,
      recommended_action: action,
      target_queue: targetQueue,
      priority_weight: score,
      reason,
      is_saturated: false
    };
  }

  /**
   * Evaluates multiple domains and allocates worker slots (strictly up to 2 workers).
   */
  public static scheduleMultiDomainWorkers(domains: DomainTelemetryInput[]): {
    evaluations: DomainFieldScoreResult[];
    worker_allocations: { worker_id: string; domain_id: string; action: DomainInductionAction; target_queue: IndustrialQueueName }[];
  } {
    const evaluations = domains.map(d => this.calculateDomainFieldScore(d));
    
    // Sort by domain_field_score descending
    const sorted = [...evaluations].sort((a, b) => b.domain_field_score - a.domain_field_score);

    const allocations: { worker_id: string; domain_id: string; action: DomainInductionAction; target_queue: IndustrialQueueName }[] = [];

    // Worker 1: Top scoring domain
    if (sorted.length > 0) {
      allocations.push({
        worker_id: 'ATLAS_WORKER_1',
        domain_id: sorted[0].domain_id,
        action: sorted[0].recommended_action,
        target_queue: sorted[0].target_queue
      });
    }

    // Worker 2: Second domain if available, or secondary action on top domain
    if (sorted.length > 1) {
      allocations.push({
        worker_id: 'ATLAS_WORKER_2',
        domain_id: sorted[1].domain_id,
        action: sorted[1].recommended_action,
        target_queue: sorted[1].target_queue
      });
    } else if (sorted.length === 1) {
      allocations.push({
        worker_id: 'ATLAS_WORKER_2',
        domain_id: sorted[0].domain_id,
        action: 'ATTRIBUTE_ENRICHMENT',
        target_queue: 'ATTRIBUTE_ENRICHMENT_QUEUE'
      });
    }

    return {
      evaluations,
      worker_allocations: allocations
    };
  }
}
