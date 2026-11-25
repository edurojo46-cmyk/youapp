import type { QueryIntent, LocationRelationType } from './UniversalQueryModel';

export type DiscoveryBudget = 'QUICK' | 'STANDARD' | 'DEEP' | 'MAX_AVAILABLE';

export interface ProviderPaginationCursor {
  provider_id: string;
  cursor?: string;
  page?: number;
  offset?: number;
  page_size: number;
  provider_exhausted: boolean;
  reported_total?: number | null;
  retrievable_limit?: number | null;
  discovered_so_far: number;
}

export type EmailType = 
  | 'PUBLIC_PERSONAL_EMAIL' 
  | 'PUBLIC_PROFESSIONAL_EMAIL' 
  | 'PUBLIC_INSTITUTIONAL_EMAIL' 
  | 'ORGANIZATION_CONTACT_ONLY';

export type ContactUseState =
  | 'PUBLIC_PERSONAL_CONTACT'
  | 'PUBLIC_PROFESSIONAL_CONTACT'
  | 'PUBLIC_INSTITUTIONAL_CONTACT'
  | 'ORGANIZATION_CONTACT_ONLY'
  | 'NO_PUBLIC_CONTACT'
  | 'DO_NOT_CONTACT';

export type SocialSourcePlatform =
  | 'LINKEDIN_PUBLIC'
  | 'INSTAGRAM_PUBLIC'
  | 'FACEBOOK_PUBLIC'
  | 'X_PUBLIC'
  | 'YOUTUBE_PUBLIC'
  | 'TIKTOK_PUBLIC'
  | 'GITHUB_PUBLIC';

export type SocialSourceState =
  | 'SOCIAL_SOURCE_NATIVE_PROFILE'
  | 'SOCIAL_DISCOVERED'
  | 'SOCIAL_POSSIBLE_MATCH'
  | 'SOCIAL_PROBABLE_MATCH'
  | 'SOCIAL_VERIFIED_MATCH';

export interface SocialProfileEvidence {
  platform: SocialSourcePlatform;
  url: string;
  handle?: string;
  state: SocialSourceState;
  corroboration_evidence?: string;
}

/**
 * Lightweight person record for mass discovery.
 * STRICT PRIVACY REQUIREMENT:
 * RAW_DNI_IN_MASS_DISCOVERY = 0
 * RAW_CUIL_IN_MASS_DISCOVERY = 0
 * RAW_PERSON_TAX_ID_IN_MASS_DISCOVERY = 0
 * Raw national_id, tax_id, DNI, CUIL, CUIT of natural persons are strictly prohibited.
 */
export interface LightweightPersonRecord {
  candidate_id: string;
  display_name: string;
  entity_type: 'PERSON' | 'BUSINESS';
  work_concept: string;
  profession_claim?: string | null;
  role_claim?: string | null;
  organization?: string | null;
  
  // Geography and explicit location relation model
  geography_claim?: string | null;
  geography_evidence?: string | null;
  location?: string | null;
  geography_country?: string;
  geography_city?: string;
  geography_commune?: string;
  geography_neighborhood?: string;
  
  location_relation_type?: LocationRelationType;
  location_evidence?: string | null;
  location_source_url?: string | null;
  location_confidence?: number;
  
  source_id: string;
  source_url: string;
  person_source_url?: string;
  source_record_id?: string;
  domain?: string;
  provider: string;
  evidence_score: number;
  why_matched_work?: string;
  why_matched_geography?: string;
  why_matched_activity?: string;
  
  // Current professional verification & anti-deceased flags
  is_current_professional?: boolean;
  current_activity_evidence?: string;
  current_activity_date?: string;
  is_deceased?: boolean;

  // Allowed public and cryptographic identifiers only
  public_identifiers?: {
    wikidata_qid?: string;
    github_username?: string;
    orcid_id?: string;
    official_registry_record_id?: string;
    canonical_profile_url?: string;
    source_scoped_fingerprint?: string;
    fingerprint_hash?: string;
    fingerprint_version?: number;
    key_version?: string;
  };

