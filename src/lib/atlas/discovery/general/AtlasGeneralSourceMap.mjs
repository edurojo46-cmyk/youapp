/**
 * src/lib/atlas/discovery/general/AtlasGeneralSourceMap.mjs
 * 
 * ATLAS GENERAL SOURCE MAP (CONTROL PLANE)
 * 
 * Governing Principles:
 * 1. ONE GENERAL SOURCE MAP. MANY DOMAIN-SPECIFIC VIEWS.
 * 2. SOURCE ACCESS MAY BE SHARED. DOMAIN SEMANTICS MUST REMAIN ISOLATED.
 * 3. MAP ONCE. FETCH ONCE WHEN POSSIBLE. NORMALIZE ONCE. INTERPRET MANY TIMES.
 * 4. General Map is CONTROL PLANE (metadata, lineage, surfaces, policy, health).
 *    Zero PII. Zero domain-specific yield or ranking properties.
 */

export const NODE_TYPES = Object.freeze({
  SOURCE_ENTITY: 'SOURCE_ENTITY',
  SOURCE_SURFACE: 'SOURCE_SURFACE',
  SOURCE_ARCHETYPE: 'SOURCE_ARCHETYPE',
  QUERY_CAPABILITY: 'QUERY_CAPABILITY'
});

export const SOURCE_FAMILIES = Object.freeze({
  TAX_FISCAL: 'TAX_FISCAL',
  CORPORATE: 'CORPORATE',
  PROFESSIONAL: 'PROFESSIONAL',
  CADASTRE: 'CADASTRE',
  MUNICIPAL_PROPERTY: 'MUNICIPAL_PROPERTY',
  VIDEO: 'VIDEO',
  PROPERTY_REGISTRY: 'PROPERTY_REGISTRY'
});

export const LINEAGE_RELATIONS = Object.freeze({
  BELONGS_TO: 'BELONGS_TO',     // Surface -> Entity
  ALIAS_OF: 'ALIAS_OF',         // Node -> Node (Identity equivalence)
  MIRROR_OF: 'MIRROR_OF',       // Surface -> Surface (Replica/redundant mirror)
  DERIVED_FROM: 'DERIVED_FROM', // Surface -> Surface (e.g. Datastore API derived from raw CSV)
  SUPERSEDES: 'SUPERSEDES',     // Surface -> Surface (New version replacing old)
  REPLACES: 'REPLACES',         // Surface -> Surface
  ADJACENT_TO: 'ADJACENT_TO'    // Entity/Surface -> Entity/Surface (Related population/organization)
});

export const SHARED_ACQUISITION_CAPABILITIES = Object.freeze({
  HTTP_CLIENT: 'HTTP_CLIENT',
  CSV_STREAM_PARSER: 'CSV_STREAM_PARSER',
  JSON_FEED_PARSER: 'JSON_FEED_PARSER',
  CKAN_DATASTORE_CLIENT: 'CKAN_DATASTORE_CLIENT',
  REST_API_CLIENT: 'REST_API_CLIENT',
  RSS_FEED_PARSER: 'RSS_FEED_PARSER',
  SITEMAP_WALKER: 'SITEMAP_WALKER',
  SPARQL_CLIENT: 'SPARQL_CLIENT',
  OAI_PMH_HARVESTER: 'OAI_PMH_HARVESTER',
  HTML_DOM_PARSER: 'HTML_DOM_PARSER',
  RATE_LIMIT_BUCKET: 'RATE_LIMIT_BUCKET',
  DURABLE_CHECKPOINT: 'DURABLE_CHECKPOINT',
  BACKOFF_RETRY: 'BACKOFF_RETRY'
});

/**
 * Represents an authoritative publishing organization or platform
 */
export class AtlasSourceEntity {
  constructor(data) {
    this.node_type = NODE_TYPES.SOURCE_ENTITY;
    this.source_entity_id = data.source_entity_id;
    this.name = data.name;
    this.organization_type = data.organization_type; // GOVERNMENT, ACADEMIC, CIVIC, ENTERPRISE, PLATFORM
    this.country = data.country || 'AR';
    this.geographic_scope = data.geographic_scope;
    this.canonical_url = data.canonical_url;
    this.authority_type = data.authority_type;
    this.description = data.description || '';
    this.surfaces = []; // IDs of bound surfaces
    Object.freeze(this);
  }
}

/**
 * Represents a concrete technical acquisition surface
 */
