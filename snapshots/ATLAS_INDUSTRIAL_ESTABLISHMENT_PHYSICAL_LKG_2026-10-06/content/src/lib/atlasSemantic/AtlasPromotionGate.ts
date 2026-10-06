/**
 * AtlasPromotionGate.ts
 *
 * Governs evaluation and admission of Discovery Candidates into Canonical Identities.
 * Invariant: Discovery records do NOT automatically promote to Canonical Memory.
 * Invariant: CANONICAL_DB_DELTA = 0 during frozen baselines.
 */

export interface PromotionEvaluationCriteria {
  display_name: string;
  identity_confidence: number;
  distinct_domains_count: number;
  distinct_domains: string[];
  authority_tiers: string[];
  temporal_status: 'CURRENT_EVIDENCE' | 'RECENT_EVIDENCE' | 'HISTORICAL_EVIDENCE' | 'STALE_UNKNOWN';
  has_unresolved_conflicts: boolean;
  required_attributes_present: boolean;
}

export interface PromotionDecision {
  promoted: boolean;
  decision_code: 
    | 'PROMOTED' 
    | 'DENIED_FROZEN_BASELINE' 
    | 'DENIED_INSUFFICIENT_IDENTITY_CONFIDENCE' 
    | 'DENIED_INSUFFICIENT_DOMAINS' 
    | 'DENIED_HISTORICAL_ONLY' 
    | 'DENIED_UNRESOLVED_CONFLICTS' 
    | 'DENIED_MISSING_REQUIRED_ATTRIBUTES';
  reasons: string[];
  canonical_db_delta: number;
}

export class AtlasPromotionGate {
  // Promotion gate flag: Default strictly false (frozen)
  private static promotionGateEnabled: boolean = false;

  public static setPromotionGateEnabled(enabled: boolean): void {
    this.promotionGateEnabled = enabled;
  }

  public static isPromotionGateEnabled(): boolean {
    return this.promotionGateEnabled;
  }

  /**
   * Evaluates candidate promotion. By default, maintains CANONICAL_DB_DELTA = 0.
   */
  public static evaluateCandidate(criteria: PromotionEvaluationCriteria): PromotionDecision {
    const reasons: string[] = [];

    // 1. Check frozen baseline invariant
    if (!this.promotionGateEnabled) {
      return {
        promoted: false,
        decision_code: 'DENIED_FROZEN_BASELINE',
        reasons: ['CANONICAL_BASELINE_FROZEN: Automatic Discovery to Canonical promotion is disabled. CANONICAL_DB_DELTA = 0.'],
        canonical_db_delta: 0
      };
    }

    // 2. Identity Confidence Check (min 0.95)
    if (criteria.identity_confidence < 0.95) {
      reasons.push(`LOW_IDENTITY_CONFIDENCE: Confidence ${criteria.identity_confidence} is below required threshold 0.95`);
    }

    // 3. Multi-source Corroboration (min 2 distinct independent domains)
    if (criteria.distinct_domains_count < 2) {
      reasons.push(`INSUFFICIENT_DOMAINS: Found ${criteria.distinct_domains_count} distinct domain(s). Canonical promotion requires at least 2 independent domains.`);
    }

    // 4. Temporal Validity Check (No historical-only)
    if (criteria.temporal_status !== 'CURRENT_EVIDENCE') {
      reasons.push(`INVALID_TEMPORAL_STATUS: Status '${criteria.temporal_status}' is not CURRENT_EVIDENCE (2026). Historical records cannot be promoted as current canonical.`);
    }

    // 5. Conflict state
    if (criteria.has_unresolved_conflicts) {
      reasons.push('UNRESOLVED_CONFLICTS: Entity has contradictory claims across sources.');
    }

    // 6. Required attributes
    if (!criteria.required_attributes_present) {
      reasons.push('MISSING_REQUIRED_ATTRIBUTES: Lacks mandatory identity fields.');
    }

    if (reasons.length > 0) {
      let code: PromotionDecision['decision_code'] = 'DENIED_INSUFFICIENT_IDENTITY_CONFIDENCE';
      if (criteria.temporal_status !== 'CURRENT_EVIDENCE') code = 'DENIED_HISTORICAL_ONLY';
      else if (criteria.distinct_domains_count < 2) code = 'DENIED_INSUFFICIENT_DOMAINS';
      else if (criteria.has_unresolved_conflicts) code = 'DENIED_UNRESOLVED_CONFLICTS';
      else if (!criteria.required_attributes_present) code = 'DENIED_MISSING_REQUIRED_ATTRIBUTES';

      return {
        promoted: false,
        decision_code: code,
        reasons,
        canonical_db_delta: 0
      };
    }

    return {
      promoted: true,
      decision_code: 'PROMOTED',
      reasons: ['ALL_PROMOTION_CRITERIA_SATISFIED: Entity verified across >= 2 independent domains with active 2026 evidence.'],
      canonical_db_delta: 1
    };
  }
}