  // Contact fields with strict provenance
  enriched?: boolean;
  avatar_url?: string | null;
  photo?: string | null;
  
  // Backwards compatibility + strict email provenance
  public_email?: string | null;
  email?: string | null;
  email_type?: EmailType;
  email_source_url?: string | null;
  email_source_domain?: string | null;
  email_context?: string | null;
  email_discovered_at?: string;
  email_confidence?: number;
  
  public_phone?: string | null;
  phone?: string | null;
  phone_type?: 'PUBLIC_PROFESSIONAL_PHONE' | 'PUBLIC_INSTITUTIONAL_PHONE' | 'PUBLIC_BUSINESS_PHONE' | 'PUBLIC_BUSINESS_WHATSAPP';
  phone_source_url?: string | null;
  
  public_website?: string | null;
  website?: string | null;
  
  // Contact use states & opt-out
  contact_use_state?: ContactUseState;
  opt_out?: boolean;
  suppressed?: boolean;
  opt_out_at?: string;
  opt_out_reason?: string;

  // First-class social sources
  social_profiles?: SocialProfileEvidence[];
  social_links?: { platform: string; url: string }[];
  discovered_via?: string;
  last_seen_at?: string;
}

export interface PossibleMatchCluster {
  cluster_id: string;
  canonical_name: string;
  organization: string;
  location: string;
  members: LightweightPersonRecord[];
}

export interface MassDiscoveryFacets {
  facet_scope: 'DISCOVERED_SO_FAR';
  scope_count: number;
  professions: { label: string; count: number }[];
  organizations: { label: string; count: number }[];
  provinces: { label: string; count: number }[];
  cities: { label: string; count: number }[];
  neighborhoods?: { label: string; count: number }[];
  sources: { label: string; count: number }[];
  relations?: { label: string; count: number }[];
  email_types?: { label: string; count: number }[];
  social_platforms?: { label: string; count: number }[];
  has_photo_count: number;
  has_public_email_count: number;
  has_website_count: number;
  has_phone_count?: number;
  has_social_count?: number;
}

export interface EphemeralSearchSession {
  search_session_id: string;
  query_intent: QueryIntent;
  budget: DiscoveryBudget;
  target_unique_budget: number;
  provider_cursors: Record<string, ProviderPaginationCursor>;
  provider_statuses: Record<string, 'ACTIVE' | 'EXHAUSTED' | 'RATE_LIMITED' | 'ERROR'>;
  discovered_records: LightweightPersonRecord[];
  discovered_businesses: any[];
  clusters: PossibleMatchCluster[];
  known_total: number | null;
  estimated_total: number | null;
  official_population?: number | null;
  provider_reported_totals: Record<string, number>;
  created_at: number;
  last_accessed_at: number;
  expires_at: number;
  all_providers_exhausted: boolean;
}

export interface MassDiscoveryResponse {
  search_session_id: string;
  atlas_indexed_total: number;
  query_discovered_unique: number;
  known_total: number | null;
  estimated_total: number | null;
  
  // Distinct demographic and geographic breakdown (Directives 2, 3, 39)
  official_population?: number | null;
  population_year?: number | null;
  population_source?: string | null;
  confirmed_residence_count?: number;
  working_in_area_count?: number;
  merchants_business_count?: number;
  with_public_email_count?: number;
  with_public_phone_count?: number;
  with_social_count?: number;
  
  demographics?: {
    canonical_geography?: string;
    official_population?: number;
    population_year?: number;
    population_source?: string;
    public_people_discovered?: number;
    query_discovered_unique?: number;
    currently_visible?: number;
    discovered_candidates?: number;
    validated_candidates?: number;
    rejected_candidates?: number;
    unique_validated?: number;
    indexed_discovery_candidates?: number;
    confirmed_residence_count?: number;
    working_in_area_count?: number;
    merchants_business_count?: number;
    with_public_email_count?: number;
    with_public_phone_count?: number;
    with_social_count?: number;
  };

