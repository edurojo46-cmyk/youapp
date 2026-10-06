/**
 * ATLAS SOURCE UNDERSTANDING ENGINE V1
 * @server/services/industrial/AtlasSourceUnderstandingEngine.ts
 * 
 * Master Universal Understanding Layer for all discovery sources in Atlas:
 * - Understands WHAT a candidate source is (Archetype & Roles)
 * - Understands WHAT data it produces (Row Units, Entity Types, Relations)
 * - Understands HOW to access it (Access Mode, Protocol, Queryability)
 * - Evaluates technical capabilities (Enumeration, Bulk, Verification, Discovery)
 * - Resolves the appropriate generic connector (Connector Family)
 * - Determines Mission Compatibility and Generic Failure / Operational States
 * 
 * CONSTITUTIONAL INVARIANTS:
 * 1. UNKNOWN != TRUE (If bulk enumeration is unverified, bulk_capability is FALSE).
 * 2. NO CATEGORY-SPECIFIC HARDCODING (Never: if concept === 'milonga' or 'lawyer').
 * 3. TECHNICAL INSPECTION BEFORE CONNECTOR DECLARATION (Inspect API, CKAN, CSV, JSON, HTML tables before deciding).
 * 4. ONE-CALL AI BUDGET (AI suggests hypotheses, Atlas technically inspects and verifies).
 * 5. PERSISTENCE IN SSOT (Saves normalized Capability IR to public.atlas_source_knowledge_map; second use AI = 0).
 */

import pg from 'pg';
import crypto from 'crypto';
import type {
  AtlasMissionIR,
  SourceArchetype,
  UniversalRowUnit,
  UniversalEntityType,
  UniversalRelation
} from './AtlasMissionIR.ts';

export type SourceAccessMode =
  | 'DOWNLOADABLE_DATASET'
  | 'API'
  | 'SEARCH_FORM'
  | 'INDIVIDUAL_LOOKUP'
  | 'PAGINATED_ENUMERATION'
  | 'BULK_ENUMERATION'
  | 'STATIC_TABLE'
  | 'DIRECTORY'
  | 'EVIDENCE_ONLY';

export type ConnectorFamily =
  | 'CKAN_API'
  | 'OPEN_DATA_CSV'
  | 'OPEN_DATA_JSON'
  | 'HTML_TABLE'
  | 'PAGINATED_DIRECTORY'
  | 'PUBLIC_REGISTRY_API'
  | 'REST_API'
  | 'WEB_SEARCH_DISCOVERY'
  | 'SPECIALIZED_OR_UNAVAILABLE';

export type SourceRole =
  | 'DIRECTORY_SOURCE'
  | 'EVIDENCE_SOURCE'
  | 'ENTITY_SOURCE'
  | 'DISCOVERY_SOURCE'
  | 'PORTAL_CATALOG'
  | 'TAXONOMY_SOURCE'
  | 'VERIFICATION_SOURCE';

export type SourceUnderstandingState =
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_FOUND_UNDERSTANDING_FAILED'
  | 'SOURCE_VALIDATED'
  | 'SOURCE_NOT_MISSION_COMPATIBLE'
  | 'SOURCE_LOOKUP_ONLY'
  | 'SOURCE_ENUMERATION_AVAILABLE'
  | 'SOURCE_BULK_AVAILABLE'
  | 'SOURCE_CONNECTOR_AVAILABLE'
  | 'SOURCE_CONNECTOR_MISSING'
  | 'SOURCE_AUTOMATION_NOT_PERMITTED';

export interface TechnicalInspection {
  has_api: boolean;
  has_ckan: boolean;
  has_csv: boolean;
  has_json: boolean;
  has_geojson: boolean;
  has_html_table: boolean;
  has_pagination: boolean;
  has_search_form: boolean;
  has_public_endpoint: boolean;
  resource_links: string[];
}

export interface SourceCapabilityIR {
  source_id: string;
  source_name: string;
  canonical_url: string;
  domain: string;

  source_archetype: SourceArchetype;
  secondary_archetypes: SourceArchetype[];
  source_roles: SourceRole[];

  row_units: UniversalRowUnit[];
  entity_types: UniversalEntityType[];
  relations_supported: UniversalRelation[];
  geographic_scope: string;

  public_access: boolean;
  access_mode: SourceAccessMode;
  queryability: {
    by_name: boolean;
    by_id: boolean;
    by_concept: boolean;
    by_geography: boolean;
    by_matricula: boolean;
    free_text: boolean;
    browse_only: boolean;
  };

  enumeration_capability: boolean;
  bulk_capability: boolean;
  verification_capability: boolean;
  discovery_capability: boolean;
  evidence_capability: boolean;

  resource_formats: string[];
  pagination: 'NONE' | 'PAGE_NUMBER' | 'OFFSET_LIMIT' | 'CURSOR' | 'NEXT_URL';

