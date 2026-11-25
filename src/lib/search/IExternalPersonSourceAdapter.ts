export const _EXTERNAL_SOURCE_ADAPTER_VERSION = "1.0.0";
export type FilterEvaluationStatus = 'MATCH' | 'NO_MATCH' | 'UNKNOWN' | 'NOT_SUPPORTED';

export type SourceTier = 
  | 'TIER_A_AUTHORITATIVE' 
  | 'TIER_B_STRUCTURED_PROFESSIONAL' 
  | 'TIER_C_PLATFORM_PUBLIC_PROFILE' 
  | 'TIER_C_PUBLIC_KNOWLEDGE_GRAPH'
  | 'TIER_D_WEB_DISCOVERY'
  | 'TIER_E_MOCK';

export type LocationRelationType = 
  | 'RESIDENCE' 
  | 'WORK_LOCATION' 
  | 'EMPLOYER_LOCATION' 
  | 'BIRTH_PLACE' 
  | 'OTHER'
  | 'UNKNOWN';

export interface StructuredLocation {
  country?: string;
  jurisdiction?: string;
  city?: string;
  neighborhood?: string;
}

export interface ExternalFilterCapabilities {
  name_search: boolean;
  profession_filter: boolean;
  location_filter: boolean;
  age_filter: boolean;
  company_filter: boolean;
  public_email: boolean;
  public_phone: boolean;
}

import type { QueryIntent } from './UniversalQueryModel';

export interface ExternalSearchFilters {
  name?: string;
  profession?: string;
  personCategory?: string; // e.g. 'WORKER'
  location_filter?: string; // legacy unstructured location fallback
  structured_location?: StructuredLocation;
  age_from?: number;
  age_to?: number;
  limit?: number;
  page?: number;
  query_intent?: QueryIntent;
}

export interface ExternalPersonObservation {
  source_system: string;
  source_tier?: SourceTier;
  source_record_id: string;
  source_url: string | null;
  observed_at: string;
  
  display_name: string;
  profession: string | null;
  
  location: string | null;
  location_relation_type?: LocationRelationType;
  
  company: string | null;
  
  // Demographics (Age and DOB)
  date_of_birth?: string | null; // YYYY-MM-DD
  age?: number | 'UNKNOWN';
  age_range?: string | null;
  
  // Distinct Sex and Gender
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  gender?: string | 'UNKNOWN';
  
  // Photo
  photo_url?: string | null;
  
  email: 'public_professional' | 'UNKNOWN';
  phone: 'public_professional' | 'UNKNOWN';
  
  // Social Profiles (First-party or explicit URLs)
  social_profiles?: {
    platform: 'FACEBOOK' | 'INSTAGRAM' | 'LINKEDIN' | 'X' | 'TIKTOK' | 'YOUTUBE' | 'GITHUB' | 'ORCID' | 'THREADS' | 'BLUESKY' | 'MASTODON' | 'PERSONAL_WEB' | 'OTHER';
    url: string;
    handle?: string;
    status: 'VERIFIED' | 'PROBABLE' | 'POSSIBLE' | 'UNVERIFIED';
  }[];
  
  provenance_quality: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Explicit verification signals for Identity Resolution
  strong_identifiers: {
    professional_registry_id?: string;
    verified_url?: string;
    email_hash?: string; // Do not expose raw email unless explicitly required
  };

  // Employment & Location Semantic Evidence
  employmentEvidence?: {
    status: "CONFIRMED" | "POSSIBLE" | "NONE";
    relation: "EMPLOYED_BY" | "HAS_ROLE" | "WORKS_AT" | null;
    organization: string | null;
    source: string;
    current: boolean | 'UNKNOWN';
  };
  
  workLocationEvidence?: {
    status: "CONFIRMED" | "POSSIBLE" | "NONE";
    locationId: string | null;
    relation: "WORK_LOCATION";
    source: string;
  };

  // Positive Semantic Evidence & Entity Classification
  entity_type?: 'PERSON' | 'BUSINESS' | 'ORGANIZATION' | 'SERVICE' | 'UNKNOWN';
  work_evidence?: string;
  geography_evidence?: string;
  why_matched_work?: string;
  why_matched_geography?: string;
  discovered_by?: string;
}

export interface LiveRetrievalAuditRecord {
  source_id: string;
  source_url: string;
  retrieved_at: string;
  query_parameters: Record<string, any>;
  content_hash: string;
  evidence_extracted: string[];
  entities_extracted: string[];
  status: 'SUCCESS' | 'NO_RESULTS' | 'DEGRADED' | 'RATE_LIMITED' | 'BLOCKED';
}

export interface IExternalPersonSourceAdapter {
  /** Uniquely identifies the adapter (e.g. 'CPAU', 'MOCK') */
  getAdapterId(): string;
  
  /** Indicates which filters the adapter actually supports evaluating at the source */
  getCapabilities(): ExternalFilterCapabilities;
  
  /** Executes the search against the external source */
  search(filters: ExternalSearchFilters): Promise<ExternalPersonObservation[]>;

  /** Optional live retrieval audit generation */
  getAuditTrail?(): LiveRetrievalAuditRecord[];
}

