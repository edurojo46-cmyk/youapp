import { QueryIntentResult, StructuredQueryPlan } from './types';
import { SemanticConceptMap } from './SemanticConceptMap';
import * as crypto from 'crypto';

export class StructuredQueryPlanner {
  private static readonly MAX_HOPS = 3;

  /**
   * Plans a structured query based on classification and options.
   */
  public static plan(
    query: string,
    intentResult: QueryIntentResult,
    tenantId: string,
    options?: {
      max_hops?: number;
      target_entity_id?: string;
      include_contradictions?: boolean;
      include_inferences?: boolean;
      include_claims?: boolean;
      temporal_mode?: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'ALL';
    }
  ): StructuredQueryPlan {
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('TENANT_CONTEXT_REQUIRED: Query planning requires a valid tenant ID.');
    }

    const governedPredicates = new Set(SemanticConceptMap.getGovernedPredicates());
    const validPredicates = intentResult.extracted_predicates.filter(p =>
      governedPredicates.has(p)
    );

    const hops = Math.min(options?.max_hops || 2, this.MAX_HOPS);

    // Determine temporal mode
    let tempMode: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'ALL' = options?.temporal_mode || 'CURRENT';
    if (intentResult.as_of_date) {
      tempMode = 'AS_OF';
    } else if (intentResult.temporal_phrase === 'CURRENT_OR_HISTORICAL') {
      const lower = query.toLowerCase();
      if (/past|anterior|historico|histórico|history/i.test(lower)) {
        tempMode = 'HISTORICAL';
      } else if (/currently|actualmente|hoy|today|now|ahora/i.test(lower)) {
        tempMode = 'CURRENT';
      } else {
        tempMode = 'ALL';
      }
    }

    const planId = crypto.randomUUID();

    // Cost estimation
    const estimatedNodes = Math.max(intentResult.extracted_entities.length, 1) * Math.max(validPredicates.length, 1) * hops * 5;
    const estimatedQueries = 1 + hops * 2;
    const estimatedComplexity = Math.min(100, Math.round(estimatedNodes * 1.5 + estimatedQueries * 2));
    const isAllowed = estimatedNodes <= 500;

    const targetEntityIds = options?.target_entity_id ? [options.target_entity_id] : [];

    return {
      plan_id: planId,
      tenant_id: tenantId,
      original_query: query,
      intent: intentResult.primary_intent,
      target_entity_names: intentResult.extracted_entities,
      target_entity_ids: targetEntityIds,
      target_entity_types: intentResult.extracted_entity_types,
      predicates: validPredicates,
      predicates_targeted: validPredicates,
      max_hops: hops,
      temporal_mode: tempMode,
      as_of_date: intentResult.as_of_date,
      include_contradictions: options?.include_contradictions ?? true,
      include_inferences: options?.include_inferences ?? true,
      include_claims: options?.include_claims ?? true,
      cost_estimate: {
        estimated_nodes: estimatedNodes,
        estimated_queries: estimatedQueries,
        estimated_complexity: estimatedComplexity,
        allowed: isAllowed
      },
      created_at: new Date().toISOString()
    };
  }
}