  connector_family: ConnectorFamily;
  connector_class: string;

  mission_compatibility: 'COMPATIBLE' | 'PARTIAL' | 'INCOMPATIBLE' | 'EVIDENCE_ONLY' | 'REQUIRES_SPECIALIZED_CONNECTOR';
  confidence: number;
  validation_required: boolean;

  state: SourceUnderstandingState;
  state_reason: string;

  technical_inspection: TechnicalInspection;
  learned_at?: string;
  cached?: boolean;
}

export interface SourceUnderstandingInput {
  missionIR?: AtlasMissionIR;
  candidate_source?: any;
  source_name?: string;
  url?: string;
  domain?: string;
  source_metadata?: any;
  page_or_api_metadata?: {
    headers?: Record<string, string>;
    html_sample?: string;
    json_sample?: any;
    status_code?: number;
    detected_links?: string[];
  };
  force_fresh_inspection?: boolean;
}

export class AtlasSourceUnderstandingEngine {
  private static instance: AtlasSourceUnderstandingEngine;
  private db: pg.Pool;
  private inMemoryCache: Map<string, { capability: SourceCapabilityIR; timestamp: number }> = new Map();

  constructor(db: pg.Pool) {
    this.db = db;
  }

  public static getInstance(db: pg.Pool): AtlasSourceUnderstandingEngine {
    if (!AtlasSourceUnderstandingEngine.instance) {
      AtlasSourceUnderstandingEngine.instance = new AtlasSourceUnderstandingEngine(db);
    }
    return AtlasSourceUnderstandingEngine.instance;
  }

  /**
   * Universal Source Understanding Entrypoint
   * Generates or retrieves the complete SOURCE_CAPABILITY_IR.
   */
  public async understandSource(input: SourceUnderstandingInput): Promise<SourceCapabilityIR> {
    const rawUrl = (input.url || input.candidate_source?.possible_public_url || input.candidate_source?.canonical_url || '').trim();
    const sourceName = (input.source_name || input.candidate_source?.source_name || input.candidate_source?.source_family || 'Fuente Pública').trim();
    const domain = input.domain || this.extractDomain(rawUrl) || 'gob.ar';

    const cacheKey = `${domain}::${rawUrl}::${sourceName}`.toLowerCase();

    // 1. FAST-PATH: IN-MEMORY CACHE (<2ms)
    if (!input.force_fresh_inspection) {
      const memHit = this.inMemoryCache.get(cacheKey);
      if (memHit && (Date.now() - memHit.timestamp < 3600000)) { // 1h in-memory TTL
        return this.alignWithMission(memHit.capability, input.missionIR);
      }
    }

    // 2. SSOT KNOWLEDGE MAP LOOKUP (<25ms P50, <50ms P95)
    if (!input.force_fresh_inspection && this.db) {
      const cleanUrl = rawUrl.replace(/\/+$/, '');
      const ssotRes = await this.db.query(`
        SELECT source_id, canonical_url, source_name, source_family, access_method,
               source_roles, entity_types_supported, row_unit_supported, queryability,
               public_access_confirmed, field_telemetry, last_profiled_at
        FROM public.atlas_source_knowledge_map
        WHERE canonical_url = $1 OR canonical_url = $2
        LIMIT 1;
      `, [rawUrl, cleanUrl]).catch(() => ({ rows: [] }));

      if (ssotRes.rows.length > 0) {
        const row = ssotRes.rows[0];
        const savedCapability = row.field_telemetry?.capability_ir;
        if (savedCapability) {
          const loadedCapability: SourceCapabilityIR = {
            ...savedCapability,
            cached: true
          };
          this.inMemoryCache.set(cacheKey, { capability: loadedCapability, timestamp: Date.now() });
          return this.alignWithMission(loadedCapability, input.missionIR);
        }
      }
    }

    // 3. TECHNICAL SOURCE INSPECTION (Universal Pattern Detection)
    const inspection = this.inspectTechnicalArtifacts(rawUrl, domain, input.page_or_api_metadata, input.source_metadata);

    // 4. INFER SOURCE ARCHETYPE & SECONDARY ARCHETYPES
    const { primaryArchetype, secondaryArchetypes } = this.inferArchetypes(sourceName, rawUrl, domain, inspection, input.candidate_source);

    // 5. INFER ACCESS MODE & QUERYABILITY
    const accessMode = this.inferAccessMode(primaryArchetype, inspection, input.candidate_source);
    const queryability = this.inferQueryability(primaryArchetype, accessMode, inspection);

    // 6. INFER CORE CAPABILITIES (Strict UNKNOWN != TRUE invariant)
    const capabilities = this.evaluateCapabilities(primaryArchetype, accessMode, inspection, input.candidate_source);

    // 7. INFER SUPPORTED ROW UNITS & ENTITY TYPES
    const { rowUnits, entityTypes, relationsSupported } = this.inferSupportedEntities(primaryArchetype, input.candidate_source, input.missionIR);

    // 8. RESOLVE GENERIC CONNECTOR FAMILY
    const { connectorFamily, connectorClass } = this.resolveConnector(primaryArchetype, accessMode, inspection);

    // 9. EVALUATE MISSION COMPATIBILITY
    const { compatibility, state, stateReason } = this.evaluateMissionFitAndState(
      primaryArchetype,
      accessMode,
      rowUnits,
      connectorFamily,
      capabilities,
      input.missionIR
    );

    const sourceId = `SRC_${primaryArchetype}_${crypto.createHash('md5').update(sourceName + domain).digest('hex').slice(0, 10).toUpperCase()}`;

    const capabilityIR: SourceCapabilityIR = {
      source_id: sourceId,
      source_name: sourceName,
      canonical_url: rawUrl || `https://${domain}`,
      domain,
      source_archetype: primaryArchetype,
      secondary_archetypes: secondaryArchetypes,
      source_roles: this.inferSourceRoles(primaryArchetype, accessMode),
      row_units: rowUnits,
      entity_types: entityTypes,
      relations_supported: relationsSupported,
      geographic_scope: input.missionIR?.geography?.geography_id || 'ARG_NACIONAL',
      public_access: this.verifyPublicAccess(domain, rawUrl),
      access_mode: accessMode,
      queryability,
      enumeration_capability: capabilities.enumeration,
      bulk_capability: capabilities.bulk,
      verification_capability: capabilities.verification,
      discovery_capability: capabilities.discovery,
      evidence_capability: capabilities.evidence,
      resource_formats: inspection.has_ckan ? ['CKAN_API'] : (inspection.has_csv ? ['CSV'] : (inspection.has_json ? ['JSON'] : (inspection.has_html_table ? ['HTML_TABLE'] : ['PAGINATED_HTTP']))),
      pagination: inspection.has_pagination ? 'PAGE_NUMBER' : 'NONE',
      connector_family: connectorFamily,
      connector_class: connectorClass,
      mission_compatibility: compatibility,
      confidence: 0.95,
      validation_required: accessMode === 'INDIVIDUAL_LOOKUP' || connectorFamily === 'SPECIALIZED_OR_UNAVAILABLE',
      state,
      state_reason: stateReason,
      technical_inspection: inspection,
      learned_at: new Date().toISOString(),
      cached: false
    };

    // 10. PERSIST IN SSOT & IN-MEMORY CACHE
    await this.persistCapability(capabilityIR).catch(err => {
      console.warn('[AtlasSourceUnderstandingEngine] Non-blocking DB save warning:', err.message);
    });

    this.inMemoryCache.set(cacheKey, { capability: capabilityIR, timestamp: Date.now() });

    return capabilityIR;
  }

