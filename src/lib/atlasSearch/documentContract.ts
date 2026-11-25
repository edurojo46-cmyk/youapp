/**
 * AtlasPeopleSearchDocumentV1
 * Slim Canonical Search Document for Atlas Industrial Search Core.
 * Invariant: 1 SEARCH DOCUMENT = 1 CANONICAL atlas_person_id.
 * Heavy evidence/contact data (email, phone, profiles) are hydrated from PostgreSQL SSOT on demand.
 */

export interface AtlasPeopleSearchDocumentV1 {
  id: string; // atlas_person_id (Unique primary key)
  atlas_person_id: string;
  display_name: string;
  display_name_normalized: string;
  first_name: string;
  last_name: string;
  role: string;
  profession: string;
  organization: string;
  geography: string;
  province: string;
  neighborhood: string;
  source_ids: string[];
  search_text_normalized: string;
  evidence_state: 'ALL_ARGENTINA' | 'WITH_EVIDENCE' | 'WITHOUT_EVIDENCE' | 'HISTORICAL' | 'RECENT' | 'CURRENT' | 'ASSOCIATED_STALE';
  has_contact_evidence: boolean;
  ranking_weight: number;
  last_seen_at: number; // Unix timestamp in milliseconds
  created_at: number;
}

export interface AtlasSearchProjectionManifest {
  schema_version: 'AtlasPeopleSearchDocumentV1';
  source_table: string;
  export_started_at: string;
  export_finished_at: string;
  source_distinct_people: number;
  exported_documents: number;
  distinct_atlas_person_id: number;
  duplicate_atlas_person_id: number;
  sha256: string;
  file_size_bytes: number;
}
