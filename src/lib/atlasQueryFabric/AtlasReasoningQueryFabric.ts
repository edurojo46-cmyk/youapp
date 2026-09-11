import { SupabaseClient } from '@supabase/supabase-js';
import { QueryIntentClassifier } from './QueryIntentClassifier';
import { StructuredQueryPlanner } from './StructuredQueryPlanner';
import { AtlasGraphRetrievalEngine } from './AtlasGraphRetrievalEngine';
import { TemporalContradictionFilter } from './TemporalContradictionFilter';
import { EvidenceRankingEngine } from './EvidenceRankingEngine';
import { AtlasAnswerSynthesizer } from './AtlasAnswerSynthesizer';
import { StructuredQueryPlan, GroundedAnswer } from './types';

export class AtlasReasoningQueryFabric {
  private readonly supabase: SupabaseClient;
  private readonly retrievalEngine: AtlasGraphRetrievalEngine;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.retrievalEngine = new AtlasGraphRetrievalEngine(supabase);
  }

  /**
   * Plans a query without executing retrieval.
   */
  public async planQuery(
    query: string,
    tenantId: string,
    options?: {
      max_hops?: number;
      include_contradictions?: boolean;
      include_inferences?: boolean;
      include_claims?: boolean;
      temporal_mode?: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'ALL';
    }
  ): Promise<StructuredQueryPlan> {
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('TENANT_ISOLATION_VIOLATION: tenant_id is required.');
    }

    const intentResult = QueryIntentClassifier.classify(query);
    return StructuredQueryPlanner.plan(query, intentResult, tenantId, options);
  }

  /**
   * Executes a planned structured query against the graph knowledge base.
   */
  public async executeQueryPlan(plan: StructuredQueryPlan): Promise<GroundedAnswer> {
    if (!plan.cost_estimate.allowed) {
      throw new Error('QUERY_COST_GUARD: Query exceeds complexity limits (max nodes/hops).');
    }

    // 1. Retrieve Graph Nodes, Facts, Relationships & Provenance
    const { claims, entities, provenance } = await this.retrievalEngine.retrieve(plan);

    // 2. Temporal & Contradiction Filtering
    const temporalFiltered = TemporalContradictionFilter.filterTemporal(
      claims,
      plan.temporal_mode,
      plan.as_of_date
    );

    const contradictionAnnotated = plan.include_contradictions
      ? TemporalContradictionFilter.detectContradictions(temporalFiltered)
      : temporalFiltered;

    // 3. Epistemic & Evidence Ranking
    const rankedClaims = EvidenceRankingEngine.rankClaims(contradictionAnnotated);

    // 4. Synthesize Grounded Answer with Zero Hallucination
    return AtlasAnswerSynthesizer.synthesize(
      plan.original_query,
      plan,
      rankedClaims,
      entities,
      provenance
    );
  }

  /**
   * End-to-end question answering pipeline with full reasoning and provenance.
   */
  public async answerQuery(
    query: string,
    tenantId: string,
    options?: {
      max_hops?: number;
      include_contradictions?: boolean;
      include_inferences?: boolean;
      include_claims?: boolean;
      temporal_mode?: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'ALL';
    }
  ): Promise<GroundedAnswer> {
    const plan = await this.planQuery(query, tenantId, options);
    return this.executeQueryPlan(plan);
  }

  /**
   * Dedicated entry point for "What do we know about X?" comprehensive summaries.
   */
  public async answerWhatDoWeKnow(entityName: string, tenantId: string): Promise<GroundedAnswer> {
    return this.answerQuery(`What do we know about ${entityName}?`, tenantId, {
      max_hops: 2,
      include_contradictions: true,
      include_inferences: true,
      include_claims: true,
      temporal_mode: 'ALL'
    });
  }

  /**
   * Explains a query execution plan.
   */
  public explainQueryPlan(plan: StructuredQueryPlan): string {
    return `[PLAN ${plan.plan_id}] Intent: ${plan.intent} | Entities: [${plan.target_entity_names.join(', ')}] | Predicates: [${plan.predicates.join(', ')}] | Hops: ${plan.max_hops} | Mode: ${plan.temporal_mode} | Est Nodes: ${plan.cost_estimate.estimated_nodes}`;
  }

  /**
   * Explains an answer with its grounded claim justification.
   */
  public explainAnswer(answer: GroundedAnswer): string {
    const claimsExplanation = answer.grounded_claims
      .map(c => ` - [${c.epistemic_status} (conf: ${c.confidence.toFixed(2)})] ${c.statement}`)
      .join('\n');

    return `Answer State: ${answer.answer_state}\nEntities: ${answer.entities_involved.map(e => e.canonical_name).join(', ')}\nClaims:\n${claimsExplanation}\nExplanation: ${answer.explanation}`;
  }
}
