/**
 * ATLAS OPPORTUNITY ENGINE V1
 * Module: AtlasOpportunityHypothesis.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunityHypothesis.ts
 * 
 * Commercial Opportunity Hypothesis Model.
 * Represents an inferred commercial hypothesis derived from corroborated signals.
 * 
 * Strict Invariants:
 * - NATURE IS ALWAYS INFERRED:
 *   An opportunity is never an objective physical fact; it is a probabilistic commercial hypothesis.
 * - STRICT SEPARATION:
 *   TRUTH = qué observamos.
 *   TEMPORAL = qué cambió.
 *   OPPORTUNITY = qué podría significar comercialmente.
 * - NO INVENTAR NECESIDAD:
 *   Prohibited to state "Company X needs software/solar panels".
 *   Permitted to state "Company X presents public signals compatible with industrial expansion / new business / contactability".
 * - DEDUPLICATION:
 *   Logical key: subject_id + opportunity_type + reasoning_version.
 */

import crypto from 'crypto';

export type OpportunityType =
  | 'EXPANSION_SIGNAL'
  | 'PROCUREMENT_SIGNAL'
  | 'HIRING_SIGNAL'
  | 'DIGITALIZATION_SIGNAL'
  | 'INFRASTRUCTURE_SIGNAL'
  | 'NEW_MARKET_SIGNAL'
  | 'NEW_BUSINESS_SIGNAL'
  | 'CONTACTABILITY_SIGNAL';

export type OpportunityStatus =
  | 'ACTIVE'
  | 'WEAK'
  | 'EXPIRED'
  | 'DISMISSED'
  | 'CONVERTED';

export interface WhyOpportunityExplanation {
  observed_facts: string[];
  inferred_hypothesis: string;
  signals_breakdown: Array<{
    signal_type: string;
    source_id: string;
    date: string;
    description: string;
  }>;
  contactability_metrics?: {
    contactability_score: number;
    verified_emails: number;
    verified_phones: number;
    verified_linkedin: number;
    distinct_sources_count: number;
    is_multisource: boolean;
  };
  commercial_status?: 'ACTIVE' | 'NOT_DETERMINED';
}

export interface OpportunityHypothesis {
  opportunity_id: string;
  subject_type: 'PERSON' | 'COMPANY' | 'ORGANIZATION';
  subject_id: string;
  opportunity_type: OpportunityType;
  supporting_signals: string[];
  supporting_assertions: string[];
  supporting_events: string[];
  score: number | null;       // 0.00 - 1.00 (commercial strength / momentum). NULL if only contactability!
  opportunity_score?: number | null; // Explicit separation!
  contactability_score?: number; // 0.00 - 1.00 (calculated independently)
  confidence: number;  // 0.00 - 1.00 (evidence robustness / corroboration)
  reasoning_version: string;
  first_detected: string;
  last_supported: string;
  expires_at: string;
  status: OpportunityStatus;
  nature: 'INFERRED';  // Invariant: always INFERRED!
  why_explanation: WhyOpportunityExplanation;
  environment: 'TEST' | 'PRODUCTION';
  created_at: string;
  updated_at: string;
}

export class AtlasOpportunityHypothesisHelper {
  public static generateOpportunityId(
    subject_id: string,
    opportunity_type: OpportunityType,
    reasoning_version: string = 'v1.0'
  ): string {
    const raw = `${subject_id}:${opportunity_type}:${reasoning_version}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
    return `OPP_${opportunity_type}_${hash}`;
  }
}
