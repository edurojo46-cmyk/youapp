/**
 * Atlas Semantic Intelligence — Semantic Facts & Relationships Types V1
 * Epistemological knowledge model, typed predicates, temporal intervals, provenance & inferences.
 */

import type { CanonicalEntityType } from './types';

export type KnowledgeType =
  | 'RAW_OBSERVATION'
  | 'CLAIM'
  | 'FACT'
  | 'INFERENCE'
  | 'PREDICTION'
  | 'USER_CONFIRMED_FACT';

export type FactStatus = 'ACTIVE' | 'SUPERSEDED' | 'DISPUTED' | 'RETRACTED';

export type InferenceStatus = 'ACTIVE' | 'STALE' | 'RETRACTED';

export type ValidationMethod =
  | 'MULTI_SOURCE_CORROBORATION'
  | 'AUTHORITATIVE_SOURCE'
  | 'USER_CONFIRMATION'
  | 'SYSTEM_RULE'
  | 'UNVALIDATED_CLAIM';

export type LiteralValueType =
  | 'TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'DATE'
  | 'TIMESTAMP'
  | 'MONEY'
  | 'PERCENTAGE'
  | 'JSON_STRUCTURED';

export type ObjectKind = 'LITERAL_VALUE' | 'CANONICAL_ENTITY';
export type PredicateCardinality = 'SINGLE' | 'MULTIPLE';
export type PredicateTemporalMode = 'TIME_VARYING' | 'STATIC' | 'POINT_IN_TIME';
export type PredicateContradictionMode = 'VALUE_EXCLUSIVE' | 'NON_EXCLUSIVE' | 'TEMPORAL_SINGLE_VALUE';

export interface SemanticPredicateDefinition {
  predicate_code: string;
  subject_entity_types: CanonicalEntityType[];
  object_kind: ObjectKind;
  object_entity_types?: CanonicalEntityType[];
  object_value_type?: LiteralValueType;
  cardinality: PredicateCardinality;
  temporal_mode: PredicateTemporalMode;
  contradiction_mode: PredicateContradictionMode;
  is_active: boolean;
  version: number;
  description?: string;
}

export interface FactEvidenceInput {
  source_observation_id: string;
  evidence_role?: string;
  confidence_contribution?: number;
  evidence_metadata?: Record<string, any>;
}

export interface RelationshipEvidenceInput {
  source_observation_id: string;
  evidence_role?: string;
  confidence_contribution?: number;
  evidence_metadata?: Record<string, any>;
}

export interface AssertFactInput {
  subject_entity_id: string;
  predicate_code: string;
  value_type: LiteralValueType;
  object_value: any; // Checked against value_type
  knowledge_type?: KnowledgeType;
  confidence?: number;
  validation_method?: ValidationMethod;
  validated_by_type?: string;
  observed_at?: string;
  valid_from?: string;
  valid_to?: string;
  evidence?: FactEvidenceInput[];
  metadata?: Record<string, any>;
}

export interface AssertRelationshipInput {
  subject_entity_id: string;
  predicate_code: string;
  object_entity_id: string;
  knowledge_type?: KnowledgeType;
  confidence?: number;
  validation_method?: ValidationMethod;
  validated_by_type?: string;
  observed_at?: string;
  valid_from?: string;
  valid_to?: string;
  evidence?: RelationshipEvidenceInput[];
  metadata?: Record<string, any>;
}

export interface SemanticFact {
  fact_id: string;
  tenant_id: string;
  subject_entity_id: string;
  predicate_code: string;
  value_type: LiteralValueType;
  object_value: any;
  knowledge_type: KnowledgeType;
  confidence: number;
  validation_method: ValidationMethod;
  validated_at?: string;
  validated_by_type?: string;
  observed_at: string;
  valid_from: string;
  valid_to?: string;
  status: FactStatus;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  evidence?: SemanticFactEvidence[];
}

export interface SemanticFactEvidence {
  evidence_id: string;
  tenant_id: string;
  fact_id: string;
  source_observation_id: string;
  evidence_role: string;
  confidence_contribution: number;
  evidence_metadata: Record<string, any>;
  created_at: string;
}

export interface SemanticRelationship {
  relationship_id: string;
  tenant_id: string;
  subject_entity_id: string;
  predicate_code: string;
  object_entity_id: string;
  knowledge_type: KnowledgeType;
  confidence: number;
  validation_method: ValidationMethod;
  validated_at?: string;
  validated_by_type?: string;
  observed_at: string;
  valid_from: string;
  valid_to?: string;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  evidence?: SemanticRelationshipEvidence[];
}

export interface SemanticRelationshipEvidence {
  evidence_id: string;
  tenant_id: string;
  relationship_id: string;
  source_observation_id: string;
  evidence_role: string;
  confidence_contribution: number;
  evidence_metadata: Record<string, any>;
  created_at: string;
}

export interface SemanticInference {
  inference_id: string;
  tenant_id: string;
  subject_entity_id: string;
  inference_type: string;
  inference_rule: string;
  inference_rule_version: number;
  confidence: number;
  explanation: string;
  status: InferenceStatus;
  derived_from_facts: string[]; // Fact IDs
  derived_from_relationships: string[]; // Relationship IDs
  metadata: Record<string, any>;
  generated_at: string;
  created_at: string;
}

export interface ContradictionGroup {
  subject_entity_id: string;
  predicate_code: string;
  contradiction_type: string;
  conflicting_facts: SemanticFact[];
  temporal_overlap: boolean;
  detected_at: string;
  status: 'UNRESOLVED' | 'RESOLVED' | 'DISMISSED';
}

export type CurrentFactResolutionStatus = 'RESOLVED' | 'AMBIGUOUS' | 'UNKNOWN';

export interface CurrentFactResolutionResult {
  predicate_code: string;
  status: CurrentFactResolutionStatus;
  current_fact?: SemanticFact;
  competing_claims?: SemanticFact[];
  reason: string;
}

export interface EntityKnowledgeSummary {
  subject_entity_id: string;
  canonical_root_id: string;
  canonical_name: string;
  entity_type: CanonicalEntityType;
  current_facts: SemanticFact[];
  historical_facts: SemanticFact[];
  relationships: SemanticRelationship[];
  contradictions: ContradictionGroup[];
  inferences: SemanticInference[];
  total_evidence_observations: number;
  summarized_at: string;
}
