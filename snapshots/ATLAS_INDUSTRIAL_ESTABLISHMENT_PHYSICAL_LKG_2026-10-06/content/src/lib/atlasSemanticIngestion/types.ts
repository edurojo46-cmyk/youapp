/**
 * Atlas Semantic Intelligence — Ingestion & Backfill Types V1
 * Contracts for source adapters, ingestion envelopes, checkpointing, and execution stages.
 */

import type { EntityCandidate, CanonicalEntityType } from '../atlasSemantic/types';
import type {
  LiteralValueType,
  KnowledgeType,
  ValidationMethod
} from '../atlasSemantic/semanticTypes';

export type SourceAuthorityClass =
  | 'AUTHORITATIVE'
  | 'TRUSTED'
  | 'UNVERIFIED'
  | 'USER_GENERATED'
  | 'DERIVED';

export interface ClaimCandidateInput {
  source_entity_key: string;
  predicate_code: string;
  value_type: LiteralValueType;
  object_value: any;
  confidence?: number;
  validation_method?: ValidationMethod;
  observed_at?: string;
  valid_from?: string;
  valid_to?: string;
  metadata?: Record<string, any>;
}

export interface RelationshipCandidateInput {
  subject_entity_key: string;
  predicate_code: string;
  object_entity_key: string;
  confidence?: number;
  validation_method?: ValidationMethod;
  observed_at?: string;
  valid_from?: string;
  valid_to?: string;
  metadata?: Record<string, any>;
}

export interface SemanticIngestionEnvelope {
  source_name: string;
  source_record_id: string;
  tenant_id: string;
  observed_at: string;
  authority_class: SourceAuthorityClass;
  entity_candidates: Array<{
    source_entity_key: string;
    candidate: EntityCandidate;
  }>;
  claim_candidates: ClaimCandidateInput[];
  relationship_candidates: RelationshipCandidateInput[];
  metadata?: Record<string, any>;
}

export interface IngestionResult {
  source_record_id: string;
  tenant_id: string;
  status: 'SUCCESS' | 'SKIPPED' | 'REJECTED' | 'ERROR';
  entities_created: number;
  entities_matched: number;
  observations_created: number;
  claims_created: number;
  facts_created: number;
  relationships_created: number;
  inferences_created: number;
  evidence_links_created: number;
  rejection_reason?: string;
  error?: string;
}

export type BackfillStage = 'STAGE_0_DRY_RUN' | 'STAGE_1_CONTROLLED_WRITE';

export interface BackfillOptions {
  stage: BackfillStage;
  max_rows?: number; // Capped at 50 for Stage 1
  tenant_id: string;
  source_tables?: string[];
  checkpoint_enabled?: boolean;
}

export interface BackfillReport {
  stage: BackfillStage;
  tenant_id: string;
  source_rows_read: number;
  rows_eligible: number;
  rows_rejected: number;
  rows_ambiguous: number;
  canonical_entities_created: number;
  canonical_entities_matched: number;
  review_required: number;
  observations_created: number;
  claims_created: number;
  facts_created: number;
  relationships_created: number;
  inferences_created: number;
  contradictions_created: number;
  evidence_links_created: number;
  duplicates_prevented: number;
  pii_rejections: number;
  tenant_scope_rejections: number;
  errors: number;
  executed_at: string;
}

export interface TransformationAuditSample {
  source_name: string;
  source_record_id: string;
  entity_canonical_name: string;
  entity_type: CanonicalEntityType;
  knowledge_type: KnowledgeType;
  predicate_code: string;
  object_summary: string;
  evidence_observation_id: string;
  reason: string;
}