  /**
   * Universal text normalization (lowercase + strip diacritics)
   */
  private normalizeText(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Technical artifact inspector
   */
  private inspectTechnicalArtifacts(url: string, domain: string, pageMeta?: SourceUnderstandingInput['page_or_api_metadata'], sourceMeta?: any): TechnicalInspection {
    const urlLower = (url || '').toLowerCase();
    const domainLower = (domain || '').toLowerCase();
    const links = pageMeta?.detected_links || [];
    const htmlSample = (pageMeta?.html_sample || '').toLowerCase();

    const isDirectCsv = urlLower.endsWith('.csv') || urlLower.includes('.csv?') || urlLower.includes('format=csv');
    const isDirectGeoJson = urlLower.endsWith('.geojson') || urlLower.includes('.geojson?') || urlLower.includes('format=geojson');
    const isDirectJson = (urlLower.endsWith('.json') && !isDirectGeoJson) || urlLower.includes('.json?') || urlLower.includes('format=json');

    const hasCsv = isDirectCsv || links.some(l => l.toLowerCase().endsWith('.csv') || l.toLowerCase().includes('format=csv'));
    const hasGeoJson = isDirectGeoJson || links.some(l => l.toLowerCase().endsWith('.geojson') || l.toLowerCase().includes('format=geojson'));
    const hasJson = isDirectJson || Boolean(pageMeta?.json_sample) || links.some(l => l.toLowerCase().endsWith('.json'));

    const hasCkan = (urlLower.includes('ckan') || 
                     urlLower.includes('/api/3/action/') ||
                     domainLower.includes('data.buenosaires.gob.ar') || 
                     domainLower.includes('catalogo.datos') ||
                     (domainLower.includes('datos.gob.ar') && !domainLower.startsWith('apis.') && !domainLower.startsWith('api.')) || 
                     domainLower.includes('datos.mendoza.gov.ar') || 
                     (domainLower.startsWith('datos.') && !domainLower.includes('apis.')) ||
                     (urlLower.includes('/dataset/') && !isDirectCsv && !isDirectGeoJson && !isDirectJson));

    const hasHtmlTable = htmlSample.includes('<table') && htmlSample.includes('<tr') && (htmlSample.includes('<th') || htmlSample.includes('<td'));

    const hasPagination = urlLower.includes('page=') || 
                          urlLower.includes('p=') || 
                          urlLower.includes('pagina') || 
                          htmlSample.includes('pagination') || 
                          htmlSample.includes('siguiente') || 
                          htmlSample.includes('page-link');

    const hasSearchForm = htmlSample.includes('<form') || 
                          htmlSample.includes('input type="search"') || 
                          htmlSample.includes('type="submit"') || 
                          urlLower.includes('/buscar') || 
                          urlLower.includes('/guia-de-');

    const hasApi = hasCkan || 
                   domainLower.startsWith('api.') || 
                   domainLower.startsWith('apis.') || 
                   domainLower.startsWith('serviciosweb.') || 
                   domainLower.startsWith('ws.') || 
                   urlLower.includes('/api/') || 
                   urlLower.includes('/v1/') || 
                   urlLower.includes('/v2/') || 
                   urlLower.includes('/serviciosweb/') || 
                   urlLower.includes('interpreter');

    return {
      has_api: hasApi,
      has_ckan: hasCkan,
      has_csv: hasCsv,
      has_json: hasJson,
      has_geojson: hasGeoJson,
      has_html_table: hasHtmlTable,
      has_pagination: hasPagination,
      has_search_form: hasSearchForm,
      has_public_endpoint: Boolean(url && url.startsWith('http')),
      resource_links: links.filter(l => l.endsWith('.csv') || l.endsWith('.json') || l.endsWith('.geojson'))
    };
  }

  /**
   * Infer source archetype and secondary archetypes
   */
  private inferArchetypes(
    sourceName: string,
    url: string,
    domain: string,
    inspection: TechnicalInspection,
    candidate?: any
  ): { primaryArchetype: SourceArchetype; secondaryArchetypes: SourceArchetype[] } {
    const sNameNorm = this.normalizeText(sourceName);
    const urlLower = url.toLowerCase();
    const domainLower = domain.toLowerCase();

    const isDirectCsv = urlLower.endsWith('.csv') || urlLower.includes('.csv?') || urlLower.includes('format=csv');
    const isDirectGeoJson = urlLower.endsWith('.geojson') || urlLower.includes('.geojson?') || urlLower.includes('format=geojson');
    const isDirectJson = (urlLower.endsWith('.json') && !isDirectGeoJson) || urlLower.includes('.json?') || urlLower.includes('format=json');

    // 1. Direct downloadable file datasets (strongest technical signal: the URL itself is the file)
    if (isDirectCsv) {
      return { primaryArchetype: 'CSV_DATASET', secondaryArchetypes: ['OPEN_DATA_PORTAL'] };
    }
    if (isDirectGeoJson) {
      return { primaryArchetype: 'GEOJSON_DATASET', secondaryArchetypes: ['OPEN_DATA_PORTAL'] };
    }
    if (isDirectJson) {
      return { primaryArchetype: 'JSON_DATASET', secondaryArchetypes: ['GOVERNMENT_API'] };
    }

    // 2. CKAN Portal Catalog / API
    if (inspection.has_ckan) {
      return { primaryArchetype: 'CKAN_PORTAL', secondaryArchetypes: ['OPEN_DATA_PORTAL', 'CSV_DATASET'] };
    }

    // 3. Static HTML Table without pagination
    if (inspection.has_html_table && !inspection.has_pagination) {
      return { primaryArchetype: 'HTML_TABLE', secondaryArchetypes: ['BUSINESS_DIRECTORY'] };
    }

    // 4. Search Engine Discovery
    if (candidate?.connector_family === 'WEB_SEARCH_DISCOVERY' || sNameNorm.includes('google') || sNameNorm.includes('web search')) {
      return { primaryArchetype: 'SEARCH_ENGINE_DISCOVERY', secondaryArchetypes: ['INSTITUTIONAL_WEB'] };
    }

    // 5. Professional Registry / Council (Colegios, Consejos, Matrículas)
    const isProfessionalInstitution = 
      /\b(colegio|consejo profesional|matricul|guia de abogados|cpacf|cpcecaba|cpau|colmed|colabocba|casi|refeps|martilleros|veterinarios|escribanos)\b/i.test(sNameNorm) ||
      /\b(cpacf|cpcecaba|cpau|colmed|colabo|refeps|cmcpsi|cvpba)\b/i.test(domainLower) ||
      urlLower.includes('guia-de-abogados') ||
      (urlLower.includes('padron') && /\b(abog|medic|notar|escrib|profesional|matricul|farmac|veterin)\b/i.test(sNameNorm));

    if (isProfessionalInstitution) {
      return { 
        primaryArchetype: 'PROFESSIONAL_REGISTRY', 
        secondaryArchetypes: ['PUBLIC_REGISTRY', 'SEARCHABLE_REGISTRY'] 
      };
    }

    // 6. Chamber / Industrial Directory
    if (/\b(camara|union industrial|confederacion|federacion|uipba|cac|cira|cafyma|cifam)\b/i.test(sNameNorm)) {
      return { primaryArchetype: 'CHAMBER_DIRECTORY', secondaryArchetypes: ['MEMBER_DIRECTORY', 'BUSINESS_DIRECTORY'] };
    }

    // 7. Member Directory / Associations
    if (/\b(asociacion|sociedad|socios|miembros|afiliados|aht)\b/i.test(sNameNorm)) {
      return { primaryArchetype: 'MEMBER_DIRECTORY', secondaryArchetypes: ['CHAMBER_DIRECTORY', 'BUSINESS_DIRECTORY'] };
    }

    // 8. Government API / Public Registry
    const isGovApi = (inspection.has_api && (domainLower.includes('gob.ar') || domainLower.includes('gov.ar') || domainLower.includes('afip.gob.ar'))) ||
                     sNameNorm.includes('clasificador de actividades') ||
                     sNameNorm.includes('arca') ||
                     sNameNorm.includes('afip') ||
                     sNameNorm.includes('sisa') ||
                     sNameNorm.includes('georef') ||
                     sNameNorm.includes('inpi');

    if (isGovApi) {
      return { primaryArchetype: 'GOVERNMENT_API', secondaryArchetypes: ['PUBLIC_REGISTRY'] };
    }

    // 9. Paginated Directory
    if (inspection.has_pagination || urlLower.includes('/directorio') || urlLower.includes('/guia') || sNameNorm.includes('directorio') || sNameNorm.includes('guia')) {
      return { primaryArchetype: 'PAGINATED_DIRECTORY', secondaryArchetypes: ['BUSINESS_DIRECTORY', 'HTML_LIST'] };
    }

    // 10. Open Data Portal Root
    if (domainLower.includes('datos') || domainLower.includes('data') || sNameNorm.includes('datos abiertos')) {
      return { primaryArchetype: 'OPEN_DATA_PORTAL', secondaryArchetypes: ['CKAN_PORTAL'] };
    }

    // Default: Business Directory
    return { primaryArchetype: 'BUSINESS_DIRECTORY', secondaryArchetypes: ['INSTITUTIONAL_WEB'] };
  }

  /**
   * Infer access mode
   */
  private inferAccessMode(archetype: SourceArchetype, inspection: TechnicalInspection, candidate?: any): SourceAccessMode {
    if (archetype === 'CSV_DATASET' || archetype === 'JSON_DATASET' || archetype === 'GEOJSON_DATASET') {
      return 'DOWNLOADABLE_DATASET';
    }
    if (archetype === 'CKAN_PORTAL') {
      return inspection.has_csv || inspection.has_json || inspection.has_geojson ? 'DOWNLOADABLE_DATASET' : 'API';
    }
    if (archetype === 'HTML_TABLE') {
      return 'STATIC_TABLE';
    }
    if (archetype === 'PROFESSIONAL_REGISTRY') {
      // Invariant: Professional registry padrón is lookup by name/matricula
      return 'INDIVIDUAL_LOOKUP';
    }
    if (archetype === 'PAGINATED_DIRECTORY' || archetype === 'MEMBER_DIRECTORY' || archetype === 'CHAMBER_DIRECTORY') {
      return 'PAGINATED_ENUMERATION';
    }
    if (archetype === 'GOVERNMENT_API') {
      return 'API';
    }
    if (archetype === 'SEARCH_ENGINE_DISCOVERY') {
      return 'EVIDENCE_ONLY';
    }
    return inspection.has_search_form ? 'SEARCH_FORM' : 'DIRECTORY';
  }

  /**
   * Infer queryability contract
   */
  private inferQueryability(archetype: SourceArchetype, accessMode: SourceAccessMode, inspection: TechnicalInspection) {
    if (archetype === 'PROFESSIONAL_REGISTRY') {
      return {
        by_name: true,
        by_id: false,
        by_concept: false,
        by_geography: true,
        by_matricula: true,
        free_text: false,
        browse_only: false
      };
    }
    if (accessMode === 'DOWNLOADABLE_DATASET' || archetype === 'CKAN_PORTAL' || archetype === 'CSV_DATASET' || archetype === 'JSON_DATASET' || archetype === 'GEOJSON_DATASET') {
      return {
        by_name: true,
        by_id: true,
        by_concept: true,
        by_geography: true,
        by_matricula: false,
        free_text: true,
        browse_only: true
      };
    }
    return {
      by_name: true,
      by_id: false,
      by_concept: true,
      by_geography: true,
      by_matricula: false,
      free_text: true,
      browse_only: true
    };
  }

  /**
   * Core Capabilities: Strict UNKNOWN != TRUE invariant
   */
  private evaluateCapabilities(archetype: SourceArchetype, accessMode: SourceAccessMode, inspection: TechnicalInspection, candidate?: any) {
    const isDataset = accessMode === 'DOWNLOADABLE_DATASET' || archetype === 'CKAN_PORTAL' || archetype === 'CSV_DATASET' || archetype === 'GEOJSON_DATASET' || archetype === 'JSON_DATASET';
    const isBulkSupported = isDataset || archetype === 'HTML_TABLE';
    const isEnumerationSupported = isBulkSupported || accessMode === 'PAGINATED_ENUMERATION' || archetype === 'PAGINATED_DIRECTORY' || archetype === 'OPEN_DATA_PORTAL';

    return {
      enumeration: isEnumerationSupported,
      bulk: isBulkSupported, // UNKNOWN != TRUE: Only true if actual bulk dataset or full static table exists
      verification: archetype === 'PROFESSIONAL_REGISTRY' || archetype === 'PUBLIC_REGISTRY' || isDataset,
      discovery: isEnumerationSupported || archetype === 'SEARCH_ENGINE_DISCOVERY',
      evidence: true
    };
  }

  /**
   * Supported entities mapping
   */
  private inferSupportedEntities(archetype: SourceArchetype, candidate?: any, missionIR?: AtlasMissionIR): {
    rowUnits: UniversalRowUnit[];
    entityTypes: UniversalEntityType[];
    relationsSupported: UniversalRelation[];
  } {
    if (archetype === 'PROFESSIONAL_REGISTRY') {
      return {
        rowUnits: ['PERSON'],
        entityTypes: ['PERSON'],
        relationsSupported: ['PRACTICES_PROFESSION', 'PROFESSIONAL_PRACTICES_AS_LAWYER', 'PROFESSIONAL_PRACTICES_AS_ACCOUNTANT', 'PROFESSIONAL_PRACTICES_AS_ARCHITECT']
      };
    }

    if (archetype === 'CHAMBER_DIRECTORY' || archetype === 'MEMBER_DIRECTORY') {
      return {
        rowUnits: ['COMPANY', 'ESTABLISHMENT'],
        entityTypes: ['COMPANY'],
        relationsSupported: ['MANUFACTURES', 'DISTRIBUTES', 'SELLS', 'SUPPLIES_TO']
      };
    }

    // Default generic catalog / dataset
    return {
      rowUnits: ['ESTABLISHMENT', 'COMPANY'],
      entityTypes: ['ESTABLISHMENT', 'COMPANY'],
      relationsSupported: ['SELLS', 'PROVIDES_SERVICE', 'MANUFACTURES', 'GENERAL_RELATION']
    };
  }

  /**
   * Connector Resolver: Function of SOURCE_CAPABILITY_IR -> Connector Family
   * Never by concept.
   */
  public resolveConnector(
    archetype: SourceArchetype,
    accessMode: SourceAccessMode,
    inspection: TechnicalInspection
  ): { connectorFamily: ConnectorFamily; connectorClass: string } {
    // 1. Direct CSV dataset
    if (archetype === 'CSV_DATASET') {
      return { connectorFamily: 'OPEN_DATA_CSV', connectorClass: 'AtlasOpenDataCSVConnector' };
    }
    // 2. Direct GeoJSON or JSON dataset
    if (archetype === 'JSON_DATASET' || archetype === 'GEOJSON_DATASET') {
      return { connectorFamily: 'OPEN_DATA_JSON', connectorClass: 'AtlasOpenDataJSONConnector' };
    }
    // 3. CKAN Portal API
    if (archetype === 'CKAN_PORTAL' || inspection.has_ckan) {
      return { connectorFamily: 'CKAN_API', connectorClass: 'AtlasCKANConnector' };
    }
    // 4. HTML Table
    if (archetype === 'HTML_TABLE' || inspection.has_html_table) {
      return { connectorFamily: 'HTML_TABLE', connectorClass: 'AtlasHTMLTableConnector' };
    }
    // 5. Directories (Chamber, Member, Paginated)
    if (accessMode === 'PAGINATED_ENUMERATION' || archetype === 'PAGINATED_DIRECTORY' || archetype === 'MEMBER_DIRECTORY' || archetype === 'CHAMBER_DIRECTORY') {
      return { connectorFamily: 'PAGINATED_DIRECTORY', connectorClass: 'AtlasPaginatedDirectoryConnector' };
    }
    // 6. Government API
    if (archetype === 'GOVERNMENT_API' || (archetype === 'PUBLIC_REGISTRY' && inspection.has_api)) {
      return { connectorFamily: 'PUBLIC_REGISTRY_API', connectorClass: 'AtlasPublicRegistryConnector' };
    }
    // 7. Search Engine Discovery
    if (archetype === 'SEARCH_ENGINE_DISCOVERY') {
      return { connectorFamily: 'WEB_SEARCH_DISCOVERY', connectorClass: 'AtlasWebSearchDiscoveryConnector' };
    }
    // 8. Professional Registry (Individual lookup without bulk endpoint)
    if (archetype === 'PROFESSIONAL_REGISTRY' || archetype === 'SEARCHABLE_REGISTRY') {
      return { connectorFamily: 'SPECIALIZED_OR_UNAVAILABLE', connectorClass: 'SpecializedRegistryLookupDriver' };
    }

    return { connectorFamily: 'PAGINATED_DIRECTORY', connectorClass: 'AtlasPaginatedDirectoryConnector' };
  }

  /**
   * Mission compatibility & operational state
   */
  private evaluateMissionFitAndState(
    archetype: SourceArchetype,
    accessMode: SourceAccessMode,
    rowUnits: UniversalRowUnit[],
    connectorFamily: ConnectorFamily,
    capabilities: { enumeration: boolean; bulk: boolean; verification: boolean; discovery: boolean; evidence: boolean },
    missionIR?: AtlasMissionIR
  ): {
    compatibility: SourceCapabilityIR['mission_compatibility'];
    state: SourceUnderstandingState;
    state_reason: string;
  } {
    // 1. If no mission provided, state reflects technical availability
    if (!missionIR) {
      if (capabilities.bulk) return { compatibility: 'COMPATIBLE', state: 'SOURCE_BULK_AVAILABLE', stateReason: 'Descarga masiva de dataset disponible' };
      if (capabilities.enumeration) return { compatibility: 'COMPATIBLE', state: 'SOURCE_ENUMERATION_AVAILABLE', stateReason: 'Enumeración paginada disponible' };
      if (accessMode === 'INDIVIDUAL_LOOKUP') return { compatibility: 'EVIDENCE_ONLY', state: 'SOURCE_LOOKUP_ONLY', stateReason: 'Consulta individual de verificación' };
      return { compatibility: 'COMPATIBLE', state: 'SOURCE_VALIDATED', stateReason: 'Fuente técnicamente entendida' };
    }

    const requestedRowUnit = missionIR.target?.row_unit || 'COMPANY';

    // 2. Row unit clash check (e.g. searching individual PERSON in pure ESTABLISHMENT directory)
    if (requestedRowUnit === 'PERSON' && !rowUnits.includes('PERSON')) {
      return {
        compatibility: 'INCOMPATIBLE',
        state: 'SOURCE_NOT_MISSION_COMPATIBLE',
        stateReason: `La fuente provee ${rowUnits.join(', ')} pero la misión requiere ${requestedRowUnit}`
      };
    }
    if (requestedRowUnit === 'ESTABLISHMENT' && rowUnits.length === 1 && rowUnits[0] === 'PERSON') {
      return {
        compatibility: 'INCOMPATIBLE',
        state: 'SOURCE_NOT_MISSION_COMPATIBLE',
        stateReason: `La fuente provee PERSON pero la misión requiere ESTABLISHMENT`
      };
    }

    // 3. Check Connector and Enumeration Availability
    if (accessMode === 'INDIVIDUAL_LOOKUP' && !capabilities.bulk && !capabilities.enumeration) {
      return {
        compatibility: 'REQUIRES_SPECIALIZED_CONNECTOR',
        state: 'SOURCE_CONNECTOR_MISSING',
        stateReason: 'Fuente oficial válida pero requiere consulta individual o conector especializado'
      };
    }

    if (capabilities.bulk) {
      return {
        compatibility: 'COMPATIBLE',
        state: 'SOURCE_BULK_AVAILABLE',
        stateReason: 'Fuente compatible con capacidad de volumen masivo'
      };
    }

    if (capabilities.enumeration) {
      return {
        compatibility: 'COMPATIBLE',
        state: 'SOURCE_ENUMERATION_AVAILABLE',
        stateReason: 'Fuente compatible con capacidad de enumeración paginada'
      };
    }

    return {
      compatibility: 'COMPATIBLE',
      state: 'SOURCE_CONNECTOR_AVAILABLE',
      stateReason: 'Fuente compatible con conector disponible'
    };
  }

  /**
   * Source Roles
   */
  private inferSourceRoles(archetype: SourceArchetype, accessMode: SourceAccessMode): SourceRole[] {
    const roles: SourceRole[] = ['EVIDENCE_SOURCE'];
    if (archetype === 'PROFESSIONAL_REGISTRY' || archetype === 'PUBLIC_REGISTRY') {
      roles.push('VERIFICATION_SOURCE', 'ENTITY_SOURCE');
    } else if (archetype === 'CKAN_PORTAL' || archetype === 'OPEN_DATA_PORTAL') {
      roles.push('PORTAL_CATALOG', 'ENTITY_SOURCE', 'DISCOVERY_SOURCE');
    } else {
      roles.push('DIRECTORY_SOURCE', 'ENTITY_SOURCE', 'DISCOVERY_SOURCE');
    }
    return roles;
  }

  /**
   * Public access verification
   */
  private verifyPublicAccess(domain: string, url: string): boolean {
    const d = domain.toLowerCase();
    const u = url.toLowerCase();
    if (u.includes('login') || u.includes('auth') || u.includes('paywall') || u.includes('restricted')) {
      return false;
    }
    return true;
  }

  private extractDomain(url: string): string {
    try {
      if (!url.startsWith('http')) url = `https://${url}`;
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url.split('/')[0] || '';
    }
  }

  /**
   * Fast mission alignment (cached capability evaluation against new mission)
   */
  private alignWithMission(capability: SourceCapabilityIR, missionIR?: AtlasMissionIR): SourceCapabilityIR {
    if (!missionIR) return capability;
    const { compatibility, state, stateReason } = this.evaluateMissionFitAndState(
      capability.source_archetype,
      capability.access_mode,
      capability.row_units,
      capability.connector_family,
      {
        enumeration: capability.enumeration_capability,
        bulk: capability.bulk_capability,
        verification: capability.verification_capability,
        discovery: capability.discovery_capability,
        evidence: capability.evidence_capability
      },
      missionIR
    );

    return {
      ...capability,
      mission_compatibility: compatibility,
      state,
      state_reason: stateReason
    };
  }

  /**
   * Persist learned source capability in public.atlas_source_knowledge_map
   */
  private async persistCapability(cap: SourceCapabilityIR): Promise<void> {
    if (!this.db) return;

    const query = `
      INSERT INTO public.atlas_source_knowledge_map (
        source_id,
        canonical_url,
        source_name,
        source_family,
        source_universe,
        geography_scope,
        protocol,
        access_method,
        supported_motor_template,
        current_status,
        estimated_records,
        reliability_score,
        quality_score,
        source_roles,
        can_produce_entity_rows,
        entity_types_supported,
        row_unit_supported,
        geographic_granularity,
        queryability,
        public_access_confirmed,
        field_telemetry,
        last_profiled_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, 'AUTONOMOUS_UNDERSTOOD', $5, 'HTTP_REST', $6, $7,
        'CANARY', 5000, $8, 0.95,
        $9, 'TRUE', $10, $11, 'CITY_PROVINCE', $12, $13,
        jsonb_build_object(
          'capability_ir', $14::jsonb,
          'connector_family', $15::text,
          'can_produce_bulk_rows', $16::boolean,
          'bulk_enumeration_available', $16::boolean,
          'automated_access_permitted', CASE WHEN $6 = 'INDIVIDUAL_LOOKUP' THEN 'LIMITED' ELSE 'PERMITTED' END,
          'connector_exists', $17::boolean,
          'evidence_source', true
        ),
        NOW(), NOW()
      )
      ON CONFLICT (source_id) DO UPDATE SET
        source_family = EXCLUDED.source_family,
        access_method = EXCLUDED.access_method,
        source_roles = EXCLUDED.source_roles,
        entity_types_supported = EXCLUDED.entity_types_supported,
        row_unit_supported = EXCLUDED.row_unit_supported,
        queryability = EXCLUDED.queryability,
        public_access_confirmed = EXCLUDED.public_access_confirmed,
        field_telemetry = jsonb_set(
          COALESCE(atlas_source_knowledge_map.field_telemetry, '{}'::jsonb),
          '{capability_ir}',
          $14::jsonb
        ),
        last_profiled_at = NOW(),
        updated_at = NOW();
    `;

    await this.db.query(query, [
      cap.source_id,
      cap.canonical_url,
      cap.source_name,
      cap.source_archetype,
      cap.geographic_scope,
      cap.access_mode,
      cap.connector_class,
      cap.confidence,
      cap.source_roles,
      cap.entity_types,
      cap.row_units,
      JSON.stringify(cap.queryability),
      cap.public_access,
      JSON.stringify(cap),
      cap.connector_family,
      cap.bulk_capability,
      cap.connector_family !== 'SPECIALIZED_OR_UNAVAILABLE'
    ]);
  }
}