export class AtlasSourceSurface {
  constructor(data) {
    this.node_type = NODE_TYPES.SOURCE_SURFACE;
    this.source_surface_id = data.source_surface_id;
    this.source_entity_id = data.source_entity_id;
    this.surface_name = data.surface_name;
    
    // Technical Specification
    this.canonical_url = data.canonical_url;
    this.protocol = data.protocol; // REST_API, CSV_STREAM, SPARQL, OAI_PMH, RSS_FEED, HTML_DIRECTORY
    this.format = data.format;     // CSV, JSON, XML, HTML, SPARQL_JSON
    this.access_mode = data.access_mode; // BULK_OPEN, API_OPEN, FEED_OPEN, QUERY_ONLY, WEB_CRAWL
    
    // Policy & Access (Defined per surface!)
    this.policy_status = data.policy_status; // APPROVED, REJECTED, RESTRICTED, UNKNOWN
    this.machine_access_status = data.machine_access_status; // YES, NO, UNKNOWN
    this.auth_requirement = data.auth_requirement || 'NONE'; // NONE, API_KEY, OAUTH, HUMAN_SESSION, CAPTCHA
    this.rate_limit = data.rate_limit || 'UNSPECIFIED';
    this.robots_policy_status = data.robots_policy_status || 'UNKNOWN';
    this.license = data.license || 'UNKNOWN';
    
    // Temporal Versioning & Lineage
    this.first_seen_at = data.first_seen_at || new Date().toISOString();
    this.last_verified_at = data.last_verified_at || null;
    this.surface_version = data.surface_version || '1.0.0';
    this.schema_fingerprint = data.schema_fingerprint || null;
    
    // Acquisition Driver & Capabilities
    this.connector_capability = data.connector_capability;
    this.motor_template = data.motor_template;
    this.motor_template_status = data.motor_template_status; // CERTIFIED, IMPLEMENTED_UNCERTIFIED, LEGACY
    this.logical_acquisition_motor_id = data.logical_acquisition_motor_id;
    this.checkpoint_strategy = data.checkpoint_strategy;
    
    // Operational Health
    this.health_status = data.health_status || 'UNKNOWN'; // HEALTHY, DEGRADED, BLOCKED, DORMANT
    this.last_probe_at = data.last_probe_at || null;
    this.last_success_at = data.last_success_at || null;
    this.physical_probe_verified = data.physical_probe_verified || false;

    Object.freeze(this);
  }

  /**
   * Evaluates Strict Machine-Readiness (Closure 15)
   */
  isMachineReady() {
    return (
      this.node_type === NODE_TYPES.SOURCE_SURFACE &&
      this.physical_probe_verified === true &&
      this.canonical_url !== null &&
      this.machine_access_status === 'YES' &&
      this.policy_status === 'APPROVED' &&
      ['CERTIFIED', 'IMPLEMENTED_UNCERTIFIED'].includes(this.motor_template_status) &&
      this.checkpoint_strategy !== null &&
      this.checkpoint_strategy !== 'NONE'
    );
  }
}

/**
 * Represents a generalized source concept without a single pinned URL
 */
export class AtlasSourceArchetype {
  constructor(data) {
    this.node_type = NODE_TYPES.SOURCE_ARCHETYPE;
    this.archetype_id = data.archetype_id;
    this.name = data.name;
    this.target_domain = data.target_domain;
    this.pattern_description = data.pattern_description;
    this.typical_protocol = data.typical_protocol;
    this.machine_ready = false; // Archetypes are NEVER machine-ready by definition
    Object.freeze(this);
  }
}

/**
 * Represents a dynamic query construction capability across third-party engines
 */
export class AtlasQueryCapability {
  constructor(data) {
    this.node_type = NODE_TYPES.QUERY_CAPABILITY;
    this.query_capability_id = data.query_capability_id;
    this.name = data.name;
    this.target_platform = data.target_platform;
    this.query_strategy = data.query_strategy; // SEARCH_ENGINE_SITE_SEARCH
    this.machine_ready = false; // Query capabilities are search formulas, not machine surfaces
    Object.freeze(this);
  }
}

/**
 * AtlasGeneralSourceMap
 * Central Control Plane registry for all entities, surfaces, archetypes, and lineage relations.
 */
export class AtlasGeneralSourceMap {
  constructor() {
    this.entities = new Map();   // source_entity_id -> AtlasSourceEntity
    this.surfaces = new Map();   // source_surface_id -> AtlasSourceSurface
    this.archetypes = new Map(); // archetype_id -> AtlasSourceArchetype
    this.queryCapabilities = new Map(); // query_capability_id -> AtlasQueryCapability
    this.lineageEdges = [];      // Array of { from_id, to_id, relation, reason }
    this.domainMetrics = new Map(); // key: `${source_surface_id}:${domain}` -> metrics object
    this.complementarityEdges = []; // Array of { missing_evidence, target_source_family, rationale, registered_at }
  }

