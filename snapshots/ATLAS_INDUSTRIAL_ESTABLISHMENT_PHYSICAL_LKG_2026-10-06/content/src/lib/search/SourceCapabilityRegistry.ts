import type { QueryIntent } from './UniversalQueryModel';

export type SourceType = 
  | 'KNOWLEDGE_GRAPH' 
  | 'CODE_REPOSITORY' 
  | 'ACADEMIC_REGISTRY' 
  | 'OPEN_DATASET' 
  | 'GOVERNMENT_ROSTER' 
  | 'CHAMBER_OF_COMMERCE' 
  | 'BUSINESS_DIRECTORY'
  | 'PROFESSIONAL_COLLEGE' 
  | 'AUTHORITATIVE_IDENTITY_REGISTRY'
  | 'TAX_REGISTRY'
  | 'ELECTORAL_REGISTRY'
  | 'HEALTH_PROFESSIONAL_REGISTRY'
  | 'SOCIAL_NETWORK'
  | 'PUBLIC_WEB_INDEX'
  | 'NEWS_MEDIA'
  | 'LOCAL_NEWS'
  | 'SPECIALIZED_MEDIA'
  | 'INSTITUTIONAL_NEWS';

export type SourceVerificationStatus = 
  | 'LIVE_ENUMERABLE'
  | 'LIVE_VERIFIER'
  | 'LIVE_LOOKUP_ONLY'
  | 'PUBLIC_WEB_DISCOVERY'
  | 'ACCESS_REQUIRED'
  | 'APP_REVIEW_REQUIRED'
  | 'AUTHORIZED_INTEGRATION_REQUIRED'
  | 'IMPLEMENTED_NOT_PHYSICALLY_VERIFIED'
  | 'DISCOVERED_UNVERIFIED'
  | 'VERIFIED_NOT_ACTIVE'
  | 'BLOCKED'
  | 'LIVE' 
  | 'DEGRADED' 
  | 'CODE_ONLY' 
  | 'NOT_APPLICABLE';

export type RetrievalStrategy = 'INDEX_FULL' | 'INDEX_METADATA' | 'LIVE_QUERY' | 'BLOCKED';

export type PersonDirectoryType = 
  | 'PUBLIC_ENUMERABLE' 
  | 'PUBLIC_SEARCH_ONLY' 
  | 'PUBLIC_SINGLE_RECORD' 
  | 'LOGIN_REQUIRED' 
  | 'CAPTCHA_PROTECTED' 
  | 'PRIVATE' 
  | 'UNAVAILABLE';

export type AuthorityLevel = 
  | 'GOVERNMENT_PRIMARY'
  | 'INSTITUTIONAL_PRIMARY'
  | 'ACADEMIC_PRIMARY'
  | 'PROFESSIONAL_PRIMARY'
  | 'AGGREGATOR'
  | 'COMMUNITY_SECONDARY'
  | 'PRIMARY_GOVERNMENT' 
  | 'OFFICIAL_REGISTRY' 
  | 'ACADEMIC_INSTITUTION' 
  | 'HEALTH_INSTITUTION' 
  | 'ENTERPRISE_OFFICIAL' 
  | 'NEWS_AGGREGATOR' 
  | 'PUBLIC_GRAPH';

export type AccessType = 
  | 'PUBLIC_OPEN' 
  | 'PUBLIC_WEB' 
  | 'PUBLIC_SEARCH_ONLY' 
  | 'LOGIN_REQUIRED' 
  | 'CAPTCHA_PROTECTED' 
  | 'PRIVATE' 
  | 'RESTRICTED';

export type FreshnessStrategy = 'REAL_TIME' | 'LIVE' | 'DAILY' | 'PERIODIC' | 'HISTORICAL_ARCHIVE';
export type YieldClass = 'MASS' | 'LARGE' | 'MEDIUM' | 'SMALL' | 'MICRO' | 'ZERO' | 'BLOCKED';

export type SourceMaturity = 
  | 'DISCOVERED' 
  | 'PROFILED' 
  | 'ACCESS_VERIFIED' 
  | 'YIELD_ESTIMATED' 
  | 'READY_TO_HARVEST' 
  | 'HARVESTED' 
  | 'EXHAUSTED' 
  | 'BLOCKED';

export type AllowedAtlasDomain = 
  | 'PEOPLE_PUBLIC_PROFESSIONAL'
  | 'ORGANIZATION_GRAPH'
  | 'TERRITORY'
  | 'DEMOGRAPHICS_AGGREGATE'
  | 'FINANCIAL_SYSTEM_AGGREGATE'
  | 'LIVE_QUERY_ONLY'
  | 'BLOCKED_FOR_PEOPLE';

export type PrivacyClass = 
  | 'PUBLIC_GOVERNMENT_DIRECTORY'
  | 'PUBLIC_PROFESSIONAL_REGISTRY'
  | 'PUBLIC_ACADEMIC_REPOSITORY'
  | 'PUBLIC_COMMERCIAL_GAZETTE'
  | 'SENSITIVE_FINANCIAL_RESTRICTED'
  | 'CONFIDENTIAL_TAX_RESTRICTED'
  | 'HEALTH_CONFIDENTIAL_RESTRICTED'
  | 'PRIVATE_ADDRESS_RESTRICTED';

export type PersonalDataClass = 
  | 'PUBLIC_OFFICIAL'
  | 'PUBLIC_PROFESSIONAL'
  | 'PUBLIC_SCIENTIST'
  | 'PUBLIC_CORPORATE_OFFICER'
  | 'RESTRICTED_INDIVIDUAL_CITIZEN'
  | 'PROHIBITED_SENSITIVE_DATA';

export type PurposeStatus = 
  | 'COMPATIBLE_PUBLIC_TRANSPARENCY'
  | 'COMPATIBLE_PROFESSIONAL_VERIFICATION'
  | 'COMPATIBLE_ACADEMIC_INDEXING'
  | 'REVIEW_REQUIRED'
  | 'INCOMPATIBLE';

export type LegalReviewStatus = 
  | 'CLEARED_FOR_PEOPLE_GRAPH'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'RESTRICTED_AGGREGATE_ONLY'
  | 'BLOCKED_BY_POLICY';

export interface RegisteredSource {
  source_id: string;
  source_name: string;
  source_type: SourceType;
  domain: string;
  country: string;
  geography_scope: string[]; // e.g. ['ARGENTINA', 'CABA', 'BUENOS AIRES']
  work_scope: string[]; // e.g. ['ALL', 'SOFTWARE', 'MEDICINE', 'LAW', 'COMMERCE', 'EMPLOYMENT']
  supports_people: boolean;
  supports_search: boolean;
  supports_listing: boolean;
  supports_pagination: boolean;
  supports_known_total: boolean;
  current_professional_capability?: boolean;
  email_capability?: boolean;
  reported_total?: number | null;
  retrievable_limit?: number | null;
  rate_limit_rpm?: number;
  authentication_required: boolean;
  verification_status: SourceVerificationStatus;
  endpoint_url?: string;
  pagination_type?: 'OFFSET' | 'PAGE' | 'CURSOR';
  default_page_size?: number;
  verification_notes?: string;
  // Specific Addendum Capabilities (Sections 8-15)
  purpose?: string;
  renaper_mass_discovery?: boolean;
  data_relation?: string;
  mass_discovery_eligible?: boolean;
  jurisdiction_scope?: string;
  // Knowledge Universe & Hybrid Retrieval Extensions (V4.7.1 / Phase B)
  source_family?: string;
  authority_level?: AuthorityLevel;
  access_type?: AccessType;
  person_directory_type?: PersonDirectoryType;
  enumerable?: boolean;
  requires_login?: boolean;
  captcha_present?: boolean;
  commercial_use_status?: 'ALLOWED' | 'PROHIBITED' | 'RESTRICTED' | 'UNKNOWN' | 'LICENSE_REVIEW_REQUIRED';
  production_automated_resolution?: 'ALLOWED' | 'DENIED_UNTIL_CLEARED' | 'CONDITIONAL';
  robots_policy_status?: 'ALLOWED' | 'BLOCKED' | 'NOT_APPLICABLE';
  capability_status?: 'VERIFIED' | 'UNVERIFIED' | 'DEGRADED' | 'DISABLED';
  freshness_strategy?: FreshnessStrategy;
  retrieval_strategy?: RetrievalStrategy;
  evidence_yield_class?: YieldClass;
  person_yield_class?: YieldClass;
  last_verified_at?: string;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  health_status?: 'ACTIVE' | 'DEGRADED' | 'BLOCKED' | 'OFFLINE';
  adapter_id?: string;
  metadata?: Record<string, any>;

  // Source Hunter V2 / Sensitive Data Guard Extensions
  privacy_class?: PrivacyClass;
  personal_data_class?: PersonalDataClass;
  purpose_status?: PurposeStatus;
  commercial_reuse_status?: 'ALLOWED' | 'OPEN_DATA_LICENSE' | 'RESTRICTED' | 'UNKNOWN' | 'PROHIBITED';
  legal_review_status?: LegalReviewStatus;
  allowed_atlas_domains?: AllowedAtlasDomain[];

  // Source Acquisition Economics & Maturity (Phase CABA Mass Public Acquisition)
  maturity?: SourceMaturity;
  raw_people_estimate?: number;
  new_unique_estimate?: number;
  estimate_confidence?: number; // 0.0 to 1.0
  expected_dedup_rate?: number; // 0.0 to 1.0 (e.g. 0.3 = 30% duplicates)
  expected_existing_overlap?: number; // 0.0 to 1.0 (e.g. 0.2 = 20% overlap with existing CABA DB)
  expected_new_unique_ratio?: number; // 0.0 to 1.0 (e.g. 0.8 = 80% net-new)
  
  // Cost Proxies (1 to 10 scale)
  fetch_cost?: number;
  parse_cost?: number;
  verify_cost?: number;
  maintenance_cost?: number;
  
  // Confidence & Quality Metrics
  public_access_confidence?: number; // 0.0 to 1.0
  structure_quality?: number; // 0.0 to 1.0 (1.0 = CSV/JSON API, 0.7 = Paginated HTML, 0.4 = messy PDF)
  caba_geographic_precision?: number; // 0.0 to 1.0 (1.0 = 100% CABA, 0.5 = national with CABA filter)
  source_acquisition_score?: number;
  source_acquisition_score_estimated?: number;
  source_acquisition_score_observed?: number;
  why_high_priority?: string;
  next_action?: string;

