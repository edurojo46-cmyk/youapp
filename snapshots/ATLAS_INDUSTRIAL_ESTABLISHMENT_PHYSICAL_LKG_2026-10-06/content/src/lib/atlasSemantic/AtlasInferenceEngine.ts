/**
 * Atlas Semantic Intelligence — Atlas Inference Engine V1
 * Deterministic rule-based inference engine with normalized lineage, versioning, and idempotency.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SemanticFact,
  SemanticRelationship,
  SemanticInference,
  InferenceStatus
} from './semanticTypes';

export interface InferenceRuleDefinition {
  ruleCode: string;
  ruleVersion: number;
  description: string;
  evaluate: (
    subjectEntityId: string,
    tenantId: string,
    facts: SemanticFact[],
    relationships: SemanticRelationship[]
  ) => ProposedInference[];
}

export interface ProposedInference {
  subjectEntityId: string;
  tenantId: string;
  inferenceType: string;
  inferenceRule: string;
  inferenceRuleVersion: number;
  confidence: number;
  explanation: string;
  derivedFromFacts: string[]; // Fact IDs
  derivedFromRelationships: string[]; // Relationship IDs
  metadata?: Record<string, any>;
}

export class AtlasInferenceEngine {
  private static readonly RULES: InferenceRuleDefinition[] = [
    // Rule 1: POSSIBLE_EXPANSION
    // Evidence: Hiring activity (HIRING_FOR_ROLE or OPEN_POSITIONS_COUNT) + Location activity (OPENED_LOCATION, EXPANDED_TO, LOCATED_IN)
    {
      ruleCode: 'RULE_POSSIBLE_EXPANSION',
      ruleVersion: 1,
      description: 'Infers possible market/operational expansion from concurrent hiring and location signals.',
      evaluate: (subjectEntityId, tenantId, facts, relationships) => {
        const results: ProposedInference[] = [];

        const hiringFacts = facts.filter(
          f => (f.predicate_code === 'HIRING_FOR_ROLE' || f.predicate_code === 'OPEN_POSITIONS_COUNT') && f.status === 'ACTIVE'
        );

        const locationRelationships = relationships.filter(
          r => (r.predicate_code === 'OPENED_LOCATION' || r.predicate_code === 'EXPANDED_TO') && r.is_active
        );

        if (hiringFacts.length > 0 && locationRelationships.length > 0) {
          const factIds = hiringFacts.map(f => f.fact_id);
          const relIds = locationRelationships.map(r => r.relationship_id);

          results.push({
            subjectEntityId,
            tenantId,
            inferenceType: 'POSSIBLE_EXPANSION',
            inferenceRule: 'RULE_POSSIBLE_EXPANSION',
            inferenceRuleVersion: 1,
            confidence: 0.85,
            explanation: `Observed ${hiringFacts.length} hiring signal(s) and ${locationRelationships.length} new location/expansion relationship(s).`,
            derivedFromFacts: factIds,
            derivedFromRelationships: relIds,
            metadata: {
              hiring_count: hiringFacts.length,
              location_count: locationRelationships.length
            }
          });
        }

        return results;
      }
    },

    // Rule 2: ACTIVE_HIRING_SIGNAL
    // Evidence: Active OPEN_POSITIONS_COUNT > 0 or active HIRING_FOR_ROLE facts
    {
      ruleCode: 'RULE_ACTIVE_HIRING',
      ruleVersion: 1,
      description: 'Infers active recruitment and organizational growth.',
      evaluate: (subjectEntityId, tenantId, facts, _relationships) => {
        const results: ProposedInference[] = [];

        const hiringRoleFacts = facts.filter(
          f => f.predicate_code === 'HIRING_FOR_ROLE' && f.status === 'ACTIVE'
        );
        const positionCountFacts = facts.filter(
          f => f.predicate_code === 'OPEN_POSITIONS_COUNT' && f.status === 'ACTIVE' && Number(f.object_value) > 0
        );

        const allHiringFacts = [...hiringRoleFacts, ...positionCountFacts];

        if (allHiringFacts.length > 0) {
          results.push({
            subjectEntityId,
            tenantId,
            inferenceType: 'ACTIVE_HIRING_SIGNAL',
            inferenceRule: 'RULE_ACTIVE_HIRING',
            inferenceRuleVersion: 1,
            confidence: 0.90,
            explanation: `Entity has ${allHiringFacts.length} active recruitment fact(s) indicating talent acquisition.`,
            derivedFromFacts: allHiringFacts.map(f => f.fact_id),
            derivedFromRelationships: [],
            metadata: {
              roles_count: hiringRoleFacts.length,
              open_positions_facts: positionCountFacts.length
            }
          });
        }

        return results;
      }
    },

    // Rule 3: MULTI_OFFERING_ORGANIZATION
    // Evidence: Entity has 2 or more active OFFERS relationships
    {
      ruleCode: 'RULE_MULTI_OFFERING',
      ruleVersion: 1,
      description: 'Infers multi-product portfolio capability.',
      evaluate: (subjectEntityId, tenantId, _facts, relationships) => {
        const results: ProposedInference[] = [];

        const offersRels = relationships.filter(
          r => r.predicate_code === 'OFFERS' && r.is_active
        );

        if (offersRels.length >= 2) {
          results.push({
            subjectEntityId,
            tenantId,
            inferenceType: 'MULTI_OFFERING_PORTFOLIO',
            inferenceRule: 'RULE_MULTI_OFFERING',
            inferenceRuleVersion: 1,
            confidence: 0.92,
            explanation: `Entity offers ${offersRels.length} distinct products/services across its catalog.`,
            derivedFromFacts: [],
            derivedFromRelationships: offersRels.map(r => r.relationship_id),
            metadata: {
              offering_count: offersRels.length
            }
          });
        }

        return results;
      }
    }
  ];

  /**
   * Evaluates all inference rules for an entity given its current facts and relationships.
   */
  public static evaluateRules(
    subjectEntityId: string,
    tenantId: string,
    facts: SemanticFact[],
    relationships: SemanticRelationship[]
  ): ProposedInference[] {
    const proposed: ProposedInference[] = [];

    for (const rule of this.RULES) {
      const ruleResults = rule.evaluate(subjectEntityId, tenantId, facts, relationships);
      proposed.push(...ruleResults);
    }

    return proposed;
  }

  /**
   * Deterministic inference fingerprint for idempotency check.
   */
  public static generateInferenceFingerprint(
    subjectEntityId: string,
    ruleCode: string,
    ruleVersion: number,
    factIds: string[],
    relIds: string[]
  ): string {
    const sortedFacts = [...factIds].sort().join(',');
    const sortedRels = [...relIds].sort().join(',');
    return `${subjectEntityId}:${ruleCode}:v${ruleVersion}:facts[${sortedFacts}]:rels[${sortedRels}]`;
  }
}