  registerEntity(data) {
    const entity = new AtlasSourceEntity(data);
    this.entities.set(entity.source_entity_id, entity);
    return entity;
  }

  registerSurface(data) {
    const surface = new AtlasSourceSurface(data);
    this.surfaces.set(surface.source_surface_id, surface);
    
    // Bind to entity
    const entity = this.entities.get(surface.source_entity_id);
    if (entity && !entity.surfaces.includes(surface.source_surface_id)) {
      entity.surfaces.push(surface.source_surface_id);
    }

    // Default lineage edge
    this.addLineageEdge(surface.source_surface_id, surface.source_entity_id, LINEAGE_RELATIONS.BELONGS_TO, 'Surface belongs to authoritative publisher entity.');
    return surface;
  }

  registerArchetype(data) {
    const archetype = new AtlasSourceArchetype(data);
    this.archetypes.set(archetype.archetype_id, archetype);
    return archetype;
  }

  registerQueryCapability(data) {
    const qc = new AtlasQueryCapability(data);
    this.queryCapabilities.set(qc.query_capability_id, qc);
    return qc;
  }

  addLineageEdge(fromId, toId, relation, reason = '') {
    this.lineageEdges.push(Object.freeze({ from_id: fromId, to_id: toId, relation, reason }));
  }

  addComplementarityEdge(missingEvidence, targetFamily, rationale = '') {
    this.complementarityEdges.push(Object.freeze({
      missing_evidence: missingEvidence,
      target_source_family: targetFamily,
      rationale,
      registered_at: new Date().toISOString()
    }));
  }

  recordDomainMetrics(surfaceId, domain, metrics) {
    const key = `${surfaceId}:${domain}`;
    this.domainMetrics.set(key, Object.freeze({ ...metrics, surface_id: surfaceId, domain, updated_at: new Date().toISOString() }));
  }

  getDomainMetrics(surfaceId, domain) {
    return this.domainMetrics.get(`${surfaceId}:${domain}`) || null;
  }

  /**
   * Computes General Map integrity and taxonomy metrics
   */
  getIntegrityMetrics() {
    const allSurfaces = Array.from(this.surfaces.values());
    const machineReadySurfaces = allSurfaces.filter(s => s.isMachineReady());
    const certifiedTemplateSurfaces = machineReadySurfaces.filter(s => s.motor_template_status === 'CERTIFIED');
    const uncertifiedTemplateSurfaces = machineReadySurfaces.filter(s => s.motor_template_status === 'IMPLEMENTED_UNCERTIFIED');

    // Lineage breakdown
    const aliasCount = this.lineageEdges.filter(e => e.relation === LINEAGE_RELATIONS.ALIAS_OF).length;
    const mirrorCount = this.lineageEdges.filter(e => e.relation === LINEAGE_RELATIONS.MIRROR_OF).length;
    const derivationCount = this.lineageEdges.filter(e => e.relation === LINEAGE_RELATIONS.DERIVED_FROM || e.relation === LINEAGE_RELATIONS.ADJACENT_TO).length;

    // Orphans check
    const surfacesWithMotor = allSurfaces.filter(s => !!s.logical_acquisition_motor_id);
    const surfacesWithoutMotor = allSurfaces.filter(s => !s.logical_acquisition_motor_id);

    return {
      total_source_entities: this.entities.size,
      total_physical_source_surfaces: allSurfaces.length,
      total_source_archetypes: this.archetypes.size,
      total_query_capabilities: this.queryCapabilities.size,
      total_logical_acquisition_motors: surfacesWithMotor.length,
      physical_surfaces_with_motor: surfacesWithMotor.length,
      physical_surfaces_without_motor: surfacesWithoutMotor.length,
      no_orphan_physical_surfaces: surfacesWithoutMotor.length === 0,
      
      machine_ready_physical_surfaces: machineReadySurfaces.length,
      machine_ready_with_certified_template: certifiedTemplateSurfaces.length,
      machine_ready_with_uncertified_template: uncertifiedTemplateSurfaces.length,
      
      shared_acquisition_capabilities: Object.keys(SHARED_ACQUISITION_CAPABILITIES).length,
      
      source_alias_relationships: aliasCount,
      source_mirror_relationships: mirrorCount,
      source_derivation_relationships: derivationCount,
      complementarity_relationships: this.complementarityEdges.length
    };
  }
}