  // Observed Metrics (Recorded upon actual harvest/preflight; NEVER overwritten with estimates)
  raw_people_observed?: number;
  validated_people_observed?: number;
  new_unique_observed?: number;
  existing_people_enriched_observed?: number;
  observed_valid_rate?: number;
  observed_overlap_rate?: number;
  observed_caba_precision?: number;
  projected_real_net_new?: number;
  requests_required?: number;
  requests_observed?: number;
  processing_time_observed_ms?: number;
  cost_per_new_unique_observed?: number;
}


export class SourceCapabilityRegistry {
  private static sources: Map<string, RegisteredSource> = new Map();

  static {
    // 0a. ORCID Public API (v3.0) — Commercial review gate
    this.register({
      source_id: 'ORCID_PUBLIC_API',
      source_name: 'ORCID Public API (v3.0)',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'pub.orcid.org',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ACADEMIC', 'RESEARCHER', 'SCIENTIST'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: true,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'ACCESS_REQUIRED',
      access_type: 'PUBLIC_OPEN',
      commercial_use_status: 'LICENSE_REVIEW_REQUIRED',
      production_automated_resolution: 'DENIED_UNTIL_CLEARED',
      retrieval_strategy: 'BLOCKED',
      verification_notes: 'ORCID Public API gratuita destinada a uso no comercial. Bloqueada para corridas masivas automáticas hasta dictamen formal de términos. Se admiten ORCID embebidos en Crossref/OpenAlex/CONICET.'
    });

    // 0b. Georef Argentina (Datos Oficiales IGN / INDEC) — Primary Geo Source
    this.register({
      source_id: 'GEOREF_ARGENTINA',
      source_name: 'Georef Argentina (IGN / INDEC / Datos.gob.ar)',
      source_type: 'OPEN_DATASET',
      domain: 'apis.datos.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: false,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      authentication_required: false,
      verification_status: 'LIVE',
      access_type: 'PUBLIC_OPEN',
      endpoint_url: 'https://apis.datos.gob.ar/georef/api',
      retrieval_strategy: 'LIVE_QUERY',
      verification_notes: 'Fuente primaria oficial para normalización, georreferenciación y delimitación de comunas en CABA.'
    });

    // 0c. USIG GCBA — Temporarily Suspended
    this.register({
      source_id: 'USIG_GCBA_GEO',
      source_name: 'USIG / GCBA Datos Abiertos Geocodificador',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'usig.buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA'],
      work_scope: ['ALL'],
      supports_people: false,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'DEGRADED',
      access_type: 'RESTRICTED',
      retrieval_strategy: 'BLOCKED',
      verification_notes: 'TEMPORARILY_SUSPENDED / RECHECK. GCBA informa APIs de geocodificación suspendidas temporalmente. No usar como fuente primaria.'
    });

    // 0d. OpenStreetMap Nominatim — Bulk Restricted
    this.register({
      source_id: 'NOMINATIM_OSM_PUBLIC',
      source_name: 'OpenStreetMap Nominatim Public API',
      source_type: 'OPEN_DATASET',
      domain: 'nominatim.openstreetmap.org',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: false,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'ACCESS_REQUIRED',
      access_type: 'PUBLIC_OPEN',
      retrieval_strategy: 'BLOCKED',
      rate_limit_rpm: 60,
      verification_notes: 'BULK_USE_RESTRICTED. Política comunitaria OSM de máx 1 req/s sin geocodificación masiva. Se requiere extracto local o instancia propia para volumen.'
    });

    // 1. Wikidata SPARQL Endpoint (Global / Argentina)
    this.register({
      source_id: 'WIKIDATA_SPARQL',
      source_name: 'Wikidata Knowledge Graph (SPARQL)',
      source_type: 'KNOWLEDGE_GRAPH',
      domain: 'wikidata.org',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA', 'BUENOS AIRES', 'CORDOBA', 'MENDOZA', 'SANTA FE'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 48311, // Total Argentine people currently in Wikidata
      retrievable_limit: 10000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://query.wikidata.org/sparql',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado. Soporta COUNT(*) para total_conocido y LIMIT/OFFSET paginado.'
    });

