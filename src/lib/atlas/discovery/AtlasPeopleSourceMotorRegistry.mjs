/**
 * src/lib/atlas/discovery/AtlasPeopleSourceMotorRegistry.mjs
 * 
 * ATLAS PEOPLE: SOURCE-TO-MOTOR INTELLIGENCE V1
 * 
 * Architectural Invariants:
 * 1. 1 SOURCE = 1 LOGICAL MOTOR, but N SOURCES != N CODEBASES
 * 2. Three Formal Levels: SOURCE (physical/logical origin) -> LOGICAL MOTOR (source-specific operational instance) -> WORKLOAD (concrete partition/slice)
 * 3. motorRegistry.mjs is the SSOT of templates and template statuses.
 * 4. AtlasPeopleSourceMotorRegistry is the SSOT of People source-to-logical-motor operational mappings.
 * 5. PEOPLE / VIDEO ISOLATION: ATLAS PEOPLE != ATLAS VIDEO. Zero video harvester reuse.
 * 6. Search V1 is frozen. Discovery does not conceptually depend on Search.
 */

import {
  MOTOR_STATES,
  TEMPLATE_STATUSES,
  MOTOR_TEMPLATES,
  POLICY_STATUSES
} from './motorRegistry.mjs';

export const SOURCE_INTELLIGENCE_STATUSES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  DISCOVERED: 'DISCOVERED',
  PROFILED: 'PROFILED',
  CANARY_MEASURED: 'CANARY_MEASURED',
  CERTIFIED: 'CERTIFIED',
  SATURATED: 'SATURATED',
  EXHAUSTED: 'EXHAUSTED',
  NO_PERSON_VALUE: 'NO_PERSON_VALUE',
  HUMAN_ONLY: 'HUMAN_ONLY',
  POLICY_BLOCKED: 'POLICY_BLOCKED'
});

export const ACCESS_PATTERNS = Object.freeze({
  BULK_DOWNLOAD: 'BULK_DOWNLOAD',
  OPEN_REST_API: 'OPEN_REST_API',
  SPARQL_ENDPOINT: 'SPARQL_ENDPOINT',
  OAI_PMH_XML: 'OAI_PMH_XML',
  CKAN_DATASTORE_API: 'CKAN_DATASTORE_API',
  SYNDICATED_FEED: 'SYNDICATED_FEED',
  SEARCH_ENGINE_SCRAPING: 'SEARCH_ENGINE_SCRAPING',
  HUMAN_QUERY_FORM_ONLY: 'HUMAN_QUERY_FORM_ONLY',
  CAPTCHA_CHALLENGE_GATE: 'CAPTCHA_CHALLENGE_GATE',
  AUTHENTICATED_PORTAL_ONLY: 'AUTHENTICATED_PORTAL_ONLY'
});

/**
 * Definition of a Source-to-Logical-Motor Operational Registration
 */
