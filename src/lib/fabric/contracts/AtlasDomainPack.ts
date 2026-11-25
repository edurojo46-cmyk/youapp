/**
 * ATLAS DOMAIN PACK CONTRACT V1
 * 
 * Standard contract for any vertical search domain to plug into
 * the Atlas Industrial Search Fabric.
 * 
 * Invariants:
 * - The Core Search Fabric contains ZERO hardcoded domain assumptions.
 * - Every Domain Pack declares its schema, identity policies, evidence gates,
 *   ranking rules, coverage dimensions, and UI metadata.
 */

export interface DomainUIConfig {
  search_placeholder: string;
  primary_column: string;
  columns: { key: string; label: string; width?: string; type?: string }[];
  filters: { key: string; label: string; type: 'select' | 'text' | 'range' | 'boolean'; options?: string[] }[];
  detail_sections: { id: string; label: string; fields: string[] }[];
  badges: { field: string; values_color_map: Record<string, string> }[];
  default_sort: { field: string; direction: 'asc' | 'desc' };
}

export interface AtlasDomainPack<T = any> {
  domain_id: string;
  entity_type: string;
  display_name: string;
  version: string;

  // Schema & Search Fields
  entity_schema: Record<string, { type: string; required: boolean; description?: string }>;
  searchable_fields: string[];
  facets: string[];

  // Identity & Dedup Policy
  identity_policy: {
    primary_id_field: string;
    strong_identifier_fields: string[];
    soft_corroboration_fields: string[];
    allow_soft_canonical_merge: boolean; // STRICTLY FALSE across all safety-first domains
    dedup_strategy: 'STRONG_HASH_MATCH' | 'REGISTRY_ID_MATCH' | 'DOMAIN_SPECIFIC';
    collision_action: 'REJECT' | 'PROBABLE_SAME_ENTITY' | 'CANONICAL_MERGE';
  };

  // Evidence & Source Governance Policy
  evidence_policy: {
    require_source_url: boolean;
    require_confidence: boolean;
    min_confidence_to_persist: number;
    require_observed_at: boolean;
  };

  source_policy: {
    allowed_source_types: ('OPEN_GOVERNMENT' | 'OFFICIAL_REGISTRY' | 'ACADEMIC_OAI' | 'BULLETIN_GAZETTE' | 'CORPORATE_FILING')[];
    commercial_reuse_gate_required: boolean;
    privacy_gate_required: boolean;
  };

  // Privacy & Compliance Policy
  privacy_policy: {
    allow_private_contact_harvesting: boolean; // Always false
    allow_home_address_harvesting: boolean; // Always false
    sensitive_field_masking: string[];
  };

  // Ranking & Search Relevance Policy
  ranking_policy: {
    factors: { field: string; weight: number; match_type: 'exact' | 'fuzzy' | 'recency' | 'numeric_range' }[];
    default_sort: { field: string; direction: 'asc' | 'desc' };
  };

  // Freshness & Staleness Policy
  freshness_policy: {
    stale_threshold_days: number;
    auto_refresh_queue_priority: number;
  };

  // Discovery & Penta Radar Configuration
  discovery_policy: {
    discovery_patterns: string[];
    source_families: string[];
    target_entity_types: string[];
    replication_dimensions: string[];
  };

  // Coverage Dimensions (Generic Entity Completeness)
  coverage_dimensions: string[];

  // UI Metadata
  ui_config: DomainUIConfig;

  // Domain-specific transform and validation
  validateEntity(entity: T): { valid: boolean; errors?: string[] };
  calculateCompletenessScore(entity: T): number;
}

export const ATLAS_DOMAIN_PACK_CONTRACT_VERSION = '1.0.0';
