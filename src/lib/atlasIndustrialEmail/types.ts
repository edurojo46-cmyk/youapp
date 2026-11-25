/**
 * ATLAS — INDUSTRIAL MILLION EMAIL GATE
 * Primary Unit & Architecture Types
 */

export type ValidContactType =
  | 'PROFESSIONAL_PERSON_EMAIL'
  | 'BUSINESS_EMAIL'
  | 'INSTITUTIONAL_EMAIL'
  | 'ORGANIZATION_EMAIL'
  | 'PUBLIC_ROLE_EMAIL';

export type ValidArgentinaRelationType =
  | 'ORGANIZATION_IN_ARGENTINA'
  | 'PROFESSIONAL_ACTIVITY_IN_ARGENTINA'
  | 'PUBLIC_ROLE_IN_ARGENTINA'
  | 'BUSINESS_ACTIVITY_IN_ARGENTINA'
  | 'INSTITUTION_IN_ARGENTINA'
  | 'OTHER_VERIFIED_ARGENTINA_RELATION';

export interface EmailProvenance {
  source_id: string;
  source_family: string;
  source_url: string;
  endpoint_domain: string;
  protocol: string;
  bytes_or_rows_scanned: number;
  extracted_at: string;
  raw_record_locator: string;
  raw_record_hash: string;
  real_external_acquisition: boolean;
}

export interface PublicEmailContact {
  email_normalized: string;
  email_hash: string;
  contact_type: ValidContactType;
  associated_entity: string;
  entity_type: string;
  argentina_relation: boolean;
  argentina_relation_type: ValidArgentinaRelationType;
  source_id: string;
  source_family: string;
  source_url: string;
  public_context: string;
  evidence: string;
  provenance: EmailProvenance;
  discovered_at: string;
  verified_at: string;
  mission_qualification_status: 'MISSION_QUALIFIED';
}

export interface CanaryProbeResult {
  source_id: string;
  source_family: string;
  input_samples: number;
  extracted_emails: number;
  valid_emails: number;
  unique_emails: number;
  already_existing: number;
  true_net_new: number;
  argentina_verified: number;
  mission_qualified: number;
  overlap: number;
  latency_ms: number;
  supply_estimate: number;
  qualified_per_second: number;
  decision: 'PROMOTE' | 'KILL_FAST' | 'DEPRIORITIZE';
  notes: string;
}

export interface GateAuditSample {
  gate_name: string;
  sample_size: number;
  audit_pass: number;
  audit_fail: number;
  audit_accuracy: number;
  tested_records: {
    email: string;
    contact_type: string;
    argentina_relation: string;
    source_id: string;
    verified: boolean;
    searchable: boolean;
  }[];
}

export interface IndustrialGateMetrics {
  target: number;
  t0: string;
  time_first_productive_source: number | 'NOT_REACHED';
  time_first_real_email: number | 'NOT_REACHED';
  time_first_qualified: number | 'NOT_REACHED';
  time_10k: number | 'NOT_REACHED';
  time_100k: number | 'NOT_REACHED';
  time_250k: number | 'NOT_REACHED';
  time_500k: number | 'NOT_REACHED';
  time_1m: number | 'NOT_REACHED';
  total_scanned: number;
  total_extracted: number;
  total_valid: number;
  total_duplicates_rejected: number;
  total_already_existed: number;
  total_true_net_new: number;
  total_argentina_verified: number;
  total_mission_qualified: number;
  total_persisted: number;
  total_searchable: number;
  average_qualified_per_second: number;
  peak_qualified_per_second: number;
  sources_tested: number;
  productive_sources: number;
  known_sources_reused: number;
  new_sources_discovered: number;
  new_source_families: number;
  sources_promoted: number;
  sources_exhausted: number;
  sources_deprioritized: number;
  final_status: 'PASS' | 'FRONTIER_EXHAUSTED' | 'FAIL' | 'INVALID';
  real_external_acquisition: boolean;
  audit_samples: GateAuditSample[];
}
