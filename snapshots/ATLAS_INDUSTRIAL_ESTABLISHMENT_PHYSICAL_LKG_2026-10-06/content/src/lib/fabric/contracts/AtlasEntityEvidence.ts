/**
 * ATLAS GENERIC EVIDENCE CONTRACT V1
 * 
 * Formal contract representing the factual provenance of any attribute
 * or assertion in the Atlas Industrial Search Fabric.
 * 
 * Invariants:
 * - Every attribute assertion links to an official source URL.
 * - Confidence is bounded [0.0 - 1.0].
 * - Temporal metadata (observed_at, valid_until) is preserved for auditability.
 */

export type EvidenceType = 
  | 'PRIMARY_GOVERNMENT_DOC'
  | 'OFFICIAL_REGISTRY'
  | 'ACADEMIC_REPOSITORY'
  | 'PUBLIC_GAZETTE'
  | 'PROCUREMENT_PORTAL'
  | 'INFERRED_CROSS_LINK';

export type FreshnessStatus = 'CURRENT' | 'STALE' | 'SUPERSEDED' | 'DISPUTED';

export interface AtlasEntityEvidence {
  evidence_id: string;
  domain_id: string;
  entity_id: string;
  attribute_name: string;
  attribute_value: any;
  source_id: string;
  source_url: string;
  confidence: number; // 0.00 to 1.00
  evidence_type: EvidenceType;
  freshness_status: FreshnessStatus;
  observed_at: string;
  valid_until: string | null;
}

export const ATLAS_ENTITY_EVIDENCE_VERSION = '1.0.0';