  discovery_index_stats?: {
    discovery_index_created: boolean;
    storage_type?: string;
    session_discovered?: number;
    session_validated?: number;
    session_rejected?: number;
    session_unique_validated?: number;
    index_records_before?: number;
    index_new_insertions?: number;
    index_existing_updates?: number;
    index_records_after?: number;
    invariant_verified?: boolean;
    discovery_index_records: number;
    discovered_candidates: number;
    validated_candidates: number;
    rejected_candidates: number;
    unique_validated: number;
    canonical_db_delta: number;
  };
  
  provider_reported_totals: Record<string, number>;
  currently_loaded: number;
  current_page: number;
  page_size: number;
  total_pages: number;
  has_next_cursor: boolean;
  next_cursor: string | null;
  results: LightweightPersonRecord[];
  businesses: any[];
  coverage_status?: 'ACTIVE_DISCOVERY' | 'COVERAGE_NOT_ACTIVE';
  coverage_message?: string;
  jurisdiction?: string;
  active_discovery_jurisdictions?: readonly string[];
  caba_dashboard?: any;
  caba_kpis?: {
    discovery_evidence_rows: number;
    unresolved_publication_authors: number;
    discovery_validated_unique_people: number;
    discovery_direct_caba_people: number;
    cross_source_verified: number;
    target_direct_caba?: number;
    target_cross_source?: number;
    new_people_this_run?: number;
    new_direct_caba_this_run?: number;
    with_public_email?: number;
    with_public_phone?: number;
    with_public_social?: number;
    family_breakdown?: any;
    canonical_atlas_identities: number;
    canonical_direct_caba_people: number;
    caba_discovery_index: number;
    atlas_canonical_people: number;
    current_search_session_unique: number;
    source_reported_universe: number;
    global_sources_blocked?: number;
    auto_sources_blocked?: number;
    auto_sources_enumerable?: number;
  };
  source_yield_panel?: Array<{
    source_id: string;
    source_name: string;
    status: string;
    family: string;
    raw_records: number;
    validated_people: number;
    direct_caba: number;
    cross_source: number;
    emails: number;
    evidence_yield_class: 'ZERO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'MASS' | 'BLOCKED';
    person_yield_class: 'ZERO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'MASS' | 'BLOCKED';
    yield_class?: 'ZERO' | 'MICRO' | 'SMALL' | 'MEDIUM' | 'LARGE' | 'MASS' | 'BLOCKED';
    highlight: boolean;
  }>;
  caba_sources_panel?: Array<{
    source_id: string;
    source_name: string;
    search_time_capable: boolean;
    ingestion_capable: boolean;
    verification_capable: boolean;
    status: string;
    fetched: number;
    validated: number;
    indexed_unique: number;
    last_refresh: string;
  }>;
  caba_routing?: {
    eligible_unique_caba_sources: number;
    queried_unique_caba_sources: number;
    source_request_attempts: number;
    pages_fetched: number;
    sources_with_results: number;
    sources_exhausted: number;
    sources_rate_limited: number;
    sources_access_blocked: number;
    sources_ingestion_only: number;
    eligible_caba_sources?: number;
    actually_queried_caba_sources?: number;
  };
  auto_discovered_sources?: Array<{
    source_candidate_id: string;
    source_name: string;
    category: string;
    domain: string;
    status: string;
    activation_status?: string;
    verification_status?: string;
    access_mode?: string;
    discovered_via?: string;
    why_discovered: string;
    person_surface_found: string;
    enumerable: string;
    action: string;
    last_checked_at: string;
    raw_people_extracted?: number;
    validated_people_yield?: number;
  }>;
  source_trace: {
    sources_consulted_count: number;
    sources_paginated_count: number;
    sources_exhausted_count: number;
    diagnostics: Record<string, number>;
    sources: Record<string, any>;
  };
  facets: MassDiscoveryFacets;
}