export class AtlasPeopleSourceMotorRegistration {
  constructor(data) {
    // Validate template exists in SSOT
    if (!MOTOR_TEMPLATES[data.motor_template]) {
      throw new Error(`INVALID_TEMPLATE: Template '${data.motor_template}' is not registered in motorRegistry.mjs SSOT.`);
    }

    // Three Formal Levels
    this.source_id = data.source_id;
    this.source_instance_id = data.source_instance_id;
    this.logical_motor_id = data.logical_motor_id;
    this.source_name = data.source_name;
    
    // Taxonomy & Metadata
    this.population_domain = data.population_domain;
    this.geographic_scope = data.geographic_scope;
    this.source_class = data.source_class;
    this.canonical_source = data.canonical_source;
    this.access_mode = data.access_mode;
    this.protocol = data.protocol;
    
    // Motor Template Reference (SSOT reference)
    this.motor_template = data.motor_template;
    this.template_status = MOTOR_TEMPLATES[data.motor_template].status;
    
    // Access & Policy
    this.machine_access_status = data.machine_access_status; // YES, NO, UNKNOWN
    this.policy_status = data.policy_status; // APPROVED, REJECTED, UNKNOWN, RESTRICTED
    this.checkpoint_strategy = data.checkpoint_strategy;
    this.rate_budget = data.rate_budget; // req/sec or req/min
    
    // Depth & Yield metrics (UNKNOWN != 0)
    this.depth_known = data.depth_known ?? 'UNKNOWN';
    this.depth_remaining = data.depth_remaining ?? 'UNKNOWN';
    this.person_yield = data.person_yield ?? 'UNKNOWN';
    this.net_new_yield = data.net_new_yield ?? 'UNKNOWN';
    this.overlap_rate = data.overlap_rate ?? 'UNKNOWN';
    this.delivery_rate = data.delivery_rate ?? 'UNKNOWN';
    
    // Operational State
    this.last_canary_at = data.last_canary_at ?? null;
    this.last_success_at = data.last_success_at ?? null;
    this.motor_state = data.motor_state ?? MOTOR_STATES.DISCOVERED;
    this.source_intelligence_status = data.source_intelligence_status ?? SOURCE_INTELLIGENCE_STATUSES.UNKNOWN;
    
    // Source Scout Learning Attributes (Section 9)
    this.scout_learning = Object.freeze({
      access_pattern: data.access_pattern ?? ACCESS_PATTERNS.HUMAN_QUERY_FORM_ONLY,
      public_api_present: data.public_api_present ?? false,
      bulk_download_present: data.bulk_download_present ?? false,
      query_form_only: data.query_form_only ?? false,
      captcha_present: data.captcha_present ?? false,
      auth_required: data.auth_required ?? false,
      robots_policy_status: data.robots_policy_status ?? 'UNKNOWN',
      documented_api: data.documented_api ?? false,
      undocumented_endpoint: data.undocumented_endpoint ?? false,
      machine_access_confidence: data.machine_access_confidence ?? 0.5
    });

    // Subsystem Value Contracts
    this.news_contract = data.news_contract ? Object.freeze({ ...data.news_contract }) : null;
    this.social_contract = data.social_contract ? Object.freeze({ ...data.social_contract }) : null;

    Object.freeze(this);
  }

  /**
   * Field Controller Value Signal Contract (Section 8 & 17)
   */
  getFieldControllerSignal() {
    return {
      source_id: this.source_id,
      source_instance_id: this.source_instance_id,
      logical_motor_id: this.logical_motor_id,
      motor_template: this.motor_template,
      template_status: this.template_status,
      motor_state: this.motor_state,
      
      // Throughput & Value Signals (UNKNOWN if unmeasured)
      raw_records_per_second: this.delivery_rate === 'UNKNOWN' ? 'UNKNOWN' : Number(this.delivery_rate),
      person_candidates_per_second: (this.delivery_rate === 'UNKNOWN' || this.person_yield === 'UNKNOWN') 
        ? 'UNKNOWN' 
        : Math.round(Number(this.delivery_rate) * (Number(this.person_yield) / 100) * 100) / 100,
      net_new_persons_per_second: (this.delivery_rate === 'UNKNOWN' || this.person_yield === 'UNKNOWN' || this.net_new_yield === 'UNKNOWN') 
        ? 'UNKNOWN' 
        : Math.round(Number(this.delivery_rate) * (Number(this.person_yield) / 100) * (Number(this.net_new_yield) / 100) * 100) / 100,
      
      // Primary allocation signal: Net-New Canonical Searchable Per Second
      net_new_canonical_searchable_per_second: (this.delivery_rate === 'UNKNOWN' || this.person_yield === 'UNKNOWN' || this.net_new_yield === 'UNKNOWN') 
        ? 'UNKNOWN' 
        : Math.round(Number(this.delivery_rate) * (Number(this.person_yield) / 100) * (Number(this.net_new_yield) / 100) * 100) / 100,
      
      person_yield: this.person_yield,
      net_new_yield: this.net_new_yield,
      overlap_rate: this.overlap_rate,
      depth_remaining: this.depth_remaining,
      error_rate: this.motor_state === MOTOR_STATES.FAILED ? 1.0 : 0.0,
      policy_status: this.policy_status,
      machine_access_status: this.machine_access_status,
      field_controller_compatible: [MOTOR_STATES.CERTIFIED, MOTOR_STATES.ACTIVE, MOTOR_STATES.CANARY].includes(this.motor_state)
    };
  }
}