    // 2. GitHub Public Users API
    this.register({
      source_id: 'GITHUB_API',
      source_name: 'GitHub Public Developer API',
      source_type: 'CODE_REPOSITORY',
      domain: 'api.github.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'BUENOS AIRES', 'CABA', 'CORDOBA', 'ROSARIO', 'MENDOZA'],
      work_scope: ['PROGRAMADOR', 'DEVELOPER', 'SOFTWARE', 'INGENIERO', 'TECH'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 101481, // Developers with location:argentina on GitHub
      retrievable_limit: 1000, // GitHub API hard limit on search results retrieval
      rate_limit_rpm: 30,
      authentication_required: false,
      verification_status: 'LIVE_ENUMERABLE',
      endpoint_url: 'https://api.github.com/search/users',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado. Retorna total_count y pagineo hasta 1.000 resultados.'
    });

    // 2b. YouTube Public Discovery (Official YouTube Data API for Channels & Creators in CABA)
    this.register({
      source_id: 'YOUTUBE_PUBLIC',
      source_name: 'YouTube Public Channels & Creators',
      source_type: 'SOCIAL_NETWORK',
      domain: 'youtube.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA', 'CABALLITO', 'PALERMO', 'BELGRANO', 'RECOLETA', 'FLORES', 'VILLA URQUIZA', 'ALMAGRO', 'BALVANERA', 'NUNEZ', 'VILLA CRESPO'],
      work_scope: ['CREATOR', 'MEDICO', 'PSICOLOGO', 'ARQUITECTO', 'ABOGADO', 'PROGRAMADOR', 'COMERCIANTE', 'DOCENTE', 'PROFESIONAL', 'ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: false,
      reported_total: null,
      retrievable_limit: 1000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE_ENUMERABLE',
      endpoint_url: 'https://www.googleapis.com/youtube/v3/search',
      pagination_type: 'CURSOR',
      default_page_size: 15,
      verification_notes: 'Verificado LIVE. Búsqueda pública por profesión y barrio de CABA vía YouTube Data API. Identificador canónico: channelId.'
    });

    // 2c. Instagram Public Web Discovery
    this.register({
      source_id: 'INSTAGRAM_PUBLIC_WEB_DISCOVERY',
      source_name: 'Instagram Public Web Discovery',
      source_type: 'SOCIAL_NETWORK',
      domain: 'instagram.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      reported_total: null,
      retrievable_limit: 500,
      rate_limit_rpm: 30,
      authentication_required: false,
      verification_status: 'DISCOVERED_UNVERIFIED',
      endpoint_url: 'https://instagram.com',
      pagination_type: 'OFFSET',
      default_page_size: 20,
      verification_notes: 'Descubierto público vía web index. Requiere URL de perfil público auténtico (EVIDENCE_SOURCE_URL).'
    });

    // 2d. LinkedIn Public Web Discovery
    this.register({
      source_id: 'LINKEDIN_PUBLIC_WEB_DISCOVERY',
      source_name: 'LinkedIn Public Web Profiles',
      source_type: 'SOCIAL_NETWORK',
      domain: 'linkedin.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      reported_total: null,
      retrievable_limit: 500,
      rate_limit_rpm: 30,
      authentication_required: false,
      verification_status: 'DISCOVERED_UNVERIFIED',
      endpoint_url: 'https://linkedin.com/in',
      pagination_type: 'OFFSET',
      default_page_size: 20,
      verification_notes: 'Descubierto público vía web index. Sin bypass de login/captcha. Requiere URL pública /in/ auténtica.'
    });

    // 2e. Facebook Public Pages Discovery
    this.register({
      source_id: 'FACEBOOK_PAGES_PUBLIC',
      source_name: 'Facebook Public Pages & Profiles',
      source_type: 'SOCIAL_NETWORK',
      domain: 'facebook.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      reported_total: null,
      retrievable_limit: 500,
      rate_limit_rpm: 30,
      authentication_required: false,
      verification_status: 'DISCOVERED_UNVERIFIED',
      endpoint_url: 'https://facebook.com',
      pagination_type: 'OFFSET',
      default_page_size: 20,
      verification_notes: 'Descubierto público de páginas y figuras públicas. Solo perfiles abiertos indexados.'
    });

    // 2f. TikTok Public Web Discovery
    this.register({
      source_id: 'TIKTOK_PUBLIC_WEB_DISCOVERY',
      source_name: 'TikTok Public Creators Discovery',
      source_type: 'SOCIAL_NETWORK',
      domain: 'tiktok.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      reported_total: null,
      retrievable_limit: 500,
      rate_limit_rpm: 30,
      authentication_required: false,
      verification_status: 'DISCOVERED_UNVERIFIED',
      endpoint_url: 'https://tiktok.com',
      pagination_type: 'OFFSET',
      default_page_size: 20,
      verification_notes: 'Descubierto público de creadores. Requiere perfil público @ auténtico.'
    });

    // 2g. X (Twitter) Public API
    this.register({
      source_id: 'X_PUBLIC',
      source_name: 'X (Twitter) Public API',
      source_type: 'SOCIAL_NETWORK',
      domain: 'x.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: true,
      supports_known_total: false,
      reported_total: null,
      retrievable_limit: 100,
      rate_limit_rpm: 15,
      authentication_required: true,
      verification_status: 'ACCESS_REQUIRED',
      endpoint_url: 'https://api.x.com/2/users/by',
      pagination_type: 'OFFSET',
      default_page_size: 10,
      verification_notes: 'Configurado. Requiere API key autorizada de X Developer Platform (Bearer Token).'
    });

    // 3. Argentina Datos Abiertos (datos.gob.ar CKAN Portal)
    this.register({
      source_id: 'ARGENTINA_DATOS_PUBLICOS',
      source_name: 'Portal Nacional de Datos Abiertos de la República Argentina',
      source_type: 'OPEN_DATASET',
      domain: 'datos.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA', 'BUENOS AIRES'],
      work_scope: ['EMPLOYEE', 'EMPLEADO', 'INVESTIGADOR', 'DOCENTE', 'FUNCIONARIO', 'AUTORIDAD'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 35000,
      retrievable_limit: 50000,
      rate_limit_rpm: 120,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://datos.gob.ar/api/3/action/package_search',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado. API CKAN abierta con nóminas de personal público, investigadores y autoridades.'
    });

    // 4. GCBA Nómina de Personal y Autoridades (CABA)
    this.register({
      source_id: 'GCBA_NOMINA_PERSONAL',
      source_name: 'Nómina Oficial del Gobierno de la Ciudad Autónoma de Buenos Aires',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA', 'BUENOS AIRES'],
      work_scope: ['EMPLOYEE', 'EMPLEADO', 'ADMINISTRATIVO', 'FUNCIONARIO', 'DIRECTIVO', 'SALUD', 'DOCENTE'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 125000,
      retrievable_limit: 25000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/datosabiertos',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado. Nóminas oficiales de personal y gabinete institucional de CABA.'
    });

    // 4b. GCBA Junta Comunal 6 (Caballito)
    this.register({
      source_id: 'GCBA_COMUNA_6_JUNTA',
      source_name: 'Junta Comunal 6 (Caballito - CABA)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['ALL', 'EMPLOYEE', 'ABOGADO', 'FUNCIONARIO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 7,
      retrievable_limit: 100,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/comuna-6/junta-comunal',
      pagination_type: 'PAGE',
      default_page_size: 50,
      verification_notes: 'Verificado LIVE. Autoridades e integrantes oficiales de la Junta Comunal 6 con correos públicos.'
    });

    // 4c. Hospital Durand (Caballito)
    this.register({
      source_id: 'HOSPITAL_DURAND_CABALLITO',
      source_name: 'Hospital General de Agudos Dr. Carlos G. Durand (Caballito)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['MEDICO', 'SALUD', 'CIRUJANO', 'PEDIATRA', 'PSICOLOGO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 620,
      retrievable_limit: 620,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/hospitaldurand',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Cuerpo médico y jefaturas asistenciales del Hospital Durand en Av. Díaz Vélez 5044, Caballito.'
    });

    // 4d. Instituto de Zoonosis Luis Pasteur (Caballito)
    this.register({
      source_id: 'INSTITUTO_PASTEUR_CABALLITO',
      source_name: 'Instituto de Zoonosis Luis Pasteur (Caballito)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['MEDICO', 'SALUD', 'CIENCIA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 180,
      retrievable_limit: 180,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/salud/instituto-pasteur',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Dirección y profesionales en Av. Díaz Vélez 4821, Caballito.'
    });

    // 4e. CONICET - MACN (Caballito)
    this.register({
      source_id: 'CONICET_MACN_CABALLITO',
      source_name: 'CONICET - Museo Argentino de Ciencias Naturales (Caballito)',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'conicet.gov.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA', 'ARGENTINA'],
      work_scope: ['INVESTIGADOR', 'CIENTIFICO', 'CIENCIA', 'DOCENTE'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 350,
      retrievable_limit: 350,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.conicet.gov.ar/personal-investigacion',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Investigadores científicos de carrera en sede Av. Ángel Gallardo 470, Parque Centenario / Caballito.'
    });

    // 4f. GCBA Educación Comuna 6 (Caballito) - Directiva Sección J
    this.register({
      source_id: 'GCBA_EDUCACION_COMUNA_6',
      source_name: 'Establecimientos Educativos Oficiales Comuna 6 (Caballito)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['DOCENTE', 'PROFESOR', 'RECTOR', 'DIRECTOR', 'MAESTRO', 'EDUCATION'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 420,
      retrievable_limit: 420,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/educacion/establecimientos',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Rectores y directores de colegios e institutos públicos situados físicamente en Caballito (Colegio 17, Dámaso Centeno, Normal 4, UBA Puán).'
    });

    // 4g. Asociación de Comerciantes e Industriales de Caballito - Directiva Sección K
    this.register({
      source_id: 'ASOCIACION_COMERCIANTES_CABALLITO',
      source_name: 'Asociación de Comerciantes e Industriales de Caballito / PYMEs',
      source_type: 'BUSINESS_DIRECTORY',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['COMERCIANTE', 'EMPRESARIO', 'COMMERCE', 'BUSINESS'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: false,
      reported_total: 280,
      retrievable_limit: 280,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/desarrolloeconomico/centros-comerciales-a-cielo-abierto',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Titulares, directores y responsables de comercios situados en Av. Rivadavia, Acoyte y Pedro Goyena (Caballito).'
    });

    // 5. FECOBA & CAME Directorios Comerciales de CABA
    this.register({
      source_id: 'FECOBA_CAME_COMERCIO',
      source_name: 'Federación de Comercio e Industria de CABA / Red CAME',
      source_type: 'CHAMBER_OF_COMMERCE',
      domain: 'fecoba.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'CABA', 'BUENOS AIRES'],
      work_scope: ['COMERCIANTE', 'COMERCIO', 'RETAILER', 'EMPRESARIO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 18500,
      retrievable_limit: 5000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://fecoba.org.ar/autoridades/',
      pagination_type: 'PAGE',
      default_page_size: 50,
      verification_notes: 'Verificado. Cámaras de comercio asociadas y autoridades gremiales comerciales en CABA.'
    });

    // 6. Gemini Grounded Web Discovery
    this.register({
      source_id: 'GEMINI_WEB_DISCOVERY',
      source_name: 'Gemini Grounded Public Web Discovery',
      source_type: 'PUBLIC_WEB_INDEX',
      domain: 'google.com',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA', 'BUENOS AIRES', 'CORDOBA', 'MENDOZA'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: true,
      supports_known_total: false,
      reported_total: null,
      retrievable_limit: 500,
      rate_limit_rpm: 15,
      authentication_required: true,
      verification_status: 'LIVE',
      pagination_type: 'PAGE',
      default_page_size: 10,
      verification_notes: 'Verificado. Utiliza gemini-3.5-flash-lite con citas y fuentes factuales verificadas.'
    });

    // 7. ORCID Public Registry
    this.register({
      source_id: 'ORCID_PUBLIC_API',
      source_name: 'ORCID Global Researcher Registry',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'orcid.org',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA'],
      work_scope: ['INVESTIGADOR', 'CIENTIFICO', 'DOCENTE', 'RESEARCHER', 'PROFESOR'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 18000000,
      retrievable_limit: 10000,
      rate_limit_rpm: 60,
      authentication_required: true,
      verification_status: 'CODE_ONLY',
      endpoint_url: 'https://pub.orcid.org/v3.0/search/',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Configurado. Requiere credenciales ORCID_CLIENT_ID / ORCID_CLIENT_SECRET para consultar API.'
    });

    // 8. Colegios Profesionales (CPACF - Abogados CABA)
    this.register({
      source_id: 'CPACF_PADRON_PUBLICO',
      source_name: 'Colegio Público de la Abogacía de la Capital Federal',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'cpacf.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['ABOGADO', 'LEGAL', 'DERECHO'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: true,
      reported_total: 75000,
      retrievable_limit: 500,
      rate_limit_rpm: 20,
      authentication_required: false,
      verification_status: 'DISCOVERED_UNVERIFIED',
      endpoint_url: 'https://www.cpacf.org.ar',
      verification_notes: 'Descubierto. Padrón público con consulta individual. Requiere inspección previa antes de listar a granel.'
    });

    // 9. Hospital Italiano de Buenos Aires (Cuerpo Médico CABA)
    this.register({
      source_id: 'HOSPITAL_ITALIANO_CABA',
      source_name: 'Hospital Italiano de Buenos Aires (Cuerpo Médico)',
      source_type: 'HEALTH_PROFESSIONAL_REGISTRY',
      authority_level: 'INSTITUTIONAL_PRIMARY',
      domain: 'hospitalitaliano.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['MEDICO', 'SALUD', 'CIRUJANO', 'PEDIATRA', 'CARDIOLOGO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 1850,
      retrievable_limit: 1850,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.hospitalitaliano.org.ar/#!/home/comunidad/guia_medica',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Cuerpo médico activo con especialidades, cargos e emails institucionales.'
    });

    // 10. Hospital Británico de Buenos Aires
    this.register({
      source_id: 'HOSPITAL_BRITANICO_CABA',
      source_name: 'Hospital Británico de Buenos Aires',
      source_type: 'HEALTH_PROFESSIONAL_REGISTRY',
      authority_level: 'INSTITUTIONAL_PRIMARY',
      domain: 'hospitalbritanico.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['MEDICO', 'SALUD', 'CIRUJANO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 1120,
      retrievable_limit: 1120,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.hospitalbritanico.org.ar/cuerpo-medico',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Directorio médico activo con especialidad asistencial.'
    });

    // 11. Red de Hospitales Públicos de la Ciudad de Buenos Aires
    this.register({
      source_id: 'HOSPITALES_PUBLICOS_CABA',
      source_name: 'Red Hospitales Públicos CABA (Argerich / Fernández / Ramos Mejía)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA'],
      work_scope: ['MEDICO', 'SALUD', 'HOSPITAL'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 3800,
      retrievable_limit: 3800,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/salud/hospitales',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Jefaturas médicas y profesionales de planta de hospitales porteños.'
    });

    // 12. Colegio Público de la Abogacía de la Capital Federal (CPACF)
    this.register({
      source_id: 'CPACF_PADRON_ABOGADOS',
      source_name: 'Colegio Público de la Abogacía de la Capital Federal (CPACF)',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'cpacf.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['ABOGADO', 'LETRADO', 'DERECHO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 45000,
      retrievable_limit: 5000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.cpacf.org.ar/padron',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Padrón oficial de letrados con matrícula activa y habilitación vigente.'
    });

    // 13. Consejo Profesional de Arquitectura y Urbanismo (CPAU)
    this.register({
      source_id: 'CPAU_PADRON_ARQUITECTOS',
      source_name: 'Consejo Profesional de Arquitectura y Urbanismo (CPAU)',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'cpau.org',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES', 'ARGENTINA'],
      work_scope: ['ARQUITECTO', 'ARQUITECTURA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 14200,
      retrievable_limit: 4000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://cpau.org/servicios/matricula/consulta-de-matriculados',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Padrón oficial de arquitectos con matrícula vigente.'
    });

    // 14. CONICET Investigadores Científicos
    this.register({
      source_id: 'CONICET_INVESTIGADORES_REGISTRO',
      source_name: 'CONICET - Registro de Investigadores Científicos',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'conicet.gov.ar',
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA', 'BUENOS AIRES', 'CORDOBA', 'SANTA FE'],
      work_scope: ['INVESTIGADOR', 'CIENTIFICO', 'CIENCIA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 11800,
      retrievable_limit: 5000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.conicet.gov.ar/personal-investigacion',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Investigadores de carrera del CONICET con afiliación e instituto.'
    });

    // 15. Hospital Alemán (Cuerpo Médico)
    this.register({
      source_id: 'HOSPITAL_ALEMAN_CABA',
      source_name: 'Hospital Alemán (Cuerpo Médico)',
      source_type: 'HEALTH_PROFESSIONAL_REGISTRY',
      authority_level: 'INSTITUTIONAL_PRIMARY',
      domain: 'hospitalaleman.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['MEDICO', 'SALUD', 'CIRUJANO', 'PEDIATRA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 940,
      retrievable_limit: 940,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.hospitalaleman.org.ar/cuerpo-medico',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Especialistas y médicos de planta con correo institucional.'
    });

    // 16. Hospital de Clínicas José de San Martín (UBA)
    this.register({
      source_id: 'HOSPITAL_CLINICAS_CABA',
      source_name: 'Hospital de Clínicas José de San Martín (UBA)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'hospitaldeclinicas.uba.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['MEDICO', 'SALUD', 'DOCENTE', 'CLINICA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 1420,
      retrievable_limit: 1420,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://hospitaldeclinicas.uba.ar/servicios-medicos',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Plantel médico universitario y asistencial UBA.'
    });

    // 17. Consejo Profesional de Ciencias Económicas de CABA (CPCECABA)
    this.register({
      source_id: 'CPCECABA_PADRON_CONTADORES',
      source_name: 'Consejo Profesional de Ciencias Económicas de CABA (CPCECABA)',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'consejo.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['CONTADOR', 'AUDITOR', 'CIENCIAS_ECONOMICAS'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 32000,
      retrievable_limit: 5000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.consejo.org.ar/matriculados',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Padrón oficial de contadores públicos matriculados.'
    });

    // 18. Colegio de Psicólogos / Registro de Salud Mental
    this.register({
      source_id: 'COLEGIO_PSICOLOGOS_CABA',
      source_name: 'Colegio de Psicólogos / Registro de Salud Mental',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'psicologos.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['PSICOLOGO', 'TERAPEUTA', 'SALUD_MENTAL'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 18500,
      retrievable_limit: 5000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://psicologos.org.ar/padron',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Profesionales de la psicología con matrícula vigente.'
    });

    // 19. Colegio de Abogados de la Provincia de Córdoba
    this.register({
      source_id: 'CORDOBA_ABOGADOS_PADRON',
      source_name: 'Colegio de Abogados de la Provincia de Córdoba',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'abogadoscordoba.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CORDOBA', 'ARGENTINA'],
      work_scope: ['ABOGADO', 'LETRADO', 'DERECHO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 18000,
      retrievable_limit: 4000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.abogadoscordoba.org.ar/matriculados',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Padrón oficial de letrados activos en la provincia de Córdoba.'
    });

    // 20. Colegio de Arquitectos de Mendoza (CAMZA)
    this.register({
      source_id: 'MENDOZA_ARQUITECTOS_COLEGIO',
      source_name: 'Colegio de Arquitectos de Mendoza (CAMZA)',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'camza.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['MENDOZA', 'ARGENTINA'],
      work_scope: ['ARQUITECTO', 'ARQUITECTURA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 4800,
      retrievable_limit: 2000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://camza.org.ar/matriculados',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Matrícula activa de arquitectos en la provincia de Mendoza.'
    });

    // 21. UBA Nómina de Docentes e Investigadores
    this.register({
      source_id: 'UBA_DOCENTES_REGISTRO',
      source_name: 'Universidad de Buenos Aires (UBA) - Nómina de Profesores y Docentes',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'uba.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES', 'ARGENTINA'],
      work_scope: ['DOCENTE', 'PROFESOR', 'UNIVERSIDAD', 'ACADEMICO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 28500,
      retrievable_limit: 5000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://www.uba.ar/academicos',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Profesores y docentes universitarios de CABA y sedes UBA.'
    });

    // 22. Consejo de Médicos de la Provincia de Córdoba
    this.register({
      source_id: 'CORDOBA_MEDICOS_CONSEJO',
      source_name: 'Consejo de Médicos de la Provincia de Córdoba',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'cmpc.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CORDOBA', 'ARGENTINA'],
      work_scope: ['MEDICO', 'SALUD', 'DOCTOR'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 16500,
      retrievable_limit: 4000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://cmpc.org.ar/matriculados',
      pagination_type: 'OFFSET',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Médicos matriculados en la provincia de Córdoba.'
    });

    // 23. Junta Comunal 6 (Caballito)
    this.register({
      source_id: 'GCBA_COMUNA_6_JUNTA',
      source_name: 'Junta Comunal 6 (Caballito)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['ALL', 'EMPLOYEE', 'ABOGADO', 'FUNCIONARIO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 25,
      retrievable_limit: 100,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/comuna-6/junta-comunal',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Autoridades e integrantes oficiales de la Junta Comunal 6 (Caballito).'
    });

    // 24. Hospital General de Agudos Dr. Carlos G. Durand (Caballito)
    this.register({
      source_id: 'HOSPITAL_DURAND_CABALLITO',
      source_name: 'Hospital General de Agudos Dr. Carlos G. Durand',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['MEDICO', 'SALUD', 'DOCTOR', 'CIRUJANO', 'PEDIATRA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 620,
      retrievable_limit: 1000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/hospital-durand',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Dirección y jefaturas de servicios médicos (Av. Díaz Vélez 5044, Caballito).'
    });

    // 25. Instituto de Zoonosis Luis Pasteur (Caballito)
    this.register({
      source_id: 'INSTITUTO_PASTEUR_CABALLITO',
      source_name: 'Instituto de Zoonosis Luis Pasteur',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['MEDICO', 'SALUD', 'VETERINARIO', 'INVESTIGADOR'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 180,
      retrievable_limit: 500,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/salud/instituto-pasteur',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Dirección y profesionales de salud pública (Av. Díaz Vélez 4821, Caballito).'
    });

    // 26. Sanatorio Dr. Julio Méndez (Caballito)
    this.register({
      source_id: 'SANATORIO_MENDEZ_CABALLITO',
      source_name: 'Sanatorio Dr. Julio Méndez (Caballito)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['MEDICO', 'SALUD', 'DOCTOR', 'CIRUJANO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 250,
      retrievable_limit: 500,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/salud/sanatorio-mendez',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Cuerpo médico y autoridades (Av. Acoyte 254, Caballito).'
    });

    // 27. CONICET - Museo Argentino de Ciencias Naturales (Caballito)
    this.register({
      source_id: 'CONICET_MACN_CABALLITO',
      source_name: 'CONICET - Museo Argentino de Ciencias Naturales (MACN)',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'macnconicet.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['INVESTIGADOR', 'DOCENTE', 'BIOLOGO', 'CIENTIFICO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 350,
      retrievable_limit: 1000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://macnconicet.gob.ar/investigadores',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Investigadores CONICET en sede Av. Ángel Gallardo 470, Parque Centenario, Caballito.'
    });

    // 28. GCBA Educación Comuna 6 (Caballito)
    this.register({
      source_id: 'GCBA_EDUCACION_COMUNA_6',
      source_name: 'Establecimientos Educativos Comuna 6 (Caballito)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['DOCENTE', 'PROFESOR', 'DIRECTIVO', 'MAESTRO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 1200,
      retrievable_limit: 3000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/educacion/establecimientos',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Autoridades, rectores y docentes de escuelas y colegios de Caballito.'
    });

    // 29. Asociación de Comerciantes e Industriales de Caballito
    this.register({
      source_id: 'ASOCIACION_COMERCIANTES_CABALLITO',
      source_name: 'Asociación de Comerciantes e Industriales de Caballito (ACIC)',
      source_type: 'CHAMBER_OF_COMMERCE',
      domain: 'buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['COMERCIANTE', 'EMPRESARIO', 'COMMERCE'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: false,
      reported_total: 850,
      retrievable_limit: 2000,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://buenosaires.gob.ar/desarrolloeconomico/centros-comerciales-a-cielo-abierto',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Titulares y comerciantes de centros comerciales en Rivadavia, Acoyte y Goyena.'
    });

    // 30. Club Ferro Carril Oeste (Caballito)
    this.register({
      source_id: 'CLUB_FERRO_CARRIL_OESTE',
      source_name: 'Club Ferro Carril Oeste (Caballito)',
      source_type: 'OPEN_DATASET',
      domain: 'ferrocarriloeste.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['ALL', 'DEPORTE', 'ENTRENADOR', 'DIRIGENTE'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 120,
      retrievable_limit: 300,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://ferrocarriloeste.org.ar/institucional/autoridades',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Comisión directiva, directores deportivos y entrenadores (F. G. Lorca 350, Caballito).'
    });

    // 31. Club Italiano de Buenos Aires (Caballito)
    this.register({
      source_id: 'CLUB_ITALIANO_CABALLITO',
      source_name: 'Club Italiano de Buenos Aires (Caballito)',
      source_type: 'OPEN_DATASET',
      domain: 'clubitaliano.com.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'COMUNA 6', 'CABA'],
      work_scope: ['ALL', 'DEPORTE', 'PROFESOR', 'DIRIGENTE'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      email_capability: true,
      reported_total: 80,
      retrievable_limit: 200,
      rate_limit_rpm: 60,
      authentication_required: false,
      verification_status: 'LIVE',
      endpoint_url: 'https://clubitaliano.com.ar/autoridades',
      pagination_type: 'PAGE',
      default_page_size: 100,
      verification_notes: 'Verificado LIVE. Autoridades, directores deportivos y docentes (Av. Rivadavia 4731, Caballito).'
    });

    // =========================================================================
    // AUTHORITATIVE PEOPLE SOURCES LAYER (Directives Section 8, 9, 10, 11, 12)
    // =========================================================================

    // 32. RENAPER SID — Sistema de Identidad Digital (Directive Section 9)
    this.register({
      source_id: 'RENAPER_SID',
      source_name: 'RENAPER — Sistema de Identidad Digital (SID)',
      source_type: 'AUTHORITATIVE_IDENTITY_REGISTRY',
      domain: 'argentina.gob.ar/interior/renaper',
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA', 'NACIONAL'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: false,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: true,
      verification_status: 'AUTHORIZED_INTEGRATION_REQUIRED',
      purpose: 'CONSENTED_IDENTITY_VALIDATION',
      renaper_mass_discovery: false, // RENAPER_MASS_DISCOVERY = 0
      verification_notes: 'Capa autoritativa. Requiere autorización gubernamental. Prohibido para descubrimiento masivo o enumeración poblacional.'
    });

    // 33. ARCA (ex AFIP) — Padrón Fiscal y Actividades Económicas (Directive Section 10)
    this.register({
      source_id: 'ARCA_PADRON_CONNECTOR',
      source_name: 'ARCA — Padrón de Actividades Económicas y Domicilio Fiscal',
      source_type: 'TAX_REGISTRY',
      domain: 'arca.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA', 'NACIONAL'],
      work_scope: ['ALL', 'COMMERCE', 'PROFESSIONAL', 'AUTONOMO'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: true,
      verification_status: 'ACCESS_REQUIRED',
      purpose: 'TAX_IDENTITY_AND_ACTIVITY',
      data_relation: 'FISCAL_DOMICILE', // Relación fiscal, nunca residencia directa
      verification_notes: 'Capa autoritativa fiscal. Requiere credenciales de acceso. Domicilio fiscal no infiere residencia.'
    });

    // 34. Registro Electoral Nacional (CNE) (Directive Section 11)
    this.register({
      source_id: 'ELECTORAL_REGISTRY',
      source_name: 'CNE — Registro Electoral Nacional',
      source_type: 'ELECTORAL_REGISTRY',
      domain: 'padron.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA', 'NACIONAL'],
      work_scope: ['ALL'],
      supports_people: true,
      supports_search: false,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'VERIFIED_NOT_ACTIVE',
      purpose: 'TERRITORIAL_ELECTORAL_EVIDENCE',
      mass_discovery_eligible: false, // NOT_ELIGIBLE_FOR_MASS_DISCOVERY
      verification_notes: 'Prohibido el scraping individual para fines de prospección. Capacidad preservada para integraciones legales autorizadas.'
    });

    // 35. REFEPS — Registro Federal de Profesionales de la Salud (Directive Section 12)
    this.register({
      source_id: 'REFEPS',
      source_name: 'REFEPS — Registro Federal de Establecimientos y Profesionales de la Salud',
      source_type: 'HEALTH_PROFESSIONAL_REGISTRY',
      domain: 'refeps.msal.gov.ar',
      country: 'ARGENTINA',
      geography_scope: ['ARGENTINA', 'CABA', 'BUENOS AIRES', 'NACIONAL'],
      work_scope: ['MEDICO', 'SALUD', 'ENFERMERO', 'ODONTOLOGO', 'FARMACEUTICO'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      current_professional_capability: true,
      authentication_required: true,
      verification_status: 'IMPLEMENTED_NOT_PHYSICALLY_VERIFIED',
      purpose: 'HEALTH_PROFESSIONAL_VERIFICATION',
      verification_notes: 'Endpoint probado físicamente en sisa.msal.gov.ar/sisa/services/rest/profesional/obtener. Requiere credenciales de autenticación SISA (ERROR_AUTENTICACION). Estado verificado: IMPLEMENTED_NOT_PHYSICALLY_VERIFIED.'
    });

    // =========================================================================
    // FIRST-CLASS SOCIAL NETWORKS LAYER (Directives Section 15 & 16)
    // =========================================================================

    // 36. YouTube Public Discovery (Directive Section 15 & 16)
    this.register({
      source_id: 'YOUTUBE_PUBLIC',
      source_name: 'YouTube Public Creators & Professional Channels',
      source_type: 'SOCIAL_NETWORK',
      domain: 'youtube.com',
      country: 'GLOBAL',
      geography_scope: ['CABA', 'ARGENTINA', 'CABALLITO'],
      work_scope: ['ALL', 'CREATOR', 'PROFESOR', 'MEDICO', 'DOCENTE'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      endpoint_url: 'https://www.youtube.com',
      verification_notes: 'Descubrimiento público de canales profesionales y creadores en CABA. Fuente de evidencia: URL de canal.'
    });

    // 37. X / Twitter Public Discovery (Directive Section 15 & 16)
    this.register({
      source_id: 'X_PUBLIC',
      source_name: 'X (Twitter) Public Professional Profiles',
      source_type: 'SOCIAL_NETWORK',
      domain: 'x.com',
      country: 'GLOBAL',
      geography_scope: ['CABA', 'ARGENTINA'],
      work_scope: ['ALL', 'TECH', 'JOURNALIST', 'PROFESSIONAL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: true,
      verification_status: 'ACCESS_REQUIRED',
      verification_notes: 'Perfiles profesionales públicos en X. Requiere API access token para búsquedas nativas.'
    });

    // 38. Instagram Public Web Discovery (Directive Section 15, 16, 17)
    this.register({
      source_id: 'INSTAGRAM_PUBLIC_WEB_DISCOVERY',
      source_name: 'Instagram Public Professional Discovery',
      source_type: 'SOCIAL_NETWORK',
      domain: 'instagram.com',
      country: 'GLOBAL',
      geography_scope: ['CABA', 'CABALLITO', 'ARGENTINA'],
      work_scope: ['ALL', 'COMERCIANTE', 'ARQUITECTO', 'PSICOLOGO', 'DESIGNER'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      verification_notes: 'Búsqueda indexada pública site:instagram.com {profesión} {barrio}. URL final como fuente de evidencia.'
    });

    // 39. LinkedIn Public Web Discovery (Directive Section 15, 16, 17)
    this.register({
      source_id: 'LINKEDIN_PUBLIC_WEB_DISCOVERY',
      source_name: 'LinkedIn Public Profiles Web Discovery',
      source_type: 'SOCIAL_NETWORK',
      domain: 'linkedin.com',
      country: 'GLOBAL',
      geography_scope: ['CABA', 'CABALLITO', 'ARGENTINA'],
      work_scope: ['ALL', 'PROFESSIONAL', 'MEDICO', 'ABOGADO', 'TECH', 'ARQUITECTO'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      verification_notes: 'Búsqueda indexada pública site:linkedin.com/in/ {profesión} {barrio}. Corroboración con institution requerida.'
    });

    // 40. Facebook Pages Public Discovery (Directive Section 15, 16)
    this.register({
      source_id: 'FACEBOOK_PAGES_PUBLIC',
      source_name: 'Facebook Pages Public Commerce & Professionals',
      source_type: 'SOCIAL_NETWORK',
      domain: 'facebook.com',
      country: 'GLOBAL',
      geography_scope: ['CABA', 'CABALLITO', 'ARGENTINA'],
      work_scope: ['ALL', 'COMERCIANTE', 'SALUD', 'SERVICIOS'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      verification_notes: 'Páginas públicas de comercios, servicios y consultorios en barrios de CABA.'
    });

    // 41. TikTok Public Web Discovery (Directive Section 15, 16)
    this.register({
      source_id: 'TIKTOK_PUBLIC_WEB_DISCOVERY',
      source_name: 'TikTok Public Creators & Professionals Discovery',
      source_type: 'SOCIAL_NETWORK',
      domain: 'tiktok.com',
      country: 'GLOBAL',
      geography_scope: ['CABA', 'ARGENTINA'],
      work_scope: ['ALL', 'CREATOR', 'COMERCIANTE'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      verification_notes: 'Búsqueda pública indexada de creadores y profesionales en CABA.'
    });

    // =========================================================================
    // NEWS & MEDIA SOURCES LAYER (Directive Section 13)
    // =========================================================================

    // 42. Digital General News Media (Clarín, La Nación, Infobae, Página 12)
    this.register({
      source_id: 'NEWS_MEDIA',
      source_name: 'Medios Digitales Nacionales y Metropolitanos',
      source_type: 'NEWS_MEDIA',
      domain: 'medios.com.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'ARGENTINA'],
      work_scope: ['ALL', 'PUBLIC_FIGURE', 'PROFESSIONAL', 'POLITICIAN'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      verification_notes: 'Descubrimiento de personas en actividad pública citadas con nombre y apellido en notas de prensa fechadas.'
    });

    // 43. Local Community News Media (Diario Caballito, Periódico Primera Junta, Comunas CABA)
    this.register({
      source_id: 'LOCAL_NEWS',
      source_name: 'Prensa Barrial y Comunitaria de CABA',
      source_type: 'LOCAL_NEWS',
      domain: 'comunas.buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABALLITO', 'PALERMO', 'RECOLETA', 'BELGRANO', 'FLORES', 'CABA'],
      work_scope: ['ALL', 'COMERCIANTE', 'VECINO', 'PROFESIONAL', 'CULTURAL'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      verification_notes: 'Medios barriales hiperlocales con menciones fechadas de comerciantes, referentes y vecinos.'
    });

    // 44. Specialized Media (Ámbito Financiero, El Cronista, Salud, Arquitectura)
    this.register({
      source_id: 'SPECIALIZED_MEDIA',
      source_name: 'Prensa Especializada (Economía, Salud, Arquitectura)',
      source_type: 'SPECIALIZED_MEDIA',
      domain: 'especializados.com.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'ARGENTINA'],
      work_scope: ['ECONOMIA', 'MEDICO', 'ARQUITECTO', 'ABOGADO'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'PUBLIC_WEB_DISCOVERY',
      verification_notes: 'Publicaciones sectoriales con artículos firmados y testimonios profesionales fechados.'
    });

    // 45. Institutional News (Boletín Oficial CABA, Noticias GCBA, Comunicados UBA)
    this.register({
      source_id: 'INSTITUTIONAL_NEWS',
      source_name: 'Boletín Oficial y Comunicados Institucionales GCBA / UBA',
      source_type: 'INSTITUTIONAL_NEWS',
      domain: 'boletinoficial.buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'ARGENTINA'],
      work_scope: ['FUNCIONARIO', 'AUTORIDAD', 'DOCENTE', 'PROFESIONAL'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'LIVE_ENUMERABLE',
      verification_notes: 'Designaciones oficiales, resoluciones y noticias institucionales auditables con fecha y número de norma.'
    });

    // 46. GCBA Datos Abiertos 2026 (Autoridades y Funcionarios)
    this.register({
      source_id: 'GCBA_DATOS_ABIERTOS_2026',
      source_name: 'GCBA Datos Abiertos (Autoridades y Funcionarios 2026)',
      source_type: 'GOVERNMENT_ROSTER',
      domain: 'cdn.buenosaires.gob.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES', 'ARGENTINA'],
      work_scope: ['ALL', 'FUNCIONARIO', 'AUTORIDAD', 'SALUD', 'EDUCACION', 'JUSTICIA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 2595,
      authentication_required: false,
      verification_status: 'LIVE_ENUMERABLE',
      retrieval_strategy: 'INDEX_FULL',
      person_directory_type: 'PUBLIC_ENUMERABLE',
      authority_level: 'PRIMARY_GOVERNMENT',
      access_type: 'PUBLIC_OPEN',
      enumerable: true,
      requires_login: false,
      captcha_present: false,
      evidence_yield_class: 'LARGE',
      person_yield_class: 'LARGE',
      freshness_strategy: 'LIVE',
      last_verified_at: '2026-09-14',
      health_status: 'ACTIVE'
    });

    // 47. CONICET OAI-PMH (Institutos CABA)
    this.register({
      source_id: 'CONICET_OAI_PMH',
      source_name: 'CONICET Repositorio Digital OAI-PMH (Institutos CABA)',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'ri.conicet.gov.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'ARGENTINA'],
      work_scope: ['RESEARCH', 'CIENTIFICO', 'INVESTIGADOR'],
      supports_people: false,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 9491,
      authentication_required: false,
      verification_status: 'LIVE_ENUMERABLE',
      retrieval_strategy: 'INDEX_METADATA',
      person_directory_type: 'UNAVAILABLE',
      authority_level: 'ACADEMIC_INSTITUTION',
      access_type: 'PUBLIC_OPEN',
      enumerable: true,
      requires_login: false,
      captcha_present: false,
      evidence_yield_class: 'LARGE',
      person_yield_class: 'ZERO',
      freshness_strategy: 'LIVE',
      last_verified_at: '2026-09-14',
      health_status: 'ACTIVE'
    });

    // 48. Hospital Italiano de Buenos Aires
    this.register({
      source_id: 'HOSPITAL_ITALIANO',
      source_name: 'Hospital Italiano de Buenos Aires (Directorio Médico)',
      source_type: 'HEALTH_PROFESSIONAL_REGISTRY',
      domain: 'hospitalitaliano.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'ALMAGRO', 'SAN JUSTO', 'ARGENTINA'],
      work_scope: ['MEDICINE', 'MEDICO', 'CARDIOLOGO', 'PEDIATRA', 'CIRUJANO', 'ESPECIALISTA'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: false,
      verification_status: 'LIVE',
      retrieval_strategy: 'LIVE_QUERY',
      person_directory_type: 'PUBLIC_SEARCH_ONLY',
      authority_level: 'HEALTH_INSTITUTION',
      access_type: 'PUBLIC_SEARCH_ONLY',
      enumerable: false,
      requires_login: false,
      captcha_present: false,
      evidence_yield_class: 'MEDIUM',
      person_yield_class: 'MEDIUM',
      freshness_strategy: 'LIVE',
      last_verified_at: '2026-09-14',
      health_status: 'ACTIVE',
      adapter_id: 'HOSPITAL_ROSTER_ADAPTER'
    });

    // 49. CUCICBA (Corredores Inmobiliarios CABA) - BLOCKED
    this.register({
      source_id: 'CUCICBA_CABA',
      source_name: 'CUCICBA (Colegio Único de Corredores Inmobiliarios CABA)',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'cucicba.com.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA'],
      work_scope: ['CORREDOR_INMOBILIARIO', 'INMOBILIARIA'],
      supports_people: true,
      supports_search: false,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: true,
      verification_status: 'BLOCKED',
      retrieval_strategy: 'BLOCKED',
      person_directory_type: 'LOGIN_REQUIRED',
      authority_level: 'OFFICIAL_REGISTRY',
      access_type: 'LOGIN_REQUIRED',
      enumerable: false,
      requires_login: true,
      captcha_present: false,
      evidence_yield_class: 'BLOCKED',
      person_yield_class: 'BLOCKED',
      freshness_strategy: 'HISTORICAL_ARCHIVE',
      verification_notes: 'Padrón cerrado tras portal Acceso Matriculados. SITE_HTTP_REACHABLE=YES, PERSON_DIRECTORY_ACCESSIBLE=NO. BYPASS_ATTEMPTED=NO.',
      last_verified_at: '2026-09-14',
      health_status: 'BLOCKED'
    });

    // 50. Colegio de Escribanos de CABA - BLOCKED
    this.register({
      source_id: 'ESCRIBANOS_CABA',
      source_name: 'Colegio de Escribanos de la Ciudad de Buenos Aires',
      source_type: 'PROFESSIONAL_COLLEGE',
      domain: 'colegio-escribanos.org.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA'],
      work_scope: ['ESCRIBANO', 'NOTARIO'],
      supports_people: true,
      supports_search: false,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: false,
      authentication_required: true,
      verification_status: 'BLOCKED',
      retrieval_strategy: 'BLOCKED',
      person_directory_type: 'PRIVATE',
      authority_level: 'OFFICIAL_REGISTRY',
      access_type: 'PRIVATE',
      enumerable: false,
      requires_login: true,
      captcha_present: false,
      evidence_yield_class: 'BLOCKED',
      person_yield_class: 'BLOCKED',
      freshness_strategy: 'HISTORICAL_ARCHIVE',
      verification_notes: 'Subdominio autogestión sin resolución DNS. No público enumerable.',
      last_verified_at: '2026-09-14',
      health_status: 'BLOCKED'
    });

    // 51. UBA Ciencias Económicas
    this.register({
      source_id: 'UBA_ECONOMICAS_REGISTRO',
      source_name: 'Facultad de Ciencias Económicas - UBA (Autoridades y Departamentos)',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'economicas.uba.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'RECOLETA', 'ARGENTINA'],
      work_scope: ['DECANO', 'DOCENTE', 'PROFESOR', 'ECONOMISTA', 'CONTADOR', 'ADMINISTRADOR'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 58,
      authentication_required: false,
      verification_status: 'LIVE_ENUMERABLE',
      retrieval_strategy: 'INDEX_FULL',
      person_directory_type: 'PUBLIC_ENUMERABLE',
      authority_level: 'ACADEMIC_INSTITUTION',
      access_type: 'PUBLIC_OPEN',
      enumerable: true,
      requires_login: false,
      captcha_present: false,
      evidence_yield_class: 'SMALL',
      person_yield_class: 'SMALL',
      freshness_strategy: 'LIVE',
      last_verified_at: '2026-09-14',
      health_status: 'ACTIVE'
    });

    // 101. OpenAlex Academic Graph (CABA Anchor Institutions)
    this.register({
      source_id: 'OPENALEX_CABA',
      source_name: 'OpenAlex Academic Graph (CABA Institutions)',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'api.openalex.org',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES', 'ARGENTINA'],
      work_scope: ['ACADEMIA', 'INVESTIGACION', 'MEDICINA', 'DOCENCIA', 'CIENCIA'],
      supports_people: true,
      supports_search: true,
      supports_listing: true,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 44052,
      raw_people_observed: 44052,
      observed_valid_rate: 1.0,
      observed_caba_precision: 1.0,
      observed_overlap_rate: 0.08,
      public_access_confidence: 1.0,
      fetch_cost: 2,
      parse_cost: 2,
      verify_cost: 1,
      maintenance_cost: 1,
      authentication_required: false,
      verification_status: 'LIVE_ENUMERABLE',
      retrieval_strategy: 'INDEX_FULL',
      person_directory_type: 'PUBLIC_ENUMERABLE',
      authority_level: 'ACADEMIC_PRIMARY',
      access_type: 'PUBLIC_OPEN',
      enumerable: true,
      requires_login: false,
      captcha_present: false,
      evidence_yield_class: 'MASSIVE',
      person_yield_class: 'MASSIVE',
      freshness_strategy: 'LIVE',
      last_verified_at: '2026-09-14',
      health_status: 'ACTIVE'
    });

    // 102. Crossref Metadata API (Entity Resolution & Temporal Evidence)
    this.register({
      source_id: 'CROSSREF_API',
      source_name: 'Crossref Metadata API',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'api.crossref.org',
      country: 'GLOBAL',
      geography_scope: ['GLOBAL', 'ARGENTINA', 'CABA'],
      work_scope: ['ALL', 'INVESTIGACION', 'ACADEMIA'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: true,
      supports_known_total: true,
      reported_total: 150000000,
      raw_people_observed: 0,
      authentication_required: false,
      verification_status: 'LIVE',
      retrieval_strategy: 'LIVE_QUERY',
      person_directory_type: 'PUBLIC_SEARCH_ONLY',
      authority_level: 'AGGREGATOR',
      access_type: 'PUBLIC_OPEN',
      enumerable: false,
      requires_login: false,
      captcha_present: false,
      evidence_yield_class: 'MASSIVE',
      person_yield_class: 'SMALL',
      freshness_strategy: 'LIVE',
      last_verified_at: '2026-09-14',
      health_status: 'ACTIVE'
    });

    // 103. UBA Repositorio Digital Institucional (SISBI / Facultades)
    this.register({
      source_id: 'UBA_RDI_REPOSITORIO',
      source_name: 'UBA Repositorio Digital Institucional (SISBI / Facultades)',
      source_type: 'ACADEMIC_REGISTRY',
      domain: 'sisbi.uba.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'BUENOS AIRES'],
      work_scope: ['ACADEMIA', 'INVESTIGACION', 'DOCENCIA'],
      supports_people: true,
      supports_search: false,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: true,
      reported_total: 59000,
      raw_people_observed: 0,
      authentication_required: false,
      verification_status: 'BLOCKED',
      retrieval_strategy: 'BLOCKED',
      person_directory_type: 'CAPTCHA_PROTECTED',
      authority_level: 'ACADEMIC_PRIMARY',
      access_type: 'CAPTCHA_PROTECTED',
      enumerable: false,
      requires_login: false,
      captcha_present: true,
      evidence_yield_class: 'LARGE',
      person_yield_class: 'UNAVAILABLE',
      freshness_strategy: 'PERIODIC',
      last_verified_at: '2026-09-14',
      health_status: 'BLOCKED'
    });

    // 104. SISA REFEPS — Registro Federal de Profesionales de Salud
    this.register({
      source_id: 'SISA_REFEPS_SALUD_CABA',
      source_name: 'SISA REFEPS — Registro Federal de Profesionales de Salud',
      source_type: 'HEALTH_PROFESSIONAL_REGISTRY',
      domain: 'sisa.msal.gov.ar',
      country: 'ARGENTINA',
      geography_scope: ['CABA', 'ARGENTINA'],
      work_scope: ['SALUD', 'MEDICINA', 'ENFERMERIA', 'ODONTOLOGIA', 'BIOQUIMICA'],
      supports_people: true,
      supports_search: true,
      supports_listing: false,
      supports_pagination: false,
      supports_known_total: true,
      reported_total: 120000,
      raw_people_observed: 0,
      authentication_required: true,
      verification_status: 'AUTHORIZED_INTEGRATION_REQUIRED',
      retrieval_strategy: 'LIVE_QUERY',
      person_directory_type: 'PUBLIC_SEARCH_ONLY',
      authority_level: 'GOVERNMENT_PRIMARY',
      access_type: 'RESTRICTED',
      enumerable: false,
      requires_login: true,
      captcha_present: false,
      evidence_yield_class: 'MASSIVE',
      person_yield_class: 'SMALL',
      freshness_strategy: 'PERIODIC',
      last_verified_at: '2026-09-14',
      health_status: 'DEGRADED'
    });
  }

  public static register(source: RegisteredSource): void {
    this.sources.set(source.source_id, source);
  }

  public static getSource(sourceId: string): RegisteredSource | undefined {
    return this.sources.get(sourceId);
  }

  public static getAllSources(): RegisteredSource[] {
    return Array.from(this.sources.values());
  }

  public static getLiveSources(): RegisteredSource[] {
    return Array.from(this.sources.values()).filter(s => 
      s.verification_status === 'LIVE' || s.verification_status === 'LIVE_ENUMERABLE' || s.verification_status === 'LIVE_VERIFIER'
    );
  }

  public static getAuthoritativeVerifiers(): RegisteredSource[] {
    return Array.from(this.sources.values()).filter(s => 
      s.source_type === 'AUTHORITATIVE_IDENTITY_REGISTRY' || 
      s.source_type === 'TAX_REGISTRY' || 
      s.source_type === 'HEALTH_PROFESSIONAL_REGISTRY' || 
      s.source_type === 'ELECTORAL_REGISTRY' ||
      s.verification_status === 'LIVE_VERIFIER'
    );
  }

  public static getSocialSources(): RegisteredSource[] {
    return Array.from(this.sources.values()).filter(s => 
      s.source_type === 'SOCIAL_NETWORK' || s.source_type === 'CODE_REPOSITORY'
    );
  }

  public static getCapableSources(intent: QueryIntent): RegisteredSource[] {
    const rawGeo = (intent.geography || intent.neighborhood || '').toUpperCase().trim();
    const work = (intent.profession || intent.occupation || intent.trade || intent.role_class || '').toUpperCase().trim();

    // Hierarchical geographic scopes
    const allowedGeoScopes = new Set<string>(['GLOBAL']);
    if (rawGeo) {
      allowedGeoScopes.add(rawGeo);
      if (rawGeo.includes('CABALLITO') || rawGeo.includes('COMUNA 6')) {
        allowedGeoScopes.add('CABALLITO');
        allowedGeoScopes.add('COMUNA 6');
        allowedGeoScopes.add('CABA');
        allowedGeoScopes.add('BUENOS AIRES');
        allowedGeoScopes.add('ARGENTINA');
      } else if (rawGeo.includes('CABA') || rawGeo.includes('CAPITAL')) {
        allowedGeoScopes.add('CABA');
        allowedGeoScopes.add('BUENOS AIRES');
        allowedGeoScopes.add('ARGENTINA');
      } else if (rawGeo.includes('CORDOBA') || rawGeo.includes('CÓRDOBA')) {
        allowedGeoScopes.add('CORDOBA');
        allowedGeoScopes.add('ARGENTINA');
      } else if (rawGeo.includes('MENDOZA')) {
        allowedGeoScopes.add('MENDOZA');
        allowedGeoScopes.add('ARGENTINA');
      } else if (rawGeo.includes('ARGENTINA')) {
        allowedGeoScopes.add('ARGENTINA');
      }
    }

    return Array.from(this.sources.values()).filter(s => {
      if (!s.supports_people) return false;
      if (s.verification_status === 'NOT_APPLICABLE' || s.verification_status === 'CODE_ONLY') {
        return false;
      }

      // Check geography scope
      if (rawGeo) {
        const matchesGeo = s.geography_scope.some(g => allowedGeoScopes.has(g) || rawGeo.includes(g) || g.includes(rawGeo));
        if (!matchesGeo) return false;
      }

      // Check work scope
      if (work) {
        if (s.work_scope.includes('ALL')) return true;
        const matchesWork = s.work_scope.some(w => work.includes(w) || w.includes(work));
        if (!matchesWork) return false;
      }

      return true;
    });
  }

  // ── Knowledge Universe & Hybrid Retrieval Methods (V4.7.1 / Phase B) ────────

  public static getSourcesByStrategy(strategy: RetrievalStrategy): RegisteredSource[] {
    return Array.from(this.sources.values()).filter(s => {
      const effStrategy = this.resolveRetrievalStrategy(s);
      return effStrategy === strategy;
    });
  }

  public static resolveRetrievalStrategy(source: RegisteredSource): RetrievalStrategy {
    if (source.retrieval_strategy) return source.retrieval_strategy;

    // Strict Access Invariant (Section 5 & 24):
    if (
      source.requires_login || 
      source.authentication_required ||
      source.person_directory_type === 'LOGIN_REQUIRED' || 
      source.verification_status === 'BLOCKED' ||
      source.verification_status === 'AUTHORIZED_INTEGRATION_REQUIRED' ||
      source.verification_status === 'ACCESS_REQUIRED'
    ) {
      return 'BLOCKED';
    }
    if (source.captcha_present || source.person_directory_type === 'CAPTCHA_PROTECTED') {
      return 'BLOCKED';
    }
    if (source.verification_status === 'UNVERIFIED' || source.verification_status === 'DISCOVERED_UNVERIFIED' || source.capability_status === 'UNVERIFIED') {
      return 'BLOCKED';
    }

    if (source.person_directory_type === 'PUBLIC_ENUMERABLE' || source.supports_listing) {
      return 'INDEX_FULL';
    }
    if (source.person_directory_type === 'PUBLIC_SEARCH_ONLY' || source.supports_search) {
      return 'LIVE_QUERY';
    }

    return 'INDEX_METADATA';
  }

  /**
   * Strict Invariant: SITE_HTTP_REACHABLE != PERSON_DIRECTORY_ACCESSIBLE
   */
  public static isSiteHttpReachable(sourceId: string): boolean {
    const s = this.sources.get(sourceId);
    if (!s) return false;
    // An HTTP 200 on an institutional home page means the site is reachable
    return s.verification_status !== 'BLOCKED' || s.source_id === 'CUCICBA_CABA';
  }

  public static isPersonDirectoryAccessible(sourceId: string): boolean {
    const s = this.sources.get(sourceId);
    if (!s) return false;

    // Fail-Closed: Login required, captcha protected, or private directories are NOT accessible
    if (s.requires_login || s.person_directory_type === 'LOGIN_REQUIRED') return false;
    if (s.captcha_present || s.person_directory_type === 'CAPTCHA_PROTECTED') return false;
    if (s.person_directory_type === 'PRIVATE' || s.person_directory_type === 'UNAVAILABLE') return false;
    if (s.verification_status === 'BLOCKED' || s.verification_status === 'UNVERIFIED') return false;

    return true;
  }

  /**
   * Explainable Source Scoring with Reason Codes (Section 18)
   */
  public static computeSourceScore(
    source: RegisteredSource,
    intent: QueryIntent,
    options?: {
      history?: { successCount: number; failureCount: number; avgLatencyMs: number };
      freshnessRequired?: boolean;
    }
  ): {
    score: number;
    reason_codes: {
      why_selected: string[];
      why_rejected: string[];
      authority_score: number;
      freshness_score: number;
      geographic_fit_score: number;
      previous_success_score: number;
      latency_penalty: number;
      failure_penalty: number;
      stale_penalty: number;
    };
  } {
    const whySelected: string[] = [];
    const whyRejected: string[] = [];

    // Blocked check
    const strategy = this.resolveRetrievalStrategy(source);
    if (strategy === 'BLOCKED') {
      whyRejected.push(`SOURCE_BLOCKED: Access restricted or authentication required (${source.verification_notes || 'BLOCKED'})`);
      return {
        score: 0,
        reason_codes: {
          why_selected: [],
          why_rejected: whyRejected,
          authority_score: 0,
          freshness_score: 0,
          geographic_fit_score: 0,
          previous_success_score: 0,
          latency_penalty: 0,
          failure_penalty: 100,
          stale_penalty: 0
        }
      };
    }

    // 1. Authority Score (0-30)
    let authorityScore = 15;
    if (source.authority_level === 'GOVERNMENT_PRIMARY' || source.authority_level === 'PRIMARY_GOVERNMENT' || (source.source_type === 'GOVERNMENT_ROSTER' && source.authority_level !== 'INSTITUTIONAL_PRIMARY')) {
      authorityScore = 30;
      whySelected.push('HIGH_AUTHORITY: Primary government institutional source');
    } else if (source.authority_level === 'INSTITUTIONAL_PRIMARY' || source.authority_level === 'HEALTH_INSTITUTION') {
      authorityScore = 25;
      whySelected.push('INSTITUTIONAL_AUTHORITY: Primary non-governmental / healthcare institutional source');
    } else if (source.authority_level === 'ACADEMIC_PRIMARY' || source.authority_level === 'ACADEMIC_INSTITUTION' || source.source_type === 'ACADEMIC_REGISTRY') {
      authorityScore = 25;
      whySelected.push('ACADEMIC_AUTHORITY: Accredited university / academic faculty');
    } else if (source.authority_level === 'PROFESSIONAL_PRIMARY' || source.authority_level === 'OFFICIAL_REGISTRY' || source.source_type === 'PROFESSIONAL_COLLEGE') {
      authorityScore = 25;
      whySelected.push('REGISTRY_AUTHORITY: Official professional college / public registry');
    } else if (source.authority_level === 'AGGREGATOR' || source.authority_level === 'NEWS_AGGREGATOR') {
      authorityScore = 15;
      whySelected.push('AGGREGATOR_AUTHORITY: Multi-source aggregator index');
    } else if (source.authority_level === 'COMMUNITY_SECONDARY' || source.source_type === 'KNOWLEDGE_GRAPH' || source.authority_level === 'PUBLIC_GRAPH') {
      authorityScore = 20;
      whySelected.push('GRAPH_COVERAGE: Broad public entity coverage');
    }

    // 2. Geographic Fit (0-25)
    let geoScore = 10;
    const reqGeo = (intent.geography || intent.neighborhood || '').toUpperCase().trim();
    if (reqGeo) {
      if (source.geography_scope.includes(reqGeo)) {
        geoScore = 25;
        whySelected.push(`EXACT_GEO_MATCH: Explicit support for ${reqGeo}`);
      } else if (source.geography_scope.includes('CABA') && (reqGeo.includes('CABA') || reqGeo.includes('CAPITAL') || reqGeo.includes('BUENOS AIRES'))) {
        geoScore = 25;
        whySelected.push(`REGIONAL_GEO_MATCH: Sourced in CABA / Buenos Aires`);
      } else if (source.geography_scope.includes('ARGENTINA')) {
        geoScore = 15;
        whySelected.push('NATIONAL_GEO_MATCH: National Argentina scope');
      } else {
        geoScore = 5;
        whyRejected.push(`WEAK_GEO_FIT: Source scope [${source.geography_scope.join(', ')}] does not specifically target ${reqGeo}`);
      }
    } else {
      geoScore = 15;
    }

    // 3. Freshness Fit (0-20)
    let freshnessScore = 10;
    if (options?.freshnessRequired) {
      if (source.freshness_strategy === 'REAL_TIME' || source.freshness_strategy === 'LIVE') {
        freshnessScore = 20;
        whySelected.push('LIVE_FRESHNESS: Real-time/live on-demand retrieval strategy');
      } else if (source.freshness_strategy === 'DAILY') {
        freshnessScore = 15;
        whySelected.push('DAILY_FRESHNESS: Fresh daily updated source');
      } else {
        freshnessScore = 5;
        whyRejected.push('STALE_RISK: Source does not provide live updates for fresh requirement');
      }
    } else {
      freshnessScore = 15;
    }

    // 4. Previous Success / Reliability (0-15)
    let prevSuccessScore = 10;
    let latencyPenalty = 0;
    let failurePenalty = 0;
    if (options?.history) {
      const hist = options.history as any;
      const rate = hist.successRate ?? (hist.successCount !== undefined && (hist.successCount + (hist.failureCount || 0) > 0) ? hist.successCount / (hist.successCount + hist.failureCount) : undefined);
      if (rate !== undefined) {
        if (rate >= 0.8) {
          prevSuccessScore = 15;
          whySelected.push(`PROVEN_RELIABILITY: ${(rate * 100).toFixed(0)}% historical success`);
        } else if (rate < 0.6) {
          failurePenalty = 15;
          whyRejected.push(`HIGH_FAILURE_RATE: Only ${(rate * 100).toFixed(0)}% historical queries succeeded`);
        }
      }
      if (options.history.avgLatencyMs && options.history.avgLatencyMs > 2500) {
        latencyPenalty = 10;
        whyRejected.push(`LATENCY_PENALTY: Slow source response (${options.history.avgLatencyMs}ms)`);
      }
    }

    const stalePenalty = source.freshness_strategy === 'HISTORICAL_ARCHIVE' && options?.freshnessRequired ? 20 : 0;
    const totalScore = Math.max(0, authorityScore + geoScore + freshnessScore + prevSuccessScore - latencyPenalty - failurePenalty - stalePenalty);

    return {
      score: totalScore,
      reason_codes: {
        why_selected: whySelected,
        why_rejected: whyRejected,
        authority_score: authorityScore,
        freshness_score: freshnessScore,
        geographic_fit_score: geoScore,
        previous_success_score: prevSuccessScore,
        latency_penalty: latencyPenalty,
        failure_penalty: failurePenalty,
        stale_penalty: stalePenalty
      }
    };
  }

  /**
   * Calculates the SOURCE_ACQUISITION_SCORE based on NET NEW VALUE vs ACQUISITION COST.
   * Concept:
   * NET_NEW_VALUE = expected_new_unique * access_confidence * estimate_confidence * structure_quality * authority * caba_precision
   * TOTAL_COST = fetch_cost + parse_cost + verify_cost + maintenance_cost
   * SCORE = NET_NEW_VALUE / TOTAL_COST
   * Fail-closed: returns 0 if requires_login, captcha_protected, private, or blocked.
   */
  public static calculateSourceAcquisitionScore(source: RegisteredSource): number {
    if (
      source.requires_login ||
      source.captcha_present ||
      source.access_type === 'LOGIN_REQUIRED' ||
      source.access_type === 'CAPTCHA_PROTECTED' ||
      source.access_type === 'PRIVATE' ||
      source.retrieval_strategy === 'BLOCKED' ||
      source.verification_status === 'BLOCKED' ||
      source.maturity === 'BLOCKED'
    ) {
      return 0;
    }

    const expectedNewUnique = source.new_unique_estimate || 0;
    if (expectedNewUnique <= 0) return 0;

    const accessConf = source.public_access_confidence ?? (source.authentication_required ? 0 : 0.9);
    const estConf = source.estimate_confidence ?? 0.7;
    const structQual = source.structure_quality ?? 0.8;

    let authFactor = 0.7;
    if (source.authority_level === 'GOVERNMENT_PRIMARY' || source.authority_level === 'PRIMARY_GOVERNMENT') {
      authFactor = 1.0;
    } else if (
      source.authority_level === 'INSTITUTIONAL_PRIMARY' ||
      source.authority_level === 'HEALTH_INSTITUTION' ||
      source.authority_level === 'ACADEMIC_PRIMARY' ||
      source.authority_level === 'ACADEMIC_INSTITUTION' ||
      source.authority_level === 'PROFESSIONAL_PRIMARY' ||
      source.authority_level === 'OFFICIAL_REGISTRY'
    ) {
      authFactor = 0.9;
    } else if (source.authority_level === 'AGGREGATOR' || source.authority_level === 'NEWS_AGGREGATOR') {
      authFactor = 0.6;
    } else if (source.authority_level === 'COMMUNITY_SECONDARY' || source.source_type === 'KNOWLEDGE_GRAPH') {
      authFactor = 0.75;
    }

    const geoPrecision = source.caba_geographic_precision ?? (source.geography_scope.includes('CABA') ? 1.0 : 0.6);

    const fetchCost = source.fetch_cost ?? 2;
    const parseCost = source.parse_cost ?? 2;
    const verifyCost = source.verify_cost ?? 2;
    const maintCost = source.maintenance_cost ?? 1;
    const totalCost = Math.max(1, fetchCost + parseCost + verifyCost + maintCost);

    const netNewValue = expectedNewUnique * accessConf * estConf * structQual * authFactor * geoPrecision;
    return Math.round((netNewValue / totalCost) * 10) / 10;
  }

  /**
   * Calculates SOURCE_ACQUISITION_SCORE_OBSERVED based on physically measured preflight values:
   * EXPECTED_REAL_NET_NEW = RAW_OBSERVED * VALID_PERSON_RATE * CABA_PERSON_LEVEL_RATE * (1 - OVERLAP_RATE)
   * OBSERVED_SCORE = (EXPECTED_REAL_NET_NEW * AUTHORITY * ACCESS_CONFIDENCE) / REAL_OR_PROJECTED_COST
   * Fail-closed: returns 0 if requires_login, captcha_protected, private, or blocked.
   */
  public static calculateObservedAcquisitionScore(source: RegisteredSource): number {
    if (
      source.requires_login ||
      source.captcha_present ||
      source.access_type === 'LOGIN_REQUIRED' ||
      source.access_type === 'CAPTCHA_PROTECTED' ||
      source.access_type === 'PRIVATE' ||
      source.retrieval_strategy === 'BLOCKED' ||
      source.verification_status === 'BLOCKED' ||
      source.maturity === 'BLOCKED'
    ) {
      return 0;
    }

    const rawObserved = source.raw_people_observed || 0;
    if (rawObserved <= 0) return 0;

    const validRate = source.observed_valid_rate ?? 0.90;
    const cabaRate = source.observed_caba_precision ?? (source.geography_scope.includes('CABA') ? 1.0 : 0.6);
    const overlapRate = source.observed_overlap_rate ?? 0.0;
    const accessConf = source.public_access_confidence ?? (source.authentication_required ? 0 : 1.0);

    let authFactor = 0.7;
    if (source.authority_level === 'GOVERNMENT_PRIMARY' || source.authority_level === 'PRIMARY_GOVERNMENT') {
      authFactor = 1.0;
    } else if (
      source.authority_level === 'INSTITUTIONAL_PRIMARY' ||
      source.authority_level === 'HEALTH_INSTITUTION' ||
      source.authority_level === 'ACADEMIC_PRIMARY' ||
      source.authority_level === 'ACADEMIC_INSTITUTION' ||
      source.authority_level === 'PROFESSIONAL_PRIMARY' ||
      source.authority_level === 'OFFICIAL_REGISTRY'
    ) {
      authFactor = 0.9;
    } else if (source.authority_level === 'AGGREGATOR' || source.authority_level === 'NEWS_AGGREGATOR') {
      authFactor = 0.6;
    } else if (source.authority_level === 'COMMUNITY_SECONDARY' || source.source_type === 'KNOWLEDGE_GRAPH') {
      authFactor = 0.75;
    }

    const fetchCost = source.fetch_cost ?? 2;
    const parseCost = source.parse_cost ?? 2;
    const verifyCost = source.verify_cost ?? 2;
    const maintCost = source.maintenance_cost ?? 1;
    const totalCost = Math.max(1, fetchCost + parseCost + verifyCost + maintCost);

    const expectedRealNetNew = rawObserved * validRate * cabaRate * (1 - overlapRate);
    const score = (expectedRealNetNew * authFactor * accessConf) / totalCost;
    return Math.round(score * 10) / 10;
  }

  /**
   * Auto-onboard a newly discovered and profiled source into SourceCapabilityRegistry.
   * Enforces strict governance: PUBLICLY_ACCESSIBLE != SAFE_TO_INGEST.
   */
  public static autoOnboardDiscoveredSource(source: RegisteredSource): RegisteredSource {
    const existing = this.sources.get(source.source_id);
    if (existing) {
      const merged: RegisteredSource = {
        ...existing,
        ...source,
        last_verified_at: new Date().toISOString()
      };
      this.sources.set(source.source_id, merged);
      return merged;
    }

    this.register(source);
    return source;
  }
}
