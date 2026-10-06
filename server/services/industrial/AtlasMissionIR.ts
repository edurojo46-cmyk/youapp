/**
 * ATLAS MISSION IR V1
 * @server/services/industrial/AtlasMissionIR.ts
 * 
 * Formal Intermediate Representation for user search missions.
 * Decouples understanding (WHAT USER MEANS) from knowledge base (WHAT THINGS ARE),
 * geography (WHERE), and source acquisition (WHERE TO FIND).
 */

export type UniversalEntityType = 
  | 'PERSON'
  | 'COMPANY'
  | 'ESTABLISHMENT'
  | 'ORGANIZATION'
  | 'INSTITUTION'
  | 'PRODUCT'
  | 'SERVICE'
  | 'MEDIA_OUTLET'
  | 'MISSION_DEFINED_ENTITY';

export type UniversalRowUnit = 
  | 'COMPANY'
  | 'ESTABLISHMENT'
  | 'PERSON'
  | 'ORGANIZATION'
  | 'INSTITUTION'
  | 'PUBLIC_EMAIL_CONTACT'
  | 'PUBLIC_PHONE_CONTACT'
  | 'MISSION_DEFINED_ENTITY';

export type UniversalRole = 
  | 'MANUFACTURER'
  | 'SELLER'
  | 'RETAILER'
  | 'BUYER'
  | 'SUPPLIER'
  | 'DISTRIBUTOR'
  | 'IMPORTER'
  | 'EXPORTER'
  | 'USER'
  | 'PROFESSIONAL'
  | 'JOURNALIST'
  | 'EMPLOYER'
  | 'CLIENT'
  | 'SERVICE_PROVIDER'
  | 'GENERAL_ENTITY';

export type UniversalAction = 
  | 'MANUFACTURE'
  | 'SELL'
  | 'RETAIL'
  | 'BUY'
  | 'SUPPLY'
  | 'DISTRIBUTE'
  | 'IMPORT'
  | 'EXPORT'
  | 'USE'
  | 'PROVIDE_SERVICE'
  | 'WRITE_ABOUT'
  | 'EMPLOY'
  | 'GENERAL_ACTION';

export type UniversalRelation = 
  | 'MANUFACTURES'
  | 'SELLS'
  | 'BUYS'
  | 'SUPPLIES_TO'
  | 'PURCHASES_FROM'
  | 'DISTRIBUTES'
  | 'IMPORTS'
  | 'EXPORTS'
  | 'USES'
  | 'PROVIDES_SERVICE'
  | 'PROFESSIONAL_PRACTICES_AS_LAWYER'
  | 'PROFESSIONAL_PRACTICES_AS_ACCOUNTANT'
  | 'PROFESSIONAL_PRACTICES_AS_ARCHITECT'
  | 'PRACTICES_PROFESSION'
  | 'WORKS_FOR'
  | 'WRITES_ABOUT'
  | 'REPRESENTS'
  | 'EMPLOYS'
  | 'ESTABLISHMENT_SERVICE'
  | 'GENERAL_RELATION';

export type ResolutionState = 
  | 'SEMANTICS_RESOLVED'
  | 'SEMANTICS_RESOLVED_ONTOLOGY_GAP'
  | 'SEMANTICS_RESOLVED_GEOGRAPHY_GAP'
  | 'SEMANTICS_RESOLVED_SOURCE_GAP'
  | 'SEMANTICS_RESOLVED_SOURCE_BRIDGE_GAP'
  | 'SEMANTICS_RESOLVED_TAXONOMY_GAP'
  | 'SEMANTICS_RESOLVED_EVIDENCE_GAP'
  | 'AMBIGUOUS_INTENT'
  | 'AMBIGUOUS_RELATION'
  | 'AMBIGUOUS_GEOGRAPHY'
  | 'UNKNOWN_TERM'
  | 'UNKNOWN_COMPOSITION'
  | 'KNOWN_CONCEPT_UNKNOWN_COMPOSITION'
  | 'KNOWN_SEMANTICS_NO_SOURCE'
  | 'KNOWN_SOURCE_CONNECTOR_MISSING'
  | 'SOURCE_COVERAGE_LIMITED'
  | 'TAXONOMY_RESOLUTION_GAP'
  | 'VALID_SOURCE_ZERO_YIELD'
  | 'SOURCE_TECHNICAL_FAILURE'
  | 'NEEDS_ONTOLOGY_RESOLUTION'
  | 'EXECUTION_READY';

export interface EvidenceItemContract {
  evidence_type: string;
  description: string;
  mandatory: boolean;
  min_strength: 'EXPLICIT' | 'SUPPORTED' | 'INFERRED';
  validation_keys: string[];
}

export interface NegativeConstraint {
  rule_id: string;
  disallowed_roles: string[];
  disallowed_categories: string[];
  disallowed_keywords: string[];
  reason: string;
}