/**
 * AtlasPeopleSourceMotorRegistry
 * Central Registry of all People Sources and their Logical Motor Bindings.
 */
export class AtlasPeopleSourceMotorRegistry {
  constructor() {
    this.registrations = new Map(); // source_id -> AtlasPeopleSourceMotorRegistration
    this.aliases = new Map();       // alias_id -> primary_source_id
    this.duplicateDetections = [];
  }

  register(data) {
    const reg = new AtlasPeopleSourceMotorRegistration(data);
    if (this.registrations.has(reg.source_id)) {
      throw new Error(`DUPLICATE_SOURCE_REGISTRATION: Source '${reg.source_id}' is already registered.`);
    }
    this.registrations.set(reg.source_id, reg);
    return reg;
  }

  registerAlias(aliasId, primarySourceId, reason) {
    this.aliases.set(aliasId, primarySourceId);
    this.duplicateDetections.push({
      alias_id: aliasId,
      primary_source_id: primarySourceId,
      classification: 'POTENTIAL_SOURCE_ALIAS',
      reason
    });
  }

  get(sourceId) {
    const resolvedId = this.aliases.get(sourceId) || sourceId;
    return this.registrations.get(resolvedId);
  }

  getAll() {
    return Array.from(this.registrations.values());
  }

  /**
   * Generates the comprehensive Source-to-Motor Coverage Matrix
   */
  getCoverageMatrix() {
    const all = this.getAll();
    const templateCounts = {
      CERTIFIED: 0,
      IMPLEMENTED_UNCERTIFIED: 0,
      LEGACY: 0,
      PLANNED: 0,
      MISSING: 0
    };

    let sourcesWithMotor = 0;
    let machineReady = 0;
    let canaryMeasured = 0;
    let unknownYield = 0;
    let policyBlocked = 0;
    let humanOnly = 0;
    let fieldControllerCompatible = 0;
    let newsMotors = 0;
    let socialMotors = 0;

    for (const m of all) {
      if (m.logical_motor_id) sourcesWithMotor++;
      if (m.template_status in templateCounts) {
        templateCounts[m.template_status]++;
      }
      if (m.machine_access_status === 'APPROVED' || m.machine_access_status === 'YES') machineReady++;
      if (m.last_canary_at) canaryMeasured++;
      if (m.net_new_yield === 'UNKNOWN') unknownYield++;
      if (m.policy_status === POLICY_STATUSES.REJECTED || m.motor_state === MOTOR_STATES.POLICY_BLOCKED) policyBlocked++;
      if (m.motor_state === MOTOR_STATES.HUMAN_ONLY || m.scout_learning.query_form_only) humanOnly++;
      if (m.getFieldControllerSignal().field_controller_compatible) fieldControllerCompatible++;
      if (m.news_contract) newsMotors++;
      if (m.social_contract) socialMotors++;
    }

    return {
      total_existing_people_sources: all.length,
      total_logical_motors: sourcesWithMotor,
      sources_with_logical_motor: sourcesWithMotor,
      sources_without_logical_motor: all.length - sourcesWithMotor,
      sources_with_multiple_motor_mappings: 0,
      orphan_logical_motors: 0,
      source_to_motor_1_to_1_pass: sourcesWithMotor === all.length,
      
      template_status_counts: templateCounts,
      templates_referenced: Array.from(new Set(all.map(m => m.motor_template))),
      
      machine_ready_motors: machineReady,
      canary_measured_motors: canaryMeasured,
      unknown_yield_motors: unknownYield,
      policy_blocked_motors: policyBlocked,
      human_only_sources: humanOnly,
      field_controller_compatible_motors: fieldControllerCompatible,
      
      news_logical_motors: newsMotors,
      social_logical_motors: socialMotors,
      
      semantic_duplicate_detections: this.duplicateDetections
    };
  }
}
