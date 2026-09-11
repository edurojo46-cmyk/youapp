import { AtlasCanonicalEntityType } from '../atlasSemantic/types';

export type QueryIntentType =
  | 'ENTITY_LOOKUP'
  | 'FACT_RETRIEVAL'
  | 'RELATIONSHIP_TRAVERSAL'
  | 'MULTI_HOP_DISCOVERY'
  | 'TEMPORAL_QUERY'
  | 'CONTRADICTION_ANALYSIS'
  | 'HYPOTHESIS_VERIFICATION'
  | 'WHAT_DO_WE_KNOW'
  | 'DISCOVER_BY_SIGNALS'
  | 'GENERAL_SEARCH';

export type EpistemicStatus =
  | 'USER_CONFIRMED_FACT'
  | 'FACT'
  | 'INFERRED'
  | 'CLAIM'
  | 'PREDICTION'
  | 'RAW_OBSERVATION';

export type AnswerState =
  | 'ANSWERABLE'
  | 'PARTIALLY_ANSWERABLE'
  | 'INSUFFICIENT_KNOWLEDGE'
  | 'CONTRADICTED'
  | 'NO_DATA_FOUND'
  | 'AMBIGUOUS_ENTITY';

export interface QueryIntentResult {
  primary_intent: QueryIntentType;
  confidence: number;
  extracted_entities: string[];
  extracted_entity_types: AtlasCanonicalEntityType[];
  extracted_concepts: string[];
  extracted_predicates: string[];
  temporal_phrase?: string;
  as_of_date?: string;
  is_temporal: boolean;
  is_contradiction_check: boolean;
  is_what_do_we_know: boolean;
}

export interface StructuredQueryPlan {
  plan_id: string;
  tenant_id: string;
  original_query: string;
  intent: QueryIntentType;
  target_entity_names: string[];
  target_entity_ids?: string[];
  target_entity_types: AtlasCanonicalEntityType[];
  predicates: string[];
  predicates_targeted?: string[];
  max_hops: number;
  temporal_mode: 'CURRENT' | 'HISTORICAL' | 'AS_OF' | 'ALL';
  as_of_date?: string;
  include_contradictions: boolean;
  include_inferences: boolean;
  include_claims: boolean;
  cost_estimate: {
    estimated_nodes: number;
    estimated_queries: number;
    estimated_complexity?: number;
    allowed: boolean;
  };
  created_at: string;
}

export interface EvidenceSourceItem {
  evidence_id?: string;
  source_observation_id?: string;
  source_name?: string;
  source_type?: string;
  source_ref?: string;
  evidence_role?: string;
  confidence?: number;
  observed_at?: string;
}

export const QUERY_FABRIC_VERSION = 'V1.0.2_INFERENCE_RETRIEVAL_HOTFIX';

export interface GroundedClaim {
  claim_id: string;
  statement: string;
  epistemic_status: EpistemicStatus;
  confidence: number;
  ranking_score?: number;
  subject_entity_id: string;
  subject_name: string;
  predicate_code: string;
  object_value?: any;
  object_entity_id?: string;
  object_name?: string;
  valid_from?: string;
  valid_to?: string;
  is_active: boolean;
  evidence_sources: EvidenceSourceItem[];
  contradiction_info?: {
    is_disputed: boolean;
    conflicting_statement?: string;
  };
  inference_details?: {
    inference_id: string;
    inference_rule: string;
    inference_rule_version: number;
    explanation: string;
    supporting_fact_ids?: string[];
    supporting_relationship_ids?: string[];
    generated_at?: string;
  };
}

export interface ProvenanceChainItem {
  observation_id: string;
  source_name: string;
  source_record_id?: string;
  raw_name?: string;
  normalized_name?: string;
  observed_at?: string;
}

export interface EntitySummaryItem {
  canonical_entity_id: string;
  canonical_name: string;
  normalized_name: string;
  entity_type: AtlasCanonicalEntityType;
  primary_domain?: string;
  status: string;
}

export interface GroundedAnswer {
  query: string;
  plan: StructuredQueryPlan;
  summary: string;
  answer_state: AnswerState;
  grounded_claims: GroundedClaim[];
  entities_involved: EntitySummaryItem[];
  citations?: EvidenceSourceItem[];
  epistemic_breakdown: {
    user_confirmed_facts_count: number;
    facts_count: number;
    inferences_count: number;
    claims_count: number;
    predictions_count: number;
    raw_observations_count: number;
    contradicted_count: number;
  };
  provenance_chain: ProvenanceChainItem[];
  explanation: string;
  executed_at: string;
}