export interface PublicTaxonomyEntry {
  system: 'OSM' | 'WIKIDATA' | 'CLAE' | string;
  key?: string;
  value?: string;
  code?: string;
  id?: string;
  confidence: number;
  provenance: string;
}

export interface SemanticConfidenceVector {
  overall: number;
  target: number;
  row_unit: number;
  role: number;
  action: number;
  relation: number;
  object: number;
  geography: number;
  evidence_contract: number;
  registry_match_confidence?: number;
  semantic_object_confidence?: number;
  public_taxonomy_confidence?: number;
}

export interface IntentGraphNode {
  id: string;
  type: 'ENTITY' | 'ROLE' | 'ACTION' | 'RELATION' | 'OBJECT' | 'QUALIFIER' | 'GEOGRAPHY' | 'CONTACT';
  label: string;
  properties: Record<string, any>;
}

export interface IntentGraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface IntentGraph {
  nodes: IntentGraphNode[];
  edges: IntentGraphEdge[];
}

export interface SemanticTarget {
  entity_type: UniversalEntityType;
  row_unit: UniversalRowUnit;
  role: UniversalRole;
}

export interface SemanticIntent {
  role: UniversalRole;
  action: UniversalAction;
  relation: UniversalRelation;
  direction: string; // e.g. "source -> product", "source -> target_entity"
}

export interface SemanticSubject {
  head_noun: string;
  modifiers: string[];
}

export interface SemanticObject {
  concept_id: string | null;
  canonical_name: string | null;
  raw_term: string;
  raw_object_phrase: string;
  raw_service_phrase?: string;
  raw_product_phrase?: string;
  domain: string;
  qualifiers: string[];
  native_taxonomy_ids?: {
    clae?: string[];
    osm?: string[];
    wikidata?: string[];
  };
}

export interface SemanticGeography {
  geography_id: string | null;
  canonical_name: string | null;
  raw_mention: string | null;
  raw_geography_phrase: string | null;
  level: 'COUNTRY' | 'PROVINCE' | 'DEPARTMENT' | 'CITY' | 'NEIGHBORHOOD' | 'NATIONAL' | 'LOCALITY' | 'CITY_PROVINCE' | null;
  confidence: number;
  is_ambiguous: boolean;
  ambiguity_prompt?: string;
  candidate_geographies?: string[];
}

export interface MissionExecutionLayers {
  semantic_understanding: boolean;
  canonicalization: boolean;
  execution_capability: boolean;
  execution_readiness: boolean;
  gaps: {
    ontology_gap: boolean;
    geography_gap: boolean;
    source_gap: boolean;
    evidence_gap: boolean;
    taxonomy_gap?: boolean;
  };
}

export interface SemanticContactRequirement {
  required: boolean;
  type: 'EMAIL' | 'PHONE' | 'WEB' | 'PUBLIC_CONTACT' | 'ANY';
  direct_email_extract: boolean;
  public_only: boolean;
}

export type SourceArchetype = 
  | 'OPEN_DATA_PORTAL'
  | 'CKAN_PORTAL'
  | 'PUBLIC_REGISTRY'
  | 'PROFESSIONAL_REGISTRY'
  | 'BUSINESS_DIRECTORY'
  | 'MEMBER_DIRECTORY'
  | 'CHAMBER_DIRECTORY'
  | 'GOVERNMENT_API'
  | 'CSV_DATASET'
  | 'JSON_DATASET'
  | 'GEOJSON_DATASET'
  | 'SPARQL_ENDPOINT'
  | 'OAI_PMH'
  | 'HTML_TABLE'
  | 'HTML_LIST'
  | 'PAGINATED_DIRECTORY'
  | 'SEARCHABLE_REGISTRY'
  | 'INSTITUTIONAL_WEB'
  | 'ENTITY_WEBSITE'
  | 'SEARCH_ENGINE_DISCOVERY';

export interface AtlasMissionIR {
  mission_id: string;
  raw_query: string;
  normalized_query: string;

  target: SemanticTarget;
  intent: SemanticIntent;
  subject: SemanticSubject;
  object: SemanticObject;
  geography: SemanticGeography;
  contact: SemanticContactRequirement;

  target_count: number | null;
  net_new_required: boolean;

  intent_graph: IntentGraph;
  evidence_contract: EvidenceItemContract[];
  negative_constraints: NegativeConstraint[];

  semantic_confidence: SemanticConfidenceVector;
  resolution_state: ResolutionState;

  source_archetype_expectations?: SourceArchetype[];
  public_taxonomy?: PublicTaxonomyEntry[];

  can_auto_execute: boolean;
  requires_user_clarification: boolean;
  clarification_prompt?: string;

  execution_layers?: MissionExecutionLayers;

  compiler_ir_id?: string;
  ir_hash?: string;
  candidate_concepts?: string[];

  provenance: string;
  timestamp: string;
  version: string;
}

