/**
 * Atlas Semantic Intelligence — Canonical Entities V1 Types
 * 
 * PII Policy: MINIMIZED / NO_PLAINTEXT_CONTACT_IDENTIFIERS
 * Prohibits plaintext emails, phones, passwords, tokens, and secrets.
 */

export type CanonicalEntityType =
  | 'PERSON'
  | 'COMPANY'
  | 'ORGANIZATION'
  | 'PRODUCT'
  | 'SERVICE'
  | 'LOCATION';

export type CanonicalEntityStatus =
  | 'ACTIVE'
  | 'MERGED'
  | 'ARCHIVED'
  | 'SPLIT';

export type EntityResolutionDecision =
  | 'AUTO_MATCH'
  | 'REVIEW_REQUIRED'
  | 'NO_MATCH'
  | 'MANUAL_OVERRIDE';

export type SignalStrength = 'STRONG_IDENTITY' | 'SUPPORTING' | 'HARD_CONFLICT';

export interface HierarchicalLocation {
  country?: string; // e.g. 'AR'
  admin_level_1?: string; // e.g. 'Ciudad Autónoma de Buenos Aires' vs 'Provincia de Buenos Aires'
  city?: string; // e.g. 'Buenos Aires', 'La Plata', 'Rosario'
  normalized_label: string; // e.g. 'AR:Ciudad Autónoma de Buenos Aires:Buenos Aires'
}

export interface EntityCandidate {
  source_name: string;
  source_record_id: string;
  source_entity_key: string; // e.g. 'job_123:company', 'doc_456:author'
  entity_type: CanonicalEntityType;
  raw_name: string;
  
  // Optional identifiers & attributes (NO plaintext email/phone allowed)
  domain?: string;
  email_hash?: string; // SHA-256 of normalized email
  phone_hash?: string; // SHA-256 of normalized phone
  external_ids?: Record<string, string>; // e.g. { 'cuit': '30-12345678-9', 'linkedin_slug': 'acme-corp' }
  location?: HierarchicalLocation | string;
  company_context?: string; // e.g. for Person: 'Google'
  raw_attributes?: Record<string, any>;
  observed_at?: string;
  source_confidence?: number; // 0..1 (default 1.0)
}

export interface CanonicalEntity {
  canonical_entity_id: string;
  tenant_id: string;
  entity_type: CanonicalEntityType;
  canonical_name: string;
  normalized_name: string;
  primary_domain?: string;
  status: CanonicalEntityStatus;
  merged_into_id?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SourceObservation {
  observation_id: string;
  tenant_id: string;
  canonical_entity_id: string | null;
  original_canonical_entity_id: string | null;
  source_name: string;
  source_record_id: string;
  source_entity_key: string;
  entity_type: CanonicalEntityType;
  raw_name: string;
  normalized_name: string;
  raw_attributes: Record<string, any>;
  normalized_attributes: Record<string, any>;
  resolution_confidence: number;
  resolution_decision: EntityResolutionDecision;
  resolution_explanation: ResolutionExplanation;
  observed_at: string;
  created_at: string;
}

export interface EntityAlias {
  alias_id: string;
  tenant_id: string;
  canonical_entity_id: string;
  alias_name: string;
  normalized_alias: string;
  source: string;
  confidence: number;
  observed_at: string;
  created_at: string;
}

export interface EntityMergeRecord {
  merge_id: string;
  tenant_id: string;
  source_entity_id: string;
  target_entity_id: string;
  merge_reason: string;
  confidence: number;
  explanation: Record<string, any>;
  is_active: boolean;
  merged_at: string;
  reversed_at?: string;
  reversed_by?: string;
  reversal_reason?: string;
}

export interface SignalBreakdown {
  signal_name: string;
  strength: SignalStrength;
  weight: number;
  score: number;
  contribution: number;
  matched_value_hash?: string;
  reason: string;
}

export interface ConflictBreakdown {
  conflict_name: string;
  penalty: number;
  reason: string;
}

export interface ResolutionExplanation {
  candidate_source: string;
  candidate_record_id: string;
  candidate_entity_key: string;
  target_canonical_id?: string;
  target_canonical_name?: string;
  match_confidence: number;
  decision: EntityResolutionDecision;
  strong_identity_matched: boolean;
  hard_conflict_detected: boolean;
  signals: SignalBreakdown[];
  conflicts: ConflictBreakdown[];
  thresholds: ResolutionThresholds;
  evaluated_at: string;
}

export interface ResolutionThresholds {
  auto_match_threshold: number; // default 0.90
  review_required_threshold: number; // default 0.65
}

export interface ResolutionOptions {
  thresholds?: Partial<ResolutionThresholds>;
  auto_create_if_no_match?: boolean;
  record_observation?: boolean;
}

/**
 * Future Calibration Dataset Contract (Section 12)
 * Ground-truth evaluation structure for empirical calibration of resolution precision/recall.
 * Zero-PII compliant (only token hashes & pseudonyms).
 */
export type HumanResolutionLabel = 'SAME_ENTITY' | 'DIFFERENT_ENTITY' | 'UNCERTAIN';

export interface GroundTruthCalibrationExample {
  example_id: string;
  candidate_a: EntityCandidate;
  candidate_b: EntityCandidate;
  human_label: HumanResolutionLabel;
  resolution_result: EntityResolutionDecision;
  score: number;
  signals: SignalBreakdown[];
  reviewed_at: string;
  reviewer_id?: string;
  notes?: string;
}

export interface CalibrationEvaluationMetrics {
  total_examples: number;
  precision: number;
  recall: number;
  false_merge_rate: number;
  false_split_rate: number;
  f1_score: number;
  evaluated_at: string;
}

